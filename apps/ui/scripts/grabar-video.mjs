#!/usr/bin/env node
/**
 * Video del recorrido para la página oficial: la demo en la PC y en el celular,
 * lado a lado, sin sonido y pensado para repetirse en bucle (empieza y termina
 * con la misma portada). Sale de la demo: datos de ejemplo y edición pública.
 *
 *   pnpm --filter @mi-setup/ui build:demo
 *   node scripts/grabar-video.mjs
 *
 * Guarda apps/core/sitio-oficial/video/recorrido.webm y recorrido.png (la imagen
 * que se ve mientras carga el video).
 */
/* global document, history, dispatchEvent, PopStateEvent, setTimeout -- lo de evaluate() corre en el navegador */
import { execFileSync } from "node:child_process";
import { mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { CARPETA_OFICIAL, SIN_AVISO, buscarFfmpeg, cargarPlaywright, servirDemo } from "./demo-local.mjs";

const ANCHO = 1440;
const ALTO = 810;
/** [ruta en la PC, ruta en el celular, rótulo] */
const ESCENAS = [
  ["/", "/", "Tu día en un solo lugar"],
  ["/finanzas", "/finanzas", "Mis finanzas"],
  ["/notas", "/notas", "Notas con fotos y voz"],
  ["/calendario", "/recordatorios", "Calendario y recordatorios"],
  ["/ia", "/ia", "IA que solo propone"],
  ["/sitios", "/sitios", "Tus sitios web"],
  ["/estudio/fotos", "/herramientas", "Editor de fotos y herramientas"],
  ["/entretenimiento/musica", "/novedades", "Música y novedades"],
];
const POR_ESCENA_MS = 4800;

const ESCENARIO = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}
body{margin:0;width:${ANCHO}px;height:${ALTO}px;overflow:hidden;background:radial-gradient(1200px 600px at 30% 0%,#2a2350,#0b0d12 70%);font-family:system-ui,"Segoe UI",sans-serif;color:#eceff5}
.pc{position:absolute;left:44px;top:110px;width:960px;height:600px;border-radius:14px;overflow:hidden;border:1px solid #2b3140;background:#121212;box-shadow:0 30px 80px -20px rgba(124,92,255,.5)}
.pc iframe{width:1280px;height:800px;border:0;transform:scale(.75);transform-origin:0 0}
.cel{position:absolute;left:1074px;top:96px;width:322px;height:676px;border:9px solid #222633;border-radius:38px;overflow:hidden;background:#121212;box-shadow:0 30px 70px -10px rgba(0,0,0,.7)}
.cel iframe{width:390px;height:844px;border:0;transform:scale(.78);transform-origin:0 0}
.rotulo{position:absolute;left:44px;top:18px;font-size:22px;font-weight:700;letter-spacing:-.01em;transition:opacity .4s}
.rotulo span{background:linear-gradient(90deg,#b49cff,#7dd3fc);-webkit-background-clip:text;background-clip:text;color:transparent}
#portada{position:absolute;inset:0;display:grid;place-items:center;text-align:center;background:radial-gradient(1200px 600px at 30% 0%,#2a2350,#0b0d12 70%);transition:opacity .7s;z-index:5}
#portada h1{font-size:76px;margin:0;letter-spacing:-.03em}
#portada h1 span{background:linear-gradient(90deg,#b49cff,#7dd3fc);-webkit-background-clip:text;background-clip:text;color:transparent}
#portada p{color:#98a2b6;font-size:24px;margin:10px 0 0}
</style></head><body>
<div class="rotulo" id="rotulo"></div>
<div class="pc"><iframe name="pc" src="/demo/"></iframe></div>
<div class="cel"><iframe name="cel" src="/demo/"></iframe></div>
<div id="portada"><div><h1>Mi <span>Setup</span></h1><p>Tu servidor, tus apps y tu día en un solo lugar</p></div></div>
</body></html>`;

const { chromium } = cargarPlaywright();
const destino = join(CARPETA_OFICIAL, "video");
const temporal = join(destino, "grabando");
mkdirSync(temporal, { recursive: true });
const demo = await servirDemo({ "/escenario": ESCENARIO });

const navegador = await chromium.launch();
const contexto = await navegador.newContext({ viewport: { width: ANCHO, height: ALTO }, colorScheme: "dark", recordVideo: { dir: temporal, size: { width: ANCHO, height: ALTO } } });
const pagina = await contexto.newPage();
// El video empieza al crear la página: se mide para luego cortar lo que tarda en cargar.
const inicio = Date.now();
let entra = 0;
await pagina.goto(`${demo.base}/escenario`);
await pagina.waitForTimeout(4500);
const marcos = ["pc", "cel"].map((n) => pagina.frame({ name: n }));
for (const m of marcos) await m.addStyleTag({ content: SIN_AVISO });

/** Cambia de pantalla dentro de la app sin recargarla (como al tocar el menú). */
const ir = (m, ruta) =>
  m.evaluate((r) => {
    history.pushState({}, "", `/demo${r}`);
    dispatchEvent(new PopStateEvent("popstate", { state: {} }));
  }, ruta);
/** Baja despacio en lo que tenga scroll (la página o su contenedor). */
const bajar = (m) =>
  m.evaluate(() => {
    const main = document.querySelector("main");
    const candidatos = [main, ...(main?.querySelectorAll("*") ?? []), document.scrollingElement].filter((e) => e && e.scrollHeight - e.clientHeight > 80);
    const el = candidatos.sort((a, b) => b.clientHeight - a.clientHeight)[0];
    el?.scrollTo({ top: Math.min(360, el.scrollHeight - el.clientHeight), behavior: "smooth" });
  });
const rotulo = (texto) =>
  pagina.evaluate((t) => {
    const r = document.getElementById("rotulo");
    r.style.opacity = "0";
    setTimeout(() => {
      r.innerHTML = t;
      r.style.opacity = "1";
    }, 400);
  }, texto);

let poster = false;
for (const [i, [rutaPc, rutaCel, texto]] of ESCENAS.entries()) {
  await Promise.all([ir(marcos[0], rutaPc), ir(marcos[1], rutaCel), rotulo(texto.replace(/^(\S+)/, "<span>$1</span>"))]);
  if (i === 0) {
    await pagina.evaluate(() => (document.getElementById("portada").style.opacity = "0"));
    entra = Date.now();
  }
  await pagina.waitForTimeout(1800);
  if (!poster && i === 1) {
    await pagina.screenshot({ path: join(destino, "recorrido.png") });
    poster = true;
  }
  await Promise.all(marcos.map(bajar));
  await pagina.waitForTimeout(POR_ESCENA_MS - 1800);
}
// Termina en la misma portada con la que empieza: el bucle no se nota.
await pagina.evaluate(() => (document.getElementById("portada").style.opacity = "1"));
await pagina.waitForTimeout(1200);
const video = pagina.video();
await contexto.close();
const final = join(destino, "recorrido.webm");
rmSync(final, { force: true });
// La app aparece al segundo: se corta la carga y queda menos de 1 s de portada al empezar
// (el final también es la portada, así el bucle no se nota).
const corte = Math.max(0, (entra - inicio) / 1000 - 0.8);
const ffmpeg = buscarFfmpeg();
if (ffmpeg && corte > 0) {
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", corte.toFixed(2), "-i", await video.path(), "-an", "-c:v", "libvpx", "-b:v", "1800k", "-crf", "10", final]);
} else {
  if (!ffmpeg) process.stdout.write("Sin ffmpeg de Playwright: el video queda con la carga al inicio (npx playwright install ffmpeg).\n");
  renameSync(await video.path(), final);
}
rmSync(temporal, { recursive: true, force: true });
await navegador.close();
demo.cerrar();
process.stdout.write(`recorrido.webm (${(statSync(final).size / 1024 / 1024).toFixed(1)} MB) y recorrido.png\n`);
