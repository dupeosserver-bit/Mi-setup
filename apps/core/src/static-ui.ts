/**
 * Sirve la UI compilada (apps/ui/dist) y las imágenes subidas (/uploads).
 * Cualquier GET fuera de /api que no sea un archivo devuelve index.html (SPA).
 */
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/** Política de la demo pública: puede mostrarse dentro de otra página (el sitio oficial). */
export const CSP_DEMO =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://staticimgly.com; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'self' https:";

export async function registerStatic(
  app: FastifyInstance,
  options: { uiDir: string | null; uploadsDir: string; demoDir?: string | null },
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
  // Demo pública (sin servidor ni datos reales): se puede mostrar dentro del sitio oficial.
  const demoDir = options.demoDir && existsSync(join(options.demoDir, "index.html")) ? options.demoDir : null;
  if (demoDir) {
    const permitirMarco = (res: { setHeader(n: string, v: string): void; removeHeader(n: string): void }) => {
      res.removeHeader("x-frame-options");
      res.setHeader("content-security-policy", CSP_DEMO);
    };
    await app.register(fastifyStatic, {
      root: demoDir,
      prefix: "/demo/",
      decorateReply: false,
      index: false,
      wildcard: false,
      setHeaders(res, path) {
        permitirMarco(res as never);
        res.setHeader("cache-control", path.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable");
      },
    });
    const pagina = async (_request: unknown, reply: import("fastify").FastifyReply) => {
      permitirMarco({ setHeader: (n, v) => void reply.header(n, v), removeHeader: (n) => void reply.removeHeader(n) });
      return reply.type("text/html").header("cache-control", "no-cache").send(await readFile(join(demoDir, "index.html")));
    };
    app.get("/demo", { config: { acceso: { publico: true } } }, pagina);
    app.get("/demo/*", { config: { acceso: { publico: true } } }, pagina);
  }
  return { hayUi };
}
