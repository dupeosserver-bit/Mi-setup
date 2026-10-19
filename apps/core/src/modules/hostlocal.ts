/**
 * Host local: búsqueda de mods y plugins en CurseForge. Su API pide una clave
 * (CURSEFORGE_API_KEY) que vive en el servidor; la app de PC solo recibe el
 * enlace de descarga del archivo elegido. Modrinth no necesita esto.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { HttpError, missingConfig } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import type { ModuleDeps } from "./common.js";
import { getSetting, setSetting } from "./settings.js";

const MINECRAFT = 432;
const CLASE = { mods: 6, plugins: 5 } as const;
/** modLoaderType de CurseForge. */
const CARGADOR = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 } as const;

/** Lo que la app de Windows comparte de sus servidores para verlos y editarlos desde el celular. */
const servidorSync = z.object({
  id: z.string().uuid(),
  nombre: z.string().max(40),
  tipo: z.string().max(20),
  version: z.string().max(40),
  mc: z.string().max(40).optional(),
  ramMb: z.number().int().min(512).max(65536),
  puerto: z.number().int().min(1).max(65535),
  estado: z.enum(["detenido", "iniciando", "encendido", "deteniendo"]),
  jugadores: z.array(z.string().max(40)).max(100),
  propiedades: z.record(z.string().max(60), z.string().max(200)).optional(),
});
const cambiosSchema = z
  .object({
    nombre: z.string().trim().min(1).max(40).optional(),
    ramMb: z.number().int().min(512).max(65536).optional(),
    puerto: z.number().int().min(1024).max(65535).optional(),
    propiedades: z.record(z.string().regex(/^[a-z0-9.-]{1,60}$/), z.string().max(200).refine((v) => !/[\r\n]/.test(v))).optional(),
  })
  .refine((c) => Object.keys(c).length > 0, "No hay cambios");
interface EdicionPendiente {
  id: string;
  servidorId: string;
  cambios: z.infer<typeof cambiosSchema>;
  creada: string;
}
interface EstadoSync {
  servidores: z.infer<typeof servidorSync>[];
  actualizado: string | null;
  pendientes: EdicionPendiente[];
}
const claveSync = (userId: string) => `hostlocal:${userId}`;

const filtros = z.object({
  version: z.string().regex(/^[\w.-]{2,20}$/),
  tipo: z.enum(["paper", "fabric", "forge", "neoforge", "quilt"]),
});

