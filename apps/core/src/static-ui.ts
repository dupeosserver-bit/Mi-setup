/**
 * Sirve la UI compilada (apps/ui/dist) y las imágenes subidas (/uploads).
 * Cualquier GET fuera de /api que no sea un archivo devuelve index.html (SPA).
 */
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

export async function registerStatic(
  app: FastifyInstance,
  options: { uiDir: string | null; uploadsDir: string },
): Promise<{ hayUi: boolean }> {
  await mkdir(options.uploadsDir, { recursive: true }).catch(() => undefined);
  await app.register(fastifyStatic, {
    root: options.uploadsDir,
    prefix: "/uploads/",
    decorateReply: false,
    index: false,
    setHeaders(res) {
      // Un SVG subido nunca puede ejecutar nada, aunque se abra directamente.
      res.setHeader("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("cache-control", "public, max-age=31536000, immutable");
    },
  });

  const hayUi = Boolean(options.uiDir && existsSync(join(options.uiDir, "index.html")));
  if (hayUi && options.uiDir) {
    await app.register(fastifyStatic, {
      root: options.uiDir,
      prefix: "/",
      wildcard: false,
      setHeaders(res, path) {
        res.setHeader(
          "cache-control",
          path.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
        );
      },
    });
  }
  return { hayUi };
}
