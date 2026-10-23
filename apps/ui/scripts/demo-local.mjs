/**
 * Sirve la demo compilada (dist-demo) en 127.0.0.1 y abre Chromium con Playwright.
 * Lo usan capturas-sitio.mjs y grabar-video.mjs.
 *
 * Playwright se busca en este orden: la variable PLAYWRIGHT (carpeta del paquete),
 * el proyecto y la instalación global de @playwright/cli.
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const aqui = dirname(fileURLToPath(import.meta.url));
export const RAIZ_DEMO = join(aqui, "..", "dist-demo");
export const CARPETA_OFICIAL = join(aqui, "..", "..", "core", "sitio-oficial");

export function cargarPlaywright() {
  const global = process.env.APPDATA ? join(process.env.APPDATA, "npm", "node_modules", "@playwright", "cli", "node_modules", "playwright") : null;
  for (const ruta of [process.env.PLAYWRIGHT, "playwright", global]) {
    if (!ruta) continue;
    try {
      return require(ruta);
    } catch {
      // Se prueba el siguiente.
    }
  }
  process.stderr.write("No encuentro Playwright. Instálalo con: npm i -g @playwright/cli && npx playwright install chromium ffmpeg\n");
  process.exit(1);
}

const TIPOS = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

/** Sirve /demo/* desde dist-demo y las páginas extra que se le pasen (ruta → html). */
export async function servirDemo(extras = {}) {
  if (!existsSync(join(RAIZ_DEMO, "index.html"))) {
    process.stderr.write("Primero compila la demo: pnpm --filter @mi-setup/ui build:demo\n");
    process.exit(1);
  }
  const servidor = createServer((q, r) => {
    const ruta = decodeURIComponent((q.url ?? "/").split("?")[0]);
    if (extras[ruta]) {
      r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      r.end(extras[ruta]);
      return;
    }
    let archivo = join(RAIZ_DEMO, ruta.replace(/^\/demo/, ""));
    if (!archivo.startsWith(RAIZ_DEMO + sep) || !existsSync(archivo) || statSync(archivo).isDirectory()) archivo = join(RAIZ_DEMO, "index.html");
    r.writeHead(200, { "content-type": TIPOS[extname(archivo)] ?? "application/octet-stream" });
    createReadStream(archivo).pipe(r);
  });
  await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
  return { base: `http://127.0.0.1:${servidor.address().port}`, cerrar: () => servidor.close() };
}

/** Esconde el aviso amarillo de la demo (en capturas y video estorba). */
export const SIN_AVISO = "#aviso-demo{display:none!important}";
