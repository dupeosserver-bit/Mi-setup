#!/usr/bin/env node
/**
 * Capturas para el sitio oficial y el README, sacadas de la demo (edición
 * pública con datos de ejemplo: nada personal ni apartados de la edición personal).
 *
 *   pnpm --filter @mi-setup/ui build:demo
 *   PLAYWRIGHT=/ruta/a/node_modules/playwright node scripts/capturas-sitio.mjs
 *
 * Guarda los .png en apps/core/sitio-oficial/capturas.
 */
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");
const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "dist-demo");
const destino = join(aqui, "..", "..", "core", "sitio-oficial", "capturas");
if (!existsSync(join(raiz, "index.html"))) {
  process.stderr.write("Primero compila la demo: pnpm --filter @mi-setup/ui build:demo\n");
  process.exit(1);
}
mkdirSync(destino, { recursive: true });

const TIPOS = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
const servidor = createServer((q, r) => {
  let archivo = join(raiz, decodeURIComponent((q.url ?? "/").split("?")[0]).replace(/^\/demo/, ""));
  if (!archivo.startsWith(raiz) || !existsSync(archivo) || statSync(archivo).isDirectory()) archivo = join(raiz, "index.html");
  r.writeHead(200, { "content-type": TIPOS[extname(archivo)] ?? "application/octet-stream" });
  createReadStream(archivo).pipe(r);
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${servidor.address().port}/demo`;

/** [archivo, ruta, ancho, alto] */
const CAPTURAS = [
  ["inicio", "/", 1280, 800],
  ["finanzas", "/finanzas", 1280, 800],
  ["notas", "/notas", 1280, 800],
  ["calendario", "/calendario", 1280, 800],
  ["ia", "/ia", 1280, 800],
  ["sitios", "/sitios", 1280, 800],
  ["herramientas", "/herramientas", 1280, 800],
  ["editor-fotos", "/estudio/fotos", 1280, 800],
  ["finanzas-celular", "/finanzas", 390, 844],
  ["notas-celular", "/notas", 390, 844],
];

const navegador = await chromium.launch();
for (const [nombre, ruta, ancho, alto] of CAPTURAS) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto }, deviceScaleFactor: ancho < 500 ? 2 : 1, colorScheme: "dark" });
  await pagina.goto(base + ruta);
  await pagina.waitForTimeout(3000);
  await pagina.addStyleTag({ content: "#aviso-demo{display:none!important}" });
  await pagina.screenshot({ path: join(destino, `${nombre}.png`) });
  await pagina.close();
  process.stdout.write(`${nombre}.png\n`);
}
await navegador.close();
servidor.close();
