#!/usr/bin/env node
/**
 * Capturas para el sitio oficial y el README, sacadas de la demo (edición
 * pública con datos de ejemplo: nada personal ni apartados de la edición personal).
 *
 *   pnpm --filter @mi-setup/ui build:demo
 *   node scripts/capturas-sitio.mjs
 *
 * Guarda los .png en apps/core/sitio-oficial/capturas.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { CARPETA_OFICIAL, SIN_AVISO, cargarPlaywright, servirDemo } from "./demo-local.mjs";

const { chromium } = cargarPlaywright();
const destino = join(CARPETA_OFICIAL, "capturas");
mkdirSync(destino, { recursive: true });
const demo = await servirDemo();

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
  await pagina.goto(`${demo.base}/demo${ruta}`);
  await pagina.waitForTimeout(3000);
  await pagina.addStyleTag({ content: SIN_AVISO });
  await pagina.screenshot({ path: join(destino, `${nombre}.png`) });
  await pagina.close();
  process.stdout.write(`${nombre}.png\n`);
}
await navegador.close();
demo.cerrar();
