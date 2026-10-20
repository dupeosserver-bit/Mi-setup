/**
 * Archivos del VPS, parte 2:
 * - Buscar por nombre (la lupa): archivos y carpetas debajo de la carpeta actual.
 * - Organizar: propone mover cada archivo suelto a una carpeta según su tipo
 *   (.sh → scripts, .blueprint → blueprints…); usa la carpeta si ya existe o la
 *   crea. Tú eliges qué se mueve; nunca se pisa un archivo.
 * - Limpiar basura: busca lo que se puede borrar sin problema (temporales,
 *   respaldos de editores, logs viejos, cachés de Python…) y borra solo lo que
 *   marques, revisando otra vez en el servidor que de verdad sea basura.
 */
import { posix } from "node:path";
import { reauthSatisfies } from "@mi-setup/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError } from "../../http-error.js";
import { currentUser } from "../../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "../common.js";
import { RUTAS_PROTEGIDAS } from "./archivos.js";
import type { Servidores } from "./servidores.js";
import { citar, ejecutar } from "./ssh.js";

// ---------------------------------------------------------------- organizar

/** Carpeta para cada tipo de archivo. */
const CARPETAS: readonly [RegExp, string][] = [
  [/\.(sh|bash|zsh)$/i, "scripts"],
  [/\.blueprint$/i, "blueprints"],
  [/\.(py)$/i, "python"],
  [/\.(js|mjs|cjs|ts)$/i, "javascript"],
  [/\.(jar)$/i, "jars"],
  [/\.(zip|tar|tgz|gz|bz2|xz|7z|rar|tar\.gz|tar\.xz)$/i, "comprimidos"],
  [/\.(sql|sqlite|db|dump)$/i, "bases-de-datos"],
  [/\.(log|out)$/i, "logs"],
  [/\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i, "imagenes"],
  [/\.(mp4|mkv|webm|mov|avi|mp3|ogg|wav|flac)$/i, "multimedia"],
  [/\.(pdf|docx?|xlsx?|pptx?|odt|csv)$/i, "documentos"],
  [/\.(txt|md)$/i, "textos"],
  [/\.(deb|rpm|appimage|run|bin)$/i, "instaladores"],
  [/\.(pem|crt|key|pub)$/i, "certificados"],
];

/** Archivos que nunca se mueven: configuración que otros programas buscan en su lugar. */
const NO_MOVER = /^(\.|docker-compose.*\.ya?ml$|compose\.ya?ml$|dockerfile$|caddyfile$|package(-lock)?\.json$|pnpm-lock\.yaml$|yarn\.lock$|requirements\.txt$|makefile$|readme(\.md)?$|license|.*\.env$|.*\.service$|.*\.timer$|.*\.conf$|.*\.toml$|.*\.ya?ml$|.*\.json$|.*\.properties$|.*\.ini$|authorized_keys$|known_hosts$)/i;

export function carpetaPara(nombre: string): string | null {
  if (NO_MOVER.test(nombre)) return null;
  return CARPETAS.find(([re]) => re.test(nombre))?.[1] ?? null;
}

export interface Movimiento {
  archivo: string;
  carpeta: string;
  /** La carpeta ya existe (si no, se crea). */
  existe: boolean;
}

/** Plan de orden para una carpeta: qué archivo va a qué subcarpeta. */
export function planOrganizar(entradas: readonly { nombre: string; tipo: "archivo" | "carpeta" | "enlace" }[]): Movimiento[] {
  const carpetas = new Map(entradas.filter((e) => e.tipo === "carpeta").map((e) => [e.nombre.toLowerCase(), e.nombre]));
  const plan: Movimiento[] = [];
  for (const e of entradas) {
    if (e.tipo !== "archivo") continue;
    const destino = carpetaPara(e.nombre);
    if (!destino) continue;
    const existente = carpetas.get(destino);
    plan.push({ archivo: e.nombre, carpeta: existente ?? destino, existe: Boolean(existente) });
  }
  return plan;
}

// ---------------------------------------------------------------- basura

/** Patrones de archivos que se pueden borrar sin romper nada. */
const BASURA_NOMBRE = /^(\.ds_store|thumbs\.db|desktop\.ini|npm-debug\.log.*|yarn-error\.log|hs_err_pid\d+\.log|core\.\d+|nohup\.out|.*~|.*\.swp|.*\.swo|.*\.tmp|.*\.temp|.*\.part|.*\.crdownload)$/i;
const LOG_VIEJO = /\.(log(\.\d+)?|log\.gz|\d+\.gz)$/i;
const CARPETA_BASURA = /^(__pycache__|\.pytest_cache|\.mypy_cache)$/;
const DIAS_LOG = 14;

export function razonBasura(nombre: string, tipo: "f" | "d", edadDias: number): string | null {
  if (tipo === "d") return CARPETA_BASURA.test(nombre) ? "Caché de Python (se vuelve a crear sola)" : null;
  if (BASURA_NOMBRE.test(nombre)) return "Temporal o respaldo de editor";
  if (LOG_VIEJO.test(nombre) && edadDias > DIAS_LOG) return `Log de hace más de ${DIAS_LOG} días`;
  return null;
}

