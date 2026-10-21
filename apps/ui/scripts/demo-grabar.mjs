#!/usr/bin/env node
/**
 * Graba las respuestas de la API para la demo pública (apps/ui/src/demo/datos.json).
 * Antes levanta el servidor de ejemplo (apps/core/scripts/demo-servidor.ts) y pásale
 * su salida JSON a este script:
 *
 *   node scripts/demo-grabar.mjs '<json que imprimió demo-servidor>'
 *
 * Necesita Playwright (no es dependencia del proyecto: se usa el instalado en la máquina,
 * o el de la variable PLAYWRIGHT=/ruta/a/node_modules/playwright).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { URL, fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? "playwright");
const { url, sesion } = JSON.parse(process.argv[2] ?? "{}");
if (!url) {
  process.stderr.write("Falta la salida de demo-servidor.ts\n");
  process.exit(1);
}

/** Apartados que tiene la demo (sin VPS ni cosas que piden claves privadas). */
export const RUTAS_DEMO = [
  "/",
  "/recordatorios",
  "/notas",
  "/calendario",
  "/finanzas",
  "/chat",
  "/portapapeles",
  "/panel/clientes",
  "/panel/finanzas",
  "/panel/negocio",
  "/panel/vencimientos",
  "/novedades",
  "/herramientas",
  "/herramientas/documentos",
  "/herramientas/convertidor",
  "/herramientas/enlaces",
  "/herramientas/compartir",
  "/programacion/codigo",
  "/programacion/ejercicios",
  "/sitios",
  "/estudio/fotos",
  "/estudio/video",
  "/entretenimiento/musica",
  "/entretenimiento/videos",
  "/ia",
  "/ia/creativa",
  "/seguridad/ciberseguridad",
  "/ajustes",
];

const datos = {};
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on("response", async (r) => {
  const u = new URL(r.url());
  if (!u.pathname.startsWith("/api/") || r.request().method() !== "GET" || r.status() !== 200) return;
  if (!(r.headers()["content-type"] ?? "").includes("json")) return;
  try {
    datos[u.pathname + u.search] = await r.json();
  } catch {
    /* sin cuerpo */
  }
});
await p.goto(`${url}/login`);
await p.evaluate((s) => {
  /* global localStorage */
  localStorage.setItem("mi-setup.sesion", JSON.stringify({ state: { refreshToken: s.refreshToken, usuario: s.usuario }, version: 0 }));
  localStorage.setItem(`mi-setup.tutorial.${s.usuario.id}`, "1");
  localStorage.setItem(`mi-setup.tutorial.${s.usuario.id}.0.11.2b`, "1");
}, sesion);
for (const ruta of RUTAS_DEMO) {
  await p.goto(url + ruta);
  await p.waitForTimeout(2500);
  const pestanas = p.locator("div.mb-4.flex.gap-1 > button");
  const n = await pestanas.count();
  for (let i = 0; i < n; i++) {
    await pestanas.nth(i).click().catch(() => undefined);
    await p.waitForTimeout(1500);
  }
  process.stdout.write(`${ruta}: ${Object.keys(datos).length} respuestas\n`);
}
await b.close();
const destino = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "demo", "datos.json");
mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, JSON.stringify(datos));
process.stdout.write(`Guardado ${destino}\n`);
