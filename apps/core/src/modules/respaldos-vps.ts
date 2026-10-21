/**
 * Crear respaldos en el VPS desde Mi Setup: una carpeta, todo Pterodactyl, la base de datos
 * de Mi Setup o el VPS completo. Se arman con tar/pg_dump por SSH y se dejan en
 * /opt/mi-setup/respaldos-manuales. Corren en segundo plano en el VPS (aunque cierres la app):
 * mientras avanzan el archivo termina en «.parte»; al acabar se renombra, y si falla queda un «.error».
 * Solo la cuenta maestra; borrar y descargar piden reautenticación fuerte.
 *
 * También: restaurar (en una carpeta aparte para sacar lo que necesites, o en
 * su lugar escribiendo RESTAURAR; antes de restaurar la base se hace un
 * respaldo de seguridad) y respaldos automáticos (diarios o semanales,
 * guardando solo los últimos N).
 */
import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, type ModuleDeps } from "./common.js";
import { getSetting, setSetting } from "./settings.js";
import type { Servidores } from "./vps/servidores.js";
import { abrirSftp, citar, ejecutar } from "./vps/ssh.js";

export const DIR_RESPALDOS = "/opt/mi-setup/respaldos-manuales";
const NOMBRE_ARCHIVO = /^[A-Za-z0-9][\w.-]{2,120}\.(tar\.gz|sql\.gz)$/;
const RUTA_CARPETA = /^(?:\/[A-Za-z0-9 _.@+-]+)+$/;
const PROHIBIDAS = ["/proc", "/sys", "/dev", "/run"];

/** Lo que NO entra al respaldo completo: se reconstruye solo o no sirve (imágenes de Docker, caché, temporales). */
export const EXCLUIDOS_VPS = [
  "/proc",
  "/sys",
  "/dev",
  "/run",
  "/tmp",
  "/var/tmp",
  "/mnt",
  "/media",
  "/lost+found",
  "/swapfile",
  "/snap",
  "/var/cache",
  "/var/lib/docker/overlay2",
  "/var/lib/docker/image",
  "/var/lib/docker/containers",
  "/var/lib/docker/buildkit",
  "/var/lib/containerd",
  DIR_RESPALDOS,
];

export type TipoRespaldo = "carpeta" | "vps" | "base" | "pterodactyl";

const sello = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");

export function validarCarpeta(ruta: string): string {
  const limpia = ruta.trim().replace(/\/+$/, "");
  if (!RUTA_CARPETA.test(limpia) || limpia.split("/").some((p) => p === "..") || limpia === "") throw new HttpError(400, "Escribe una carpeta del VPS con ruta completa (ej. /opt/mi-setup)");
  if (PROHIBIDAS.some((p) => limpia === p || limpia.startsWith(`${p}/`))) throw new HttpError(400, "Esa carpeta no se puede respaldar");
  return limpia;
}

