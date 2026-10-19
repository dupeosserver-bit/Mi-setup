/**
 * Crear respaldos en el VPS desde Mi Setup: una carpeta, todo Pterodactyl, la base de datos
 * de Mi Setup o el VPS completo. Se arman con tar/pg_dump por SSH y se dejan en
 * /opt/mi-setup/respaldos-manuales. Corren en segundo plano en el VPS (aunque cierres la app):
 * mientras avanzan el archivo termina en «.parte»; al acabar se renombra, y si falla queda un «.error».
 * Solo la cuenta maestra; borrar y descargar piden reautenticación fuerte.
 */
import { Readable } from "node:stream";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, type ModuleDeps } from "./common.js";
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

export function nombreRespaldo(tipo: TipoRespaldo, ahora: Date, ruta?: string): string {
  const base = tipo === "carpeta" ? (ruta ?? "carpeta").split("/").filter(Boolean).pop()!.replace(/[^\w.-]/g, "_") : tipo === "vps" ? "vps-completo" : tipo === "base" ? "base-mi-setup" : "pterodactyl";
  return `${base}-${sello(ahora)}.${tipo === "base" ? "sql.gz" : "tar.gz"}`;
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
          `${sudo}find ${citar(DIR_RESPALDOS)} -maxdepth 1 -type f \\( -name '*.tar.gz' -o -name '*.sql.gz' -o -name '*.parte' -o -name '*.error' \\) -printf '%f\\t%s\\t%T@\\n' 2>/dev/null`,
          { timeoutMs: 15_000 },
        );
        const archivos = lista.salida
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const [nombre = "", bytes = "0", t = "0"] = l.split("\t");
            const estado = nombre.endsWith(".parte") ? "en_curso" : nombre.endsWith(".error") ? "error" : "listo";
            return { nombre, bytes: Number(bytes), fecha: new Date(Number(t) * 1000).toISOString(), estado };
          })
          .sort((a, b) => b.fecha.localeCompare(a.fecha));
        const errores: Record<string, string> = {};
        for (const a of archivos.filter((x) => x.estado === "error").slice(0, 5)) {
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

    app.delete("/api/respaldos/vps", fuerte, async (request) => {
      const user = soloMaestra(request);
      const d = z.object({ servidorId: z.string().uuid(), nombre: z.string().regex(/^[A-Za-z0-9][\w.-]{2,130}$/) }).parse(request.query);
      if (!NOMBRE_ARCHIVO.test(d.nombre) && !/\.(parte|error)$/.test(d.nombre)) throw new HttpError(400, "Nombre inválido");
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
