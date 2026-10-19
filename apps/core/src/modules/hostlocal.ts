/**
 * Host local: búsqueda de mods y plugins en CurseForge. Su API pide una clave
 * (CURSEFORGE_API_KEY) que vive en el servidor; la app de PC solo recibe el
 * enlace de descarga del archivo elegido. Modrinth no necesita esto.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, missingConfig } from "../http-error.js";
import type { ModuleDeps } from "./common.js";

const MINECRAFT = 432;
const CLASE = { mods: 6, plugins: 5 } as const;
/** modLoaderType de CurseForge. */
const CARGADOR = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 } as const;

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