/** Script de bash que hace el respaldo; se lanza con nohup para que siga aunque se cierre la conexión. */
export function scriptRespaldo(tipo: TipoRespaldo, nombre: string, opciones: { ruta?: string } = {}): string {
  const destino = `${DIR_RESPALDOS}/${nombre}`;
  const parte = citar(`${destino}.parte`);
  const err = citar(`${destino}.error.tmp`);
  let trabajo: string;
  if (tipo === "base") {
    // pg_dump dentro del contenedor de la base (usa sus propias variables de entorno).
    trabajo = `docker exec misetup-db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' 2>${err} | gzip > ${parte}`;
  } else if (tipo === "pterodactyl") {
    // Archivos de los servidores de juego (Wings), configuración de Wings y archivos del panel; más la base del panel si hay mysqldump.
    trabajo = [
      `PANEL_SQL=${citar(`${DIR_RESPALDOS}/.panel-${nombre}.sql`)}`,
      `(command -v mysqldump >/dev/null 2>&1 && mysqldump --single-transaction panel > "$PANEL_SQL" 2>/dev/null) || true`,
      `ITEMS=""; for d in /var/lib/pterodactyl/volumes /etc/pterodactyl /var/www/pterodactyl "$PANEL_SQL"; do [ -e "$d" ] && ITEMS="$ITEMS $d"; done`,
      `[ -n "$ITEMS" ] || { echo "No encontré Pterodactyl en este VPS (volumes, /etc/pterodactyl o el panel)" > ${err}; exit 2; }`,
      `tar -czf ${parte} --warning=no-file-changed $ITEMS 2>${err}`,
      `c=$?; rm -f "$PANEL_SQL"; exit $c`,
    ].join("\n");
  } else if (tipo === "vps") {
    // Con «-C / .» tar guarda los nombres como ./ruta, así que las exclusiones llevan el mismo prefijo.
    const exclusiones = EXCLUIDOS_VPS.map((e) => `--exclude=${citar(`.${e}`)}`).join(" ");
    trabajo = `tar -czf ${parte} --warning=no-file-changed ${exclusiones} -C / . 2>${err}`;
  } else {
    const ruta = validarCarpeta(opciones.ruta ?? "");
    trabajo = `tar -czf ${parte} --warning=no-file-changed -C / ${citar(ruta.replace(/^\//, ""))} 2>${err}`;
  }
  // tar devuelve 1 cuando un archivo cambió mientras se leía (normal en un VPS encendido): cuenta como éxito.
  return [
    "set -o pipefail",
    `mkdir -p ${citar(DIR_RESPALDOS)}`,
    "(",
    trabajo,
    ")",
    "c=$?",
    `if [ $c -le 1 ]; then mv ${parte} ${citar(destino)}; rm -f ${err}; else mv ${err} ${citar(`${destino}.error`)}; rm -f ${parte}; fi`,
  ].join("\n");
}

export function baseDeNombre(tipo: TipoRespaldo, ruta?: string): string {
  return tipo === "carpeta" ? (ruta ?? "carpeta").split("/").filter(Boolean).pop()!.replace(/[^\w.-]/g, "_") : tipo === "vps" ? "vps-completo" : tipo === "base" ? "base-mi-setup" : "pterodactyl";
}

export function nombreRespaldo(tipo: TipoRespaldo, ahora: Date, ruta?: string, prefijo = ""): string {
  return `${prefijo}${baseDeNombre(tipo, ruta)}-${sello(ahora)}.${tipo === "base" ? "sql.gz" : "tar.gz"}`;
}

// ---------------------------------------------------------------- restaurar

export const DIR_RESTAURADOS = "/opt/mi-setup/restaurados";

/** Qué se puede restaurar en su lugar: carpetas, Pterodactyl y la base (el VPS completo solo aparte). */
export function sePuedeEnSuLugar(nombre: string): boolean {
  return !/^(auto-)?vps-completo-/.test(nombre);
}

