/**
 * Descargas: las apps (APK de Android y EXE de Windows) se guardan en el VPS y
 * se bajan desde un enlace, sin pasarlas por mensajería.
 *
 * - La lista pide sesión iniciada.
 * - Bajar un archivo es público, para que alguien de confianza instale la app
 *   antes de tener cuenta; solo se entregan .apk y .exe de esa carpeta.
 *
 * Los archivos se suben al VPS en /opt/mi-setup/descargas (ver docs/USO.md).
 */
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import type { ModuleDeps } from "./common.js";

/** Solo nombres simples de apps: nada de rutas ni otros tipos de archivo. */
const NOMBRE_VALIDO = /^[\w][\w .()-]{0,120}\.(apk|exe)$/i;

export function carpetaDescargas(deps: ModuleDeps): string {
  return deps.config.env.DESCARGAS_DIR ?? join(deps.config.uploadsDir, "..", "descargas");
}

async function listar(dir: string) {
  const nombres = await readdir(dir).catch(() => [] as string[]);
  const filas = await Promise.all(
    nombres
      .filter((n) => NOMBRE_VALIDO.test(n))
      .map(async (n) => {
        const s = await stat(join(dir, n)).catch(() => null);
        return s?.isFile() ? { nombre: n, tamano: s.size, modificado: s.mtime.toISOString(), tipo: n.toLowerCase().endsWith(".apk") ? "android" : "windows" } : null;
      }),
  );
  return filas.filter((f): f is NonNullable<typeof f> => f !== null).sort((a, b) => b.modificado.localeCompare(a.modificado));
}

export function descargasRoutes(deps: ModuleDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/descargas", { config: { acceso: { autenticado: true } } }, async () => {
      const dir = carpetaDescargas(deps);
      return { archivos: (await listar(dir)).map((f) => ({ ...f, url: `/api/descargas/${encodeURIComponent(f.nombre)}` })) };
    });

    app.get("/api/descargas/:nombre", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { nombre } = z.object({ nombre: z.string().max(200) }).parse(request.params);
      if (!NOMBRE_VALIDO.test(nombre)) throw new HttpError(404, "No encontrado");
      const ruta = join(carpetaDescargas(deps), nombre);
      const s = await stat(ruta).catch(() => null);
      if (!s?.isFile()) throw new HttpError(404, "No encontrado");
      const tipo = nombre.toLowerCase().endsWith(".apk") ? "application/vnd.android.package-archive" : "application/vnd.microsoft.portable-executable";
      return reply
        .header("content-type", tipo)
        .header("content-length", String(s.size))
        .header("content-disposition", `attachment; filename="${nombre.replace(/"/g, "")}"`)
        .header("cache-control", "no-cache")
        .send(createReadStream(ruta));
    });
  };
}