/** Ruta dentro de la carpeta base (sin salirse con ..). */
function dentroDe(base: string, ruta: string): boolean {
  const r = posix.normalize(ruta);
  return r === base || r.startsWith(base === "/" ? "/" : `${base}/`);
}

const rutaSchema = z
  .string()
  .min(1)
  .max(4096)
  .transform((r) => posix.normalize(r.startsWith("/") ? r : `/${r}`).replace(/(.)\/+$/, "$1"));
const nombreSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((n) => !n.includes("/") && n !== "." && n !== ".." && !n.includes("\0"), "Nombre inválido");

/** No se busca basura dentro de lo que es del sistema o de Docker. */
const SIN_LIMPIAR = ["/proc", "/sys", "/dev", "/run", "/usr", "/bin", "/sbin", "/lib", "/lib32", "/lib64", "/boot", "/etc", "/var/lib", "/snap"];

export function archivosExtraRoutes(deps: ModuleDeps, servidores: Servidores) {
  const exigirRoot = async (request: FastifyRequest, servidorId: string) => {
    const servidor = await servidores.obtener(servidorId);
    if (servidor.username === "root" && !reauthSatisfies(currentUser(request), "fuerte", deps.now())) {
      throw new HttpError(403, "Servidor root: confirma con contraseña o huella", "reauth_requerida", { metodo: "fuerte" });
    }
  };
  const registrar = (request: FastifyRequest, action: string, target: string, details?: Record<string, unknown>) =>
    deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action, module: "vps_archivos", target, outcome: "ok", ...(details ? { details } : {}), ...clientInfo(request) });
  const leer = { config: { acceso: { modulo: "vps_archivos" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "vps_archivos" as const, nivel: "escritura" as const, reauth: "pin" as const } } };
  const excluidos = SIN_LIMPIAR.map((p) => `-path ${citar(p)} -prune -o`).join(" ");

  return async function (app: FastifyInstance): Promise<void> {
    // ---- la lupa
    app.get("/api/vps/servidores/:id/archivos/buscar", leer, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = z.object({ ruta: rutaSchema.default("/"), q: z.string().trim().min(2, "Escribe al menos 2 letras").max(100) }).parse(request.query);
      if (/[\0\n\r]/.test(d.q)) throw new HttpError(400, "Búsqueda inválida");
      await exigirRoot(request, id);
      // El texto va citado y como patrón de find (* ? [ se toman como comodines, nada más).
      const patron = `*${d.q}*`;
      const comando = `find ${citar(d.ruta)} -xdev \\( -path /proc -o -path /sys -o -path /dev -o -path /run \\) -prune -o -iname ${citar(patron)} -printf '%y\\t%s\\t%T@\\t%p\\n' 2>/dev/null | head -n 300`;
      return servidores.usar(id, async (cliente) => {
        const r = await ejecutar(cliente, comando, { timeoutMs: 45_000 });
        const resultados = r.salida
          .split("\n")
          .filter(Boolean)
          .map((linea) => {
            const [tipo, tamano, fecha, ...resto] = linea.split("\t");
            const ruta = resto.join("\t");
            return { ruta, nombre: posix.basename(ruta), tipo: tipo === "d" ? "carpeta" : tipo === "l" ? "enlace" : "archivo", tamano: Number(tamano) || 0, modificado: new Date(Number(fecha) * 1000).toISOString() };
          });
        return { resultados, limite: resultados.length >= 300 };
      });
    });

    // ---- organizar
    app.post("/api/vps/servidores/:id/archivos/organizar/plan", leer, async (request) => {
      const { id } = idParams.parse(request.params);
      const { ruta } = z.object({ ruta: rutaSchema }).parse(request.body);
      await exigirRoot(request, id);
      return servidores.usar(id, async (cliente) => {
        const r = await ejecutar(cliente, `find ${citar(ruta)} -mindepth 1 -maxdepth 1 -printf '%y\\t%f\\n' 2>/dev/null | head -n 5000`, { timeoutMs: 30_000 });
        if (r.codigo !== 0 && !r.salida) throw new HttpError(400, `No se pudo leer ${ruta}`);
        const entradas = r.salida
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const [t, ...n] = l.split("\t");
            return { nombre: n.join("\t"), tipo: (t === "d" ? "carpeta" : t === "f" ? "archivo" : "enlace") as "archivo" | "carpeta" | "enlace" };
          });
        return { ruta, protegida: RUTAS_PROTEGIDAS.has(ruta) && ruta !== "/root", movimientos: planOrganizar(entradas) };
      });
    });

    app.post("/api/vps/servidores/:id/archivos/organizar", escribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = z
        .object({ ruta: rutaSchema, movimientos: z.array(z.object({ archivo: nombreSchema, carpeta: nombreSchema })).min(1).max(2000) })
        .parse(request.body);
      if (RUTAS_PROTEGIDAS.has(d.ruta) && d.ruta !== "/root") throw new HttpError(400, "Esa carpeta del sistema no se reorganiza");
      await exigirRoot(request, id);
      return servidores.usar(id, async (cliente, servidor) => {
        let movidos = 0;
        const omitidos: string[] = [];
        for (const m of d.movimientos) {
          if (!carpetaPara(m.archivo)) {
            omitidos.push(m.archivo);
            continue;
          }
          const origen = posix.join(d.ruta, m.archivo);
          const carpeta = posix.join(d.ruta, m.carpeta);
          // mv -n: si ya hay uno con ese nombre, no se pisa (queda donde estaba).
          const r = await ejecutar(cliente, `[ -f ${citar(origen)} ] && mkdir -p -- ${citar(carpeta)} && mv -n -- ${citar(origen)} ${citar(`${carpeta}/`)} && [ ! -e ${citar(origen)} ]`, { timeoutMs: 30_000 });
          if (r.codigo === 0) movidos++;
          else omitidos.push(m.archivo);
        }
        await registrar(request, "archivos_organizados", `${servidor.name}:${d.ruta}`, { movidos, omitidos: omitidos.length });
        return { movidos, omitidos };
      });
    });

    // ---- limpiar basura
    app.post("/api/vps/servidores/:id/archivos/limpiar/plan", leer, async (request) => {
      const { id } = idParams.parse(request.params);
      const { ruta } = z.object({ ruta: rutaSchema }).parse(request.body);
      if (SIN_LIMPIAR.some((p) => dentroDe(p, ruta))) throw new HttpError(400, "Esa carpeta es del sistema; ahí no se limpia");
      await exigirRoot(request, id);
      const ahora = deps.now().getTime() / 1000;
      return servidores.usar(id, async (cliente) => {
        const r = await ejecutar(cliente, `find ${citar(ruta)} -xdev -maxdepth 8 ${excluidos} \\( -type f -o -type d \\) -printf '%y\\t%s\\t%T@\\t%p\\n' 2>/dev/null | head -n 50000`, { timeoutMs: 90_000, maxBytes: 8 * 1024 * 1024 });
        const basura = r.salida
          .split("\n")
          .filter(Boolean)
          .map((l) => {
            const [t, s, f, ...resto] = l.split("\t");
            const p = resto.join("\t");
            const razon = razonBasura(posix.basename(p), t === "d" ? "d" : "f", (ahora - Number(f)) / 86_400);
            return razon ? { ruta: p, tamano: Number(s) || 0, razon, carpeta: t === "d" } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x !== null)
          // Si una carpeta de caché ya entra, lo de adentro sobra.
          .filter((x, _i, todos) => !todos.some((o) => o.carpeta && o.ruta !== x.ruta && x.ruta.startsWith(`${o.ruta}/`)))
          .slice(0, 2000);
        return { ruta, basura, total: basura.reduce((a, b) => a + b.tamano, 0) };
      });
    });

    app.post("/api/vps/servidores/:id/archivos/limpiar", escribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = z.object({ ruta: rutaSchema, rutas: z.array(rutaSchema).min(1).max(2000) }).parse(request.body);
      if (SIN_LIMPIAR.some((p) => dentroDe(p, d.ruta))) throw new HttpError(400, "Esa carpeta es del sistema; ahí no se limpia");
      await exigirRoot(request, id);
      const ahora = deps.now().getTime() / 1000;
      return servidores.usar(id, async (cliente, servidor) => {
        let borrados = 0;
        const omitidos: string[] = [];
        for (const ruta of d.rutas) {
          if (!dentroDe(d.ruta, ruta) || RUTAS_PROTEGIDAS.has(ruta) || SIN_LIMPIAR.some((p) => dentroDe(p, ruta))) {
            omitidos.push(ruta);
            continue;
          }
          // Se revisa otra vez en el servidor: tipo y antigüedad reales (no lo que mandó la app).
          const info = await ejecutar(cliente, `stat -c '%F\\t%Y' -- ${citar(ruta)} 2>/dev/null`, { timeoutMs: 15_000 });
          const [tipo, mtime] = info.salida.trim().split("\t");
          const esCarpeta = tipo === "directory";
          const razon = razonBasura(posix.basename(ruta), esCarpeta ? "d" : "f", (ahora - Number(mtime)) / 86_400);
          if (!razon || (!esCarpeta && tipo !== "regular file" && tipo !== "regular empty file")) {
            omitidos.push(ruta);
            continue;
          }
          const r = await ejecutar(cliente, esCarpeta ? `rm -rf -- ${citar(ruta)}` : `rm -f -- ${citar(ruta)}`, { timeoutMs: 60_000 });
          if (r.codigo === 0) borrados++;
          else omitidos.push(ruta);
        }
        await registrar(request, "basura_borrada", `${servidor.name}:${d.ruta}`, { borrados, omitidos: omitidos.length });
        return { borrados, omitidos };
      });
    });
  };
}