/** Script de restauración (corre con nohup; deja «.restaurando» mientras avanza y «.restaurar-error» si falla). */
export function scriptRestaurar(nombre: string, modo: "aparte" | "lugar", ahora: Date): string {
  if (!NOMBRE_ARCHIVO.test(nombre)) throw new HttpError(400, "Nombre inválido");
  const origen = citar(`${DIR_RESPALDOS}/${nombre}`);
  const marca = citar(`${DIR_RESPALDOS}/${nombre}.restaurando`);
  const err = citar(`${DIR_RESPALDOS}/${nombre}.restaurar-error`);
  const esBase = nombre.endsWith(".sql.gz");
  let trabajo: string;
  if (modo === "aparte") {
    const destino = `${DIR_RESTAURADOS}/${nombre.replace(/\.(tar|sql)\.gz$/, "")}`;
    trabajo = esBase
      ? `mkdir -p ${citar(destino)} && gunzip -c ${origen} > ${citar(`${destino}/base.sql`)}`
      : `mkdir -p ${citar(destino)} && tar -xzf ${origen} -C ${citar(destino)}`;
  } else if (esBase) {
    if (!sePuedeEnSuLugar(nombre)) throw new HttpError(400, "Ese respaldo solo se restaura aparte");
    // Respaldo de seguridad de cómo está ahora, luego se cambia la base completa y se reinicia Mi Setup.
    const seguridad = citar(`${DIR_RESPALDOS}/antes-de-restaurar-${sello(ahora)}.sql.gz`);
    trabajo = [
      `docker exec misetup-db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > ${seguridad}`,
      `docker exec misetup-db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'`,
      `gunzip -c ${origen} | docker exec -i misetup-db sh -c 'psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null`,
      "docker restart misetup-core >/dev/null",
    ].join(" && \\\n");
  } else {
    if (!sePuedeEnSuLugar(nombre)) throw new HttpError(400, "El VPS completo solo se restaura aparte (para sacar lo que necesites)");
    trabajo = `tar -xzf ${origen} -C /`;
  }
  return ["set -o pipefail", `touch ${marca}`, `rm -f ${err}`, "(", trabajo, `) 2>${err}.tmp`, `if [ $? -eq 0 ]; then rm -f ${err}.tmp; else mv ${err}.tmp ${err}; fi`, `rm -f ${marca}`].join("\n");
}

// ---------------------------------------------------------------- automáticos

export interface Programacion {
  id: string;
  servidorId: string;
  tipo: TipoRespaldo;
  ruta?: string;
  frecuencia: "diario" | "semanal";
  /** 0 = domingo … 6 = sábado (solo semanal). */
  dia: number;
  hora: number;
  conservar: number;
  zona: string;
  activo: boolean;
  ultimo: string | null;
  ultimoError: string | null;
}

const CLAVE_PROGRAMACIONES = "respaldos-automaticos";

