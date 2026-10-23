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
import { versionDeArchivo, versionesRecientes } from "@mi-setup/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import { VERSION } from "../version.js";
import type { ModuleDeps } from "./common.js";

/** Solo nombres simples de apps: nada de rutas ni otros tipos de archivo. */
const NOMBRE_VALIDO = /^[\w][\w .()-]{0,120}\.(apk|exe)$/i;
/** Además de las apps, el actualizador de Windows pide latest.yml y el .blockmap. */
const NOMBRE_ACTUALIZADOR = /^(latest\.yml|[\w][\w .()-]{0,120}\.exe\.blockmap)$/i;

export function carpetaDescargas(deps: ModuleDeps): string {
  return deps.config.env.DESCARGAS_DIR ?? join(deps.config.uploadsDir, "..", "descargas");
}

export async function listarDescargas(dir: string) {
  const nombres = await readdir(dir).catch(() => [] as string[]);
  const filas = await Promise.all(
    nombres
      .filter((n) => NOMBRE_VALIDO.test(n))
      .map(async (n) => {
        const s = await stat(join(dir, n)).catch(() => null);
        return s?.isFile() ? { nombre: n, tamano: s.size, modificado: s.mtime.toISOString(), tipo: n.toLowerCase().endsWith(".apk") ? "android" : "windows" } : null;
      }),
  );
  // Solo la versión nueva y las 2 anteriores de cada app (deploy/limpiar-descargas.py borra el resto del VPS).
  return versionesRecientes(filas.filter((f): f is NonNullable<typeof f> => f !== null)).map((f) => ({ ...f, version: versionDeArchivo(f.nombre) }));
}

export function tipoDescarga(nombre: string): string {
  const n = nombre.toLowerCase();
  if (n.endsWith(".apk")) return "application/vnd.android.package-archive";
  if (n.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  if (n.endsWith(".yml")) return "text/yaml; charset=utf-8";
  return "application/octet-stream";
}

export function descargasRoutes(deps: ModuleDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/descargas", { config: { acceso: { autenticado: true } } }, async () => {
      const dir = carpetaDescargas(deps);
      return { archivos: (await listarDescargas(dir)).map((f) => ({ ...f, url: `/api/descargas/${encodeURIComponent(f.nombre)}` })) };
    });

    /**
     * App de Android más nueva que se puede bajar. `version` es la de ese APK (no la
     * del servidor): si el APK nuevo todavía no se sube, la app no ofrece «actualizar»
     * para luego instalar uno más viejo. `servidor` es la versión del servidor.
     */
    app.get("/api/actualizaciones", { config: { acceso: { autenticado: true } } }, async () => {
      const archivos = await listarDescargas(carpetaDescargas(deps));
      const apk = archivos.find((f) => f.tipo === "android" && f.version);
      return {
        version: apk?.version ?? VERSION,
        servidor: VERSION,
        apk: apk ? { nombre: apk.nombre, version: apk.version, url: `/api/descargas/${encodeURIComponent(apk.nombre)}`, fecha: apk.modificado } : null,
      };
    });

    app.get("/api/descargas/:nombre", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { nombre } = z.object({ nombre: z.string().max(200) }).parse(request.params);
      if (!NOMBRE_VALIDO.test(nombre) && !NOMBRE_ACTUALIZADOR.test(nombre)) throw new HttpError(404, "No encontrado");
      const ruta = join(carpetaDescargas(deps), nombre);
      const s = await stat(ruta).catch(() => null);
      if (!s?.isFile()) throw new HttpError(404, "No encontrado");
      return reply
        .header("content-type", tipoDescarga(nombre))
        .header("content-length", String(s.size))
        .header("content-disposition", `attachment; filename="${nombre.replace(/"/g, "")}"`)
        .header("cache-control", "no-cache")
        .send(createReadStream(ruta));
    });
  };
}