export function hostLocalRoutes(deps: ModuleDeps) {
  async function cf<T>(ruta: string): Promise<T> {
    const clave = deps.config.env.CURSEFORGE_API_KEY;
    if (!clave) throw missingConfig("CURSEFORGE_API_KEY");
    const r = await fetch(`https://api.curseforge.com${ruta}`, { headers: { "x-api-key": clave, accept: "application/json" }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r) throw new HttpError(502, "CurseForge no respondió");
    if (r.status === 403) throw new HttpError(400, "CurseForge rechazó la clave (Ajustes → Servicios y claves).");
    if (!r.ok) throw new HttpError(502, `CurseForge respondió ${r.status}`);
    return (await r.json()) as T;
  }
  const parametrosTipo = (tipo: z.infer<typeof filtros>["tipo"]): Record<string, string> =>
    tipo === "paper" ? { classId: String(CLASE.plugins) } : { classId: String(CLASE.mods), modLoaderType: String(CARGADOR[tipo]) };

  return async function (app: FastifyInstance): Promise<void> {
    const leer = { config: { acceso: { modulo: "host_local" as const, nivel: "lectura" as const } } };

    const escribir = { config: { acceso: { modulo: "host_local" as const, nivel: "escritura" as const } } };
    const leerSync = async (userId: string): Promise<EstadoSync> => (await getSetting<EstadoSync>(deps.db, claveSync(userId))) ?? { servidores: [], actualizado: null, pendientes: [] };

    // ---- celular: ver y editar (no encender) los servidores de la PC. La PC los sube y aplica los cambios al abrir Mi Setup.
    /** La app de Windows sube su lista y recibe las ediciones pendientes del celular. */
    app.put("/api/hostlocal/sincronizar", escribir, async (request) => {
      const user = currentUser(request);
      const { servidores } = z.object({ servidores: z.array(servidorSync).max(60) }).parse(request.body);
      const actual = await leerSync(user.id);
      const ids = new Set(servidores.map((x) => x.id));
      const nuevo: EstadoSync = { servidores, actualizado: deps.now().toISOString(), pendientes: actual.pendientes.filter((e) => ids.has(e.servidorId)) };
      await setSetting(deps.db, claveSync(user.id), nuevo, deps.now());
      return { pendientes: nuevo.pendientes };
    });

    app.get("/api/hostlocal/servidores", leer, async (request) => {
      const e = await leerSync(currentUser(request).id);
      return { servidores: e.servidores, actualizado: e.actualizado, pendientes: e.pendientes.map((p) => ({ id: p.id, servidorId: p.servidorId, cambios: p.cambios, creada: p.creada })) };
    });

    app.post("/api/hostlocal/ediciones", escribir, async (request) => {
      const user = currentUser(request);
      const d = z.object({ servidorId: z.string().uuid(), cambios: cambiosSchema }).parse(request.body);
      const e = await leerSync(user.id);
      const s = e.servidores.find((x) => x.id === d.servidorId);
      if (!s) throw new HttpError(404, "Ese servidor todavía no está sincronizado: abre Servidores en mi PC en la app de Windows.");
      if (d.cambios.puerto && e.servidores.some((x) => x.id !== s.id && x.puerto === d.cambios.puerto)) throw new HttpError(400, `El puerto ${d.cambios.puerto} ya lo usa otro de tus servidores`);
      if (e.pendientes.length >= 50) throw new HttpError(400, "Hay demasiados cambios esperando a tu PC");
      const edicion: EdicionPendiente = { id: randomUUID(), servidorId: s.id, cambios: d.cambios, creada: deps.now().toISOString() };
      await setSetting(deps.db, claveSync(user.id), { ...e, pendientes: [...e.pendientes, edicion] }, deps.now());
      return { ok: true, id: edicion.id };
    });

    /** La PC avisa qué ediciones ya aplicó. */
    app.post("/api/hostlocal/ediciones/aplicadas", escribir, async (request) => {
      const user = currentUser(request);
      const { ids } = z.object({ ids: z.array(z.string().uuid()).max(100) }).parse(request.body);
      const e = await leerSync(user.id);
      await setSetting(deps.db, claveSync(user.id), { ...e, pendientes: e.pendientes.filter((p) => !ids.includes(p.id)) }, deps.now());
      return { ok: true };
    });

    app.get("/api/hostlocal/curseforge/buscar", leer, async (request) => {
      const d = filtros.extend({ q: z.string().max(100).default("") }).parse(request.query);
      const p = new URLSearchParams({ gameId: String(MINECRAFT), gameVersion: d.version, searchFilter: d.q, sortField: "2", sortOrder: "desc", pageSize: "24", ...parametrosTipo(d.tipo) });
      const r = await cf<{ data: { id: number; name: string; summary: string; logo?: { thumbnailUrl: string } | null; downloadCount: number; authors: { name: string }[]; links?: { websiteUrl?: string } }[] }>(`/v1/mods/search?${p}`);
      return r.data.map((m) => ({
        id: String(m.id),
        titulo: m.name,
        descripcion: m.summary,
        icono: m.logo?.thumbnailUrl ?? null,
        descargas: m.downloadCount,
        autor: m.authors[0]?.name ?? "",
        url: m.links?.websiteUrl ?? `https://www.curseforge.com/minecraft`,
      }));
    });

    app.get("/api/hostlocal/curseforge/archivo", leer, async (request) => {
      const d = filtros.extend({ modId: z.coerce.number().int().positive() }).parse(request.query);
      const tipo = parametrosTipo(d.tipo);
      const p = new URLSearchParams({ gameVersion: d.version, pageSize: "10", ...(tipo["modLoaderType"] ? { modLoaderType: tipo["modLoaderType"] } : {}) });
      const r = await cf<{ data: { fileName: string; downloadUrl: string | null; releaseType: number }[] }>(`/v1/mods/${d.modId}/files?${p}`);
      const archivo = r.data.find((f) => f.downloadUrl && f.releaseType === 1) ?? r.data.find((f) => f.downloadUrl);
      if (!archivo) {
        throw new HttpError(
          r.data.length ? 400 : 404,
          r.data.length ? "El autor no permite bajarlo desde otras apps: descárgalo de su página y ponlo en la carpeta mods/plugins." : `No hay versión para ${d.version}`,
        );
      }
      return { url: archivo.downloadUrl, nombre: archivo.fileName };
    });
  };
}