/** Fecha, hora y día de la semana en la zona horaria de quien lo programó. */
export function enZona(fecha: Date, zona: string): { dia: string; hora: number; semana: number } {
  let partes: Intl.DateTimeFormatPart[];
  try {
    partes = new Intl.DateTimeFormat("en-US", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(fecha);
  } catch {
    partes = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" }).formatToParts(fecha);
  }
  const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
  const semana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(v("weekday"));
  return { dia: `${v("year")}-${v("month")}-${v("day")}`, hora: Number(v("hour")), semana };
}

/** ¿Ya le toca? Una vez por día (o por semana) a partir de la hora elegida. */
export function tocaRespaldo(p: Pick<Programacion, "frecuencia" | "dia" | "hora" | "zona" | "activo" | "ultimo">, ahora: Date): boolean {
  if (!p.activo) return false;
  const hoy = enZona(ahora, p.zona);
  if (hoy.hora < p.hora) return false;
  if (p.frecuencia === "semanal" && hoy.semana !== p.dia) return false;
  if (!p.ultimo) return true;
  return enZona(new Date(p.ultimo), p.zona).dia !== hoy.dia;
}

async function leerProgramaciones(deps: Pick<ModuleDeps, "db">): Promise<Programacion[]> {
  return (await getSetting<Programacion[]>(deps.db, CLAVE_PROGRAMACIONES)) ?? [];
}

/** Lanza los respaldos automáticos que tocan y borra los viejos (deja los últimos N). */
export async function respaldosAutomaticos(deps: ModuleDeps, servidores: Servidores): Promise<void> {
  const lista = await leerProgramaciones(deps);
  let cambio = false;
  for (const p of lista) {
    if (!tocaRespaldo(p, deps.now())) continue;
    cambio = true;
    p.ultimo = deps.now().toISOString();
    try {
      const nombre = nombreRespaldo(p.tipo, deps.now(), p.ruta, "auto-");
      const prefijo = `auto-${baseDeNombre(p.tipo, p.ruta)}-`;
      const ext = p.tipo === "base" ? "sql.gz" : "tar.gz";
      const limpiar = `ls -1t ${citar(DIR_RESPALDOS)}/${prefijo}*.${ext} 2>/dev/null | tail -n +${p.conservar + 1} | xargs -r rm -f`;
      const script = `${scriptRespaldo(p.tipo, nombre, p.ruta ? { ruta: p.ruta } : {})}\n${limpiar}`;
      await servidores.usar(p.servidorId, async (c, s) => {
        const sudo = s.username === "root" ? "" : "sudo -n ";
        const disco = await ejecutar(c, "df -B1 --output=avail / | tail -1", { timeoutMs: 15_000 });
        if (Number(disco.salida.trim()) < 2 * 1024 ** 3) throw new HttpError(400, "Menos de 2 GB libres en el VPS");
        const r = await ejecutar(c, `${sudo}nohup bash -c ${citar(script)} >/dev/null 2>&1 & echo lanzado`, { timeoutMs: 20_000 });
        if (!r.salida.includes("lanzado")) throw new HttpError(502, "No se pudo iniciar");
      });
      p.ultimoError = null;
      await deps.audit.record({ actorType: "sistema", action: "respaldo_automatico", module: "respaldos", target: nombre, outcome: "ok" });
    } catch (err) {
      p.ultimoError = err instanceof Error ? err.message.slice(0, 200) : "Error";
      await deps.notifier.send({ title: "Respaldo automático falló", message: `${p.tipo}${p.ruta ? ` ${p.ruta}` : ""}: ${p.ultimoError}`, priority: 4 }).catch(() => undefined);
    }
  }
  if (cambio) await setSetting(deps.db, CLAVE_PROGRAMACIONES, lista, deps.now());
}

export function respaldosVpsRoutes(deps: ModuleDeps, servidores: Servidores) {
  const ver = { config: { acceso: { modulo: "respaldos" as const, nivel: "lectura" as const } } };
  const crear = { config: { acceso: { modulo: "respaldos" as const, nivel: "escritura" as const, reauth: "pin" as const } } };
  const fuerte = { config: { acceso: { modulo: "respaldos" as const, nivel: "escritura" as const, reauth: "fuerte" as const } } };

  const soloMaestra = (request: Parameters<typeof currentUser>[0]) => {
    const u = currentUser(request);
    if (u.role !== "maestra") throw new HttpError(403, "Solo la cuenta maestra crea respaldos del VPS", "sin_permiso");
    return u;
  };
  const servidorId = z.object({ servidorId: z.string().uuid() });

  return async function (app: FastifyInstance): Promise<void> {
    /**
     * Respaldo diario de la base de Mi Setup (deploy/respaldo.sh → /opt/mi-setup/backups, la carpeta
     * que ve «Base de datos de Mi Setup»): correrlo ahora y/o dejarlo programado en el cron del VPS.
     */
    app.post("/api/respaldos/base/script", crear, async (request) => {
      soloMaestra(request);
      const d = z.object({ servidorId: z.string().uuid().optional(), ahora: z.boolean().default(true), programar: z.boolean().default(false) }).parse(request.body);
      const lista = await servidores.listar();
      const s = d.servidorId ? lista.find((x) => x.id === d.servidorId) : lista[0];
      if (!s) throw new HttpError(400, "Agrega primero tu VPS en VPS → Terminal");
      const SCRIPT = "/opt/mi-setup/app/deploy/respaldo.sh";
      const pasos = [`[ -f ${SCRIPT} ] || { echo MISETUP_SIN_SCRIPT; exit 3; }`];
      if (d.programar) pasos.push(`(crontab -l 2>/dev/null | grep -v 'deploy/respaldo.sh'; echo "15 4 * * * sh ${SCRIPT} >> /var/log/misetup-respaldo.log 2>&1") | crontab - && echo MISETUP_PROGRAMADO`);
      if (d.ahora) pasos.push(`sh ${SCRIPT} 2>&1 | tail -n 6`);
      const r = await servidores.usar(s.id, (c) => ejecutar(c, pasos.join(" && "), { timeoutMs: 15 * 60_000 }));
      if (r.salida.includes("MISETUP_SIN_SCRIPT")) throw new HttpError(400, `No encontré ${SCRIPT} en ${s.name}: sube la versión nueva de Mi Setup al VPS.`);
      if (r.codigo !== 0) throw new HttpError(502, `El respaldo falló: ${[r.salida, r.error].join(" ").trim().split(/\s*\n\s*/).slice(-3).join(" ").slice(0, 300)}`);
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "respaldo_base_script", module: "respaldos", target: s.name, outcome: "ok", details: { ahora: d.ahora, programar: d.programar }, ...clientInfo(request) });
      return { ok: true, programado: r.salida.includes("MISETUP_PROGRAMADO"), salida: r.salida.replace("MISETUP_PROGRAMADO", "").trim() };
    });

    /** Disco del VPS y respaldos hechos (con los que van en curso o fallaron). */
    app.get("/api/respaldos/vps", ver, async (request) => {
      soloMaestra(request);
      const { servidorId: id } = servidorId.parse(request.query);
      return servidores.usar(id, async (c, s) => {
        const sudo = s.username === "root" ? "" : "sudo -n ";
        const disco = await ejecutar(c, "df -B1 --output=size,used,avail / | tail -1", { timeoutMs: 15_000 });
        const [total = 0, usado = 0, libre = 0] = disco.salida.trim().split(/\s+/).map(Number);
        const lista = await ejecutar(
          c,
          `${sudo}find ${citar(DIR_RESPALDOS)} -maxdepth 1 -type f \\( -name '*.tar.gz' -o -name '*.sql.gz' -o -name '*.parte' -o -name '*.error' -o -name '*.restaurando' -o -name '*.restaurar-error' \\) -printf '%f\\t%s\\t%T@\\n' 2>/dev/null`,
          { timeoutMs: 15_000 },
        );
        const archivos = lista.salida
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const [nombre = "", bytes = "0", t = "0"] = l.split("\t");
            const estado = nombre.endsWith(".parte")
              ? "en_curso"
              : nombre.endsWith(".restaurando")
                ? "restaurando"
                : nombre.endsWith(".restaurar-error")
                  ? "error_restaurar"
                  : nombre.endsWith(".error")
                    ? "error"
                    : "listo";
            return { nombre, bytes: Number(bytes), fecha: new Date(Number(t) * 1000).toISOString(), estado };
          })
          .sort((a, b) => b.fecha.localeCompare(a.fecha));
        const errores: Record<string, string> = {};
        for (const a of archivos.filter((x) => x.estado === "error" || x.estado === "error_restaurar").slice(0, 5)) {
          const r = await ejecutar(c, `${sudo}head -c 400 ${citar(`${DIR_RESPALDOS}/${a.nombre}`)}`, { timeoutMs: 10_000 });
          errores[a.nombre] = r.salida.trim();
        }
        return { carpeta: DIR_RESPALDOS, disco: { total, usado, libre }, archivos, errores };
      });
    });

    app.post("/api/respaldos/vps", crear, async (request) => {
      const user = soloMaestra(request);
      const d = z.object({ servidorId: z.string().uuid(), tipo: z.enum(["carpeta", "vps", "base", "pterodactyl"]), ruta: z.string().max(300).optional() }).parse(request.body);
      const ruta = d.tipo === "carpeta" ? validarCarpeta(d.ruta ?? "") : undefined;
      const nombre = nombreRespaldo(d.tipo, deps.now(), ruta);
      const script = scriptRespaldo(d.tipo, nombre, ruta ? { ruta } : {});
      await servidores.usar(d.servidorId, async (c, s) => {
        const sudo = s.username === "root" ? "" : "sudo -n ";
        const disco = await ejecutar(c, "df -B1 --output=avail / | tail -1", { timeoutMs: 15_000 });
        const libre = Number(disco.salida.trim());
        if (Number.isFinite(libre) && libre < 2 * 1024 ** 3) throw new HttpError(400, "Al VPS le quedan menos de 2 GB libres: libera espacio antes de crear un respaldo.");
        // En segundo plano: la conexión se puede cerrar y el respaldo sigue.
        const r = await ejecutar(c, `${sudo}nohup bash -c ${citar(script)} >/dev/null 2>&1 & echo lanzado`, { timeoutMs: 20_000 });
        if (!r.salida.includes("lanzado")) throw new HttpError(502, `No se pudo iniciar el respaldo: ${(r.error || r.salida).slice(0, 200)}`);
      });
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "respaldo_vps_creado", module: "respaldos", target: nombre, outcome: "ok", details: { tipo: d.tipo, ...(ruta ? { ruta } : {}) }, ...clientInfo(request) });
      return { ok: true, nombre };
    });

    /** Restaurar: «aparte» saca todo en /opt/mi-setup/restaurados/…; «lugar» lo pone donde estaba. */
    app.post("/api/respaldos/vps/restaurar", fuerte, async (request) => {
      const user = soloMaestra(request);
      const d = z
        .object({ servidorId: z.string().uuid(), nombre: z.string().regex(NOMBRE_ARCHIVO, "Nombre inválido"), modo: z.enum(["aparte", "lugar"]), confirmacion: z.string().max(20).optional() })
        .parse(request.body);
      if (d.modo === "lugar" && d.confirmacion !== "RESTAURAR") throw new HttpError(400, "Escribe RESTAURAR para confirmar", "doble_confirmacion");
      const script = scriptRestaurar(d.nombre, d.modo, deps.now());
      await servidores.usar(d.servidorId, async (c, s) => {
        const sudo = s.username === "root" ? "" : "sudo -n ";
        const existe = await ejecutar(c, `${sudo}test -f ${citar(`${DIR_RESPALDOS}/${d.nombre}`)} && echo si`, { timeoutMs: 15_000 });
        if (!existe.salida.includes("si")) throw new HttpError(404, "Ese respaldo ya no existe");
        const r = await ejecutar(c, `${sudo}nohup bash -c ${citar(script)} >/dev/null 2>&1 & echo lanzado`, { timeoutMs: 20_000 });
        if (!r.salida.includes("lanzado")) throw new HttpError(502, "No se pudo iniciar la restauración");
      });
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "respaldo_vps_restaurado", module: "respaldos", target: d.nombre, outcome: "ok", details: { modo: d.modo }, ...clientInfo(request) });
      return { ok: true, destino: d.modo === "aparte" ? `${DIR_RESTAURADOS}/${d.nombre.replace(/\.(tar|sql)\.gz$/, "")}` : null };
    });

    // ---- automáticos
    app.get("/api/respaldos/automaticos", ver, async (request) => {
      soloMaestra(request);
      return leerProgramaciones(deps);
    });

    app.post("/api/respaldos/automaticos", crear, async (request) => {
      const user = soloMaestra(request);
      const d = z
        .object({
          servidorId: z.string().uuid(),
          tipo: z.enum(["carpeta", "vps", "base", "pterodactyl"]),
          ruta: z.string().max(300).optional(),
          frecuencia: z.enum(["diario", "semanal"]),
          dia: z.number().int().min(0).max(6).default(0),
          hora: z.number().int().min(0).max(23),
          conservar: z.number().int().min(1).max(30).default(7),
          zona: z.string().max(60).default("America/Mexico_City"),
        })
        .parse(request.body);
      const ruta = d.tipo === "carpeta" ? validarCarpeta(d.ruta ?? "") : undefined;
      await servidores.obtener(d.servidorId);
      const lista = await leerProgramaciones(deps);
      if (lista.length >= 10) throw new HttpError(400, "Máximo 10 respaldos automáticos");
      const nueva: Programacion = { id: crypto.randomUUID(), servidorId: d.servidorId, tipo: d.tipo, ...(ruta ? { ruta } : {}), frecuencia: d.frecuencia, dia: d.dia, hora: d.hora, conservar: d.conservar, zona: d.zona, activo: true, ultimo: null, ultimoError: null };
      await setSetting(deps.db, CLAVE_PROGRAMACIONES, [...lista, nueva], deps.now());
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "respaldo_automatico_creado", module: "respaldos", target: `${d.tipo}${ruta ? ` ${ruta}` : ""}`, outcome: "ok", ...clientInfo(request) });
      return nueva;
    });

    app.patch("/api/respaldos/automaticos/:id", crear, async (request) => {
      soloMaestra(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const { activo } = z.object({ activo: z.boolean() }).parse(request.body);
      const lista = await leerProgramaciones(deps);
      const p = lista.find((x) => x.id === id);
      if (!p) throw new HttpError(404, "No existe");
      p.activo = activo;
      await setSetting(deps.db, CLAVE_PROGRAMACIONES, lista, deps.now());
      return p;
    });

    app.delete("/api/respaldos/automaticos/:id", crear, async (request) => {
      soloMaestra(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      await setSetting(deps.db, CLAVE_PROGRAMACIONES, (await leerProgramaciones(deps)).filter((x) => x.id !== id), deps.now());
      return { ok: true };
    });

    app.delete("/api/respaldos/vps", fuerte, async (request) => {
      const user = soloMaestra(request);
      const d = z.object({ servidorId: z.string().uuid(), nombre: z.string().regex(/^[A-Za-z0-9][\w.-]{2,130}$/) }).parse(request.query);
      if (!NOMBRE_ARCHIVO.test(d.nombre) && !/\.(parte|error|restaurar-error)$/.test(d.nombre)) throw new HttpError(400, "Nombre inválido");
      await servidores.usar(d.servidorId, async (c, s) => {
        const sudo = s.username === "root" ? "" : "sudo -n ";
        await ejecutar(c, `${sudo}rm -f ${citar(`${DIR_RESPALDOS}/${d.nombre}`)}`, { timeoutMs: 30_000 });
      });
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "respaldo_vps_borrado", module: "respaldos", target: d.nombre, outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });

    /** Descargar un respaldo a tu PC (por SFTP, sin cargarlo en memoria). */
    app.get("/api/respaldos/vps/descargar", fuerte, async (request, reply) => {
      const user = soloMaestra(request);
      const d = z.object({ servidorId: z.string().uuid(), nombre: z.string().regex(NOMBRE_ARCHIVO) }).parse(request.query);
      const servidor = await servidores.obtener(d.servidorId);
      const cliente = await servidores.conectar(servidor);
      try {
        const sftp = await abrirSftp(cliente);
        const ruta = `${DIR_RESPALDOS}/${d.nombre}`;
        const tamano = await new Promise<number>((ok, mal) => sftp.stat(ruta, (e, st) => (e ? mal(new HttpError(404, "Ese respaldo ya no existe")) : ok(st.size))));
        await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "respaldo_vps_descargado", module: "respaldos", target: d.nombre, outcome: "ok", ...clientInfo(request) });
        const flujo = sftp.createReadStream(ruta) as unknown as Readable;
        flujo.on("close", () => cliente.end());
        flujo.on("error", () => cliente.end());
        return reply.header("content-type", "application/octet-stream").header("content-length", String(tamano)).header("content-disposition", `attachment; filename="${d.nombre}"`).send(flujo);
      } catch (err) {
        cliente.end();
        throw err;
      }
    });
  };
}
