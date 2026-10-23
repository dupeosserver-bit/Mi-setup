/**
 * Sitio oficial de Mi Setup (misetup.DOMINIO): se crea solo en la edición
 * personal, a nombre de la cuenta maestra y SIN publicar. Páginas: inicio,
 * funciones, descargas, instalar, wiki, demo y comunidad.
 *
 * - Todo lo que dice es de la edición pública (nada de la edición personal).
 * - Las capturas y el video del inicio salen de la demo (datos de ejemplo):
 *   apps/ui/scripts/capturas-sitio.mjs y apps/ui/scripts/grabar-video.mjs.
 * - La wiki sale de la ayuda de la app: scripts/wiki-sitio.ts.
 * - Con cada versión nueva se vuelve a generar, solo si nadie lo editó.
 */
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, asc, eq } from "drizzle-orm";
import { siteAssets, sites, siteVersions, users } from "../../db/schema.js";
import { VERSION } from "../../version.js";
import type { ModuleDeps } from "../common.js";
import { carpetaArchivos } from "../herramientas.js";
import { getSetting, setSetting } from "../settings.js";

export const SLUG_OFICIAL = "misetup";
export const CARPETA_OFICIAL = fileURLToPath(new URL("../../../sitio-oficial", import.meta.url));
const CLAVE = "sitio_oficial";
export const GITHUB = "https://github.com/dupeosserver-bit/Mi-setup";
export const X_OFICIAL = "JokeerYT_Oficia";

interface Tema {
  id: string;
  titulo: string;
  pasos: string[];
  nota?: string;
}
type Wiki = { grupo: string; temas: Tema[] }[];

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const CSS_OFICIAL = `
body{margin:0;background:#0b0d12;color:#eceff5;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:#b49cff;text-decoration:none}
img{max-width:100%;display:block}
.ancho{max-width:1120px;margin:0 auto;padding:0 16px}
.aviso-ia{background:#b49cff;color:#111;text-align:center;font-size:13px;font-weight:600;padding:6px 16px}
.nav{position:sticky;top:0;z-index:20;background:rgba(11,13,18,.92);border-bottom:1px solid #252b37}
.nav .ancho{display:flex;align-items:center;gap:16px;min-height:62px;flex-wrap:wrap}
.logo{font-weight:800;font-size:18px;color:#eceff5;display:flex;gap:10px;align-items:center}
.logo img{width:32px;height:32px;border-radius:9px;object-fit:cover}
.logo b{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#b49cff,#7dd3fc);display:grid;place-items:center;color:#111;font-size:15px}
.menu{display:flex;gap:4px;margin-left:auto;flex-wrap:wrap}
.menu a{color:#98a2b6;padding:7px 12px;border-radius:10px;font-size:14px}
.menu a:hover,.menu a.activo{color:#eceff5;background:#151922}
.menu-movil{display:none;margin-left:auto}
.menu-movil summary{list-style:none;cursor:pointer;border:1px solid #252b37;border-radius:10px;padding:4px 12px;font-size:18px}
.menu-movil summary::-webkit-details-marker{display:none}
.menu-movil[open] .menu{display:flex;flex-direction:column;position:absolute;left:0;right:0;top:62px;background:#0b0d12;border-bottom:1px solid #252b37;padding:10px 16px}
.boton{display:inline-flex;align-items:center;gap:8px;padding:11px 20px;border-radius:999px;font-weight:600;font-size:15px;border:1px solid #252b37;color:#eceff5;background:#151922}
.boton.primario{background:#b49cff;color:#111;border-color:transparent}
.etiqueta{display:inline-block;padding:4px 12px;border-radius:999px;border:1px solid #252b37;color:#98a2b6;font-size:13px}
h1{font-size:clamp(34px,6.5vw,62px);line-height:1.06;margin:18px 0 16px;letter-spacing:-.02em}
h1 span{background:linear-gradient(90deg,#b49cff,#7dd3fc);-webkit-background-clip:text;background-clip:text;color:transparent}
h2{font-size:clamp(26px,4vw,36px);margin:0 0 8px}
.sub{color:#98a2b6;font-size:19px;max-width:620px}
.intro{color:#98a2b6;margin:0 0 28px;max-width:760px}
.pagina{padding:48px 0 80px}
.heroe{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:40px;align-items:center}
.rejilla{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.tarjeta{background:#151922;border:1px solid #252b37;border-radius:18px;padding:20px}
.tarjeta h3{margin:8px 0 6px;font-size:17px}
.tarjeta p{margin:0;color:#98a2b6;font-size:14px}
.icono{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;font-size:20px;background:rgba(180,156,255,.15)}
.fila{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.ventana{border-radius:16px;border:1px solid #252b37;background:#111;overflow:hidden;box-shadow:0 30px 80px -24px rgba(124,92,255,.45)}
.ventana .barra{height:28px;background:#181a22;display:flex;align-items:center;gap:6px;padding:0 12px}
.ventana .barra i{width:10px;height:10px;border-radius:50%;background:#ffffff30}
.recorrido{margin-top:44px;border-radius:18px;overflow:hidden;border:1px solid #252b37;background:#0b0d12;box-shadow:0 30px 80px -24px rgba(124,92,255,.45)}
.recorrido video,.recorrido img{width:100%;height:auto;aspect-ratio:16/9;display:block}
.heroe-texto{max-width:760px}
.telefono{border:8px solid #222633;border-radius:34px;overflow:hidden;max-width:240px;margin:0 auto}
.galeria{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.pie-foto{text-align:center;color:#98a2b6;font-size:13px;margin-top:8px}
.wiki{display:grid;grid-template-columns:240px 1fr;gap:28px}
.wiki aside{position:sticky;top:80px;align-self:start;background:#151922;border:1px solid #252b37;border-radius:18px;padding:14px;font-size:14px;max-height:calc(100vh - 100px);overflow:auto}
.wiki aside b{display:block;margin:12px 0 4px;color:#98a2b6;font-size:11px;text-transform:uppercase;letter-spacing:.08em}
.wiki aside a{display:block;padding:3px 8px;border-radius:8px;color:#eceff5}
.articulo section{border-bottom:1px solid #252b37;padding:8px 0 24px;scroll-margin-top:80px}
.articulo h3{font-size:22px;margin:18px 0 6px}
.articulo li{color:#c9d0dd;margin:4px 0}
.articulo img{border-radius:12px;border:1px solid #252b37;margin:10px 0}
.nota{border-left:3px solid #b49cff;background:#151922;padding:10px 14px;border-radius:0 12px 12px 0;font-size:14px;margin:12px 0;color:#c9d0dd}
code{background:#151922;border:1px solid #252b37;border-radius:6px;padding:1px 6px;font-size:13px}
pre{background:#10131a;border:1px solid #252b37;border-radius:12px;padding:14px;overflow-x:auto;font-size:13px;white-space:pre}
ol li{margin:8px 0}
.marco-demo{width:100%;height:760px;border:0;display:block;background:#121212}
footer{border-top:1px solid #252b37;padding:30px 0 50px;color:#98a2b6;font-size:14px}
footer .ancho{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}
[data-ms-comunidad],[data-ms-descargas]{max-width:820px}
[data-ms-comunidad] h3{margin-top:28px}
.ms-proyecto,.ms-descarga,.ms-form-proyecto{background:#151922;border-color:#252b37!important}
.ms-form-proyecto{padding:18px;border:1px solid;border-radius:18px}
.ms-boton,.ms-form-proyecto button,.ms-form-comentario button{color:#111!important}
@media (max-width:820px){
.menu-escritorio{display:none}
.menu-movil{display:block}
.wiki{grid-template-columns:1fr}
.wiki aside{position:static;max-height:none}
.marco-demo{height:640px}
.galeria{grid-template-columns:1fr}
}`;

const PAGINAS = [
  ["inicio", "Inicio", "/"],
  ["funciones", "Funciones", "/funciones"],
  ["descargas", "Descargas", "/descargas"],
  ["instalar", "Instalar", "/instalar"],
  ["wiki", "Wiki", "/wiki"],
  ["demo", "Demo", "/demo-en-vivo"],
  ["comunidad", "Comunidad", "/comunidad"],
] as const;
type IdPagina = (typeof PAGINAS)[number][0];

function marco(activa: IdPagina, cuerpo: string, logo: string | null): string {
  const enlaces = (clase: string) =>
    `<div class="menu ${clase}">${PAGINAS.slice(1)
      .map(([id, t, r]) => `<a href="${r}"${id === activa ? ' class="activo"' : ""}>${t}</a>`)
      .join("")}</div>`;
  return `<div class="aviso-ia">🤖 Hecho con IA · El autor no pide créditos · Esta es la página oficial de Mi Setup</div>
<nav class="nav"><div class="ancho"><a class="logo" href="/">${logo ? `<img src="${logo}" alt="" width="32" height="32">` : "<b>M</b>"} Mi Setup</a>${enlaces("menu-escritorio")}<details class="menu-movil"><summary aria-label="Menú">☰</summary>${enlaces("")}</details></div></nav>
<main class="pagina"><div class="ancho">${cuerpo}</div></main>
<footer><div class="ancho"><span>Mi Setup · Página oficial · Hecho con IA (el autor no pide créditos) · Código abierto (MIT)</span><span><a href="https://x.com/${X_OFICIAL}" target="_blank" rel="noopener">𝕏 @${X_OFICIAL}</a> · <a href="${GITHUB}" target="_blank" rel="noopener">GitHub</a></span></div></footer>`;
}

const ventana = (src: string, alt: string) => `<div class="ventana"><div class="barra"><i></i><i></i><i></i></div><img src="${src}" alt="${esc(alt)}"></div>`;

/** Capturas para cada tema de la wiki. */
const CAPTURA_TEMA: Record<string, string> = { "finanzas-personales": "finanzas", notas: "notas", calendario: "calendario", sitios: "sitios", "editor-fotos": "editor-fotos", herramientas: "herramientas", ia: "ia" };

export function armarSitioOficial(img: (nombre: string) => string | null, wiki: Wiki, version: string) {
  // El inicio enseña el video del recorrido (PC y celular); sin video, la captura de siempre.
  const recorrido = () => {
    const src = img("recorrido");
    if (!src) return "";
    const poster = img("recorrido-foto");
    return `<div class="recorrido"><video src="${src}"${poster ? ` poster="${poster}"` : ""} autoplay muted loop playsinline preload="metadata" aria-label="Recorrido de Mi Setup en la PC y en el celular"></video></div>`;
  };
  const foto = (n: string, alt: string) => {
    const src = img(n);
    return src ? ventana(src, alt) : "";
  };
  const celular = (n: string, alt: string) => {
    const src = img(n);
    return src ? `<div><div class="telefono"><img src="${src}" alt="${esc(alt)}"></div><p class="pie-foto">${esc(alt)}</p></div>` : "";
  };
  const tarjeta = (icono: string, titulo: string, texto: string) => `<div class="tarjeta"><div class="icono">${icono}</div><h3>${titulo}</h3><p>${texto}</p></div>`;

  const paginas: Record<IdPagina, string> = {
    inicio: `${img("recorrido") ? `<div class="heroe-texto">` : `<div class="heroe"><div>`}<span class="etiqueta">Código abierto · MIT · v${esc(version)}</span>
<h1>Tu servidor, tus apps y tu día <span>en un solo lugar</span></h1>
<p class="sub">Mi Setup se instala en tu propio VPS y lo usas desde la PC, el celular o el navegador: terminal, archivos, sitios web, finanzas, notas e IA. Tus datos se quedan contigo.</p>
<div class="fila" style="margin-top:24px"><a class="boton primario" href="/descargas">⬇ Descargar gratis</a><a class="boton" href="/app/">🌐 Usar en el navegador</a><a class="boton" href="/demo-en-vivo">Probar la demo</a></div></div>
${img("recorrido") ? recorrido() : `<div>${foto("inicio", "Inicio de Mi Setup en la PC")}</div></div>`}
<div class="rejilla" style="margin-top:70px">
${tarjeta("🔒", "Privado de verdad", "Corre en tu VPS. Contraseñas cifradas, 2FA, huella y avisos de inicio de sesión.")}
${tarjeta("📱", "PC, celular y web", "App de Windows, app de Android y navegador, todo sincronizado.")}
${tarjeta("🤖", "IA que solo propone", "La IA te ayuda, pero nada se ejecuta sin que toques «Aprobar».")}
${tarjeta("🧩", "Abierto", "Código en GitHub con licencia MIT. Mejóralo y compártelo en la Comunidad.")}
</div>`,

    funciones: `<h2>Funciones</h2><p class="intro">Cada persona ve solo los apartados que le das en Cuentas y permisos.</p>
<div class="rejilla">
${tarjeta("🖥️", "VPS", "Terminal, rendimiento, alertas de caída, comandos guardados, archivos, seguridad, respaldos y agentes de IA.")}
${tarjeta("🌐", "Sitios y apps", "Editor visual, dominio propio, DNS automático en Cloudflare, pedidos, cuentas, estadísticas y comunidad.")}
${tarjeta("🤖", "IA asistente", "Claude, modelos gratis en tu VPS y agentes. Solo propone: tú apruebas.")}
${tarjeta("💰", "Mis finanzas", "Gastos con foto del ticket, suscripciones, pagos divididos, impuestos y rendimientos.")}
${tarjeta("📝", "Notas y calendario", "Notas con fotos, voz y dictado, recordatorios, tareas y calendario.")}
${tarjeta("💼", "Negocio", "Clientes y cobros, vencimientos, gastos e ingresos del negocio.")}
${tarjeta("🔐", "Contraseñas y 2FA", "Bóveda cifrada, códigos 2FA, correos temporales y autocompletado en Android.")}
${tarjeta("🛡️", "Ciberseguridad", "Filtraciones de tu correo, correos peligrosos y avisos de inicio de sesión.")}
${tarjeta("🎨", "Estudio y herramientas", "Editor de fotos y video, convertidor, PDF, firma, enlaces cortos y códigos QR.")}
${tarjeta("💬", "Chat y equipos", "Canales con fotos, archivos, código y notas de voz.")}
${tarjeta("🌎", "Idiomas", "Español, inglés, portugués, francés, alemán e italiano.")}
${tarjeta("📈", "Novedades", "Noticias, cripto, inversiones y tipo de cambio.")}
</div>
<h2 style="margin-top:60px">Así se ve</h2><p class="intro">Capturas de la app con datos de ejemplo.</p>
<div class="galeria">${[
      ["finanzas", "Mis finanzas"],
      ["notas", "Bloc de notas"],
      ["calendario", "Calendario"],
      ["sitios", "Sitios y apps"],
      ["editor-fotos", "Editor de fotos"],
      ["herramientas", "Herramientas"],
    ]
      .map(([n, t]) => (img(n!) ? `<div>${foto(n!, t!)}<p class="pie-foto">${t}</p></div>` : ""))
      .join("")}</div>
<div class="fila" style="justify-content:center;gap:28px;margin-top:36px">${celular("finanzas-celular", "Finanzas en el celular")}${celular("notas-celular", "Notas en el celular")}</div>`,

    descargas: `<h2>Descargas</h2><p class="intro">La versión nueva y las 2 anteriores. Descarga Mi Setup solo desde esta página o desde el GitHub oficial.</p>
<div data-ms-descargas>Cargando descargas…</div>
<div class="rejilla" style="margin-top:28px">
<div class="tarjeta"><div class="icono">🖥️</div><h3>Servidor</h3><p>Código fuente con Docker para Ubuntu 22.04 o 24.04.</p><p style="margin-top:12px"><a class="boton" href="/instalar">Cómo instalar</a></p></div>
<div class="tarjeta"><div class="icono">🌐</div><h3>En el navegador</h3><p>Sin descargar nada: escribe la dirección de tu Mi Setup y entra. En el celular, «Agregar a inicio» la deja como app. No trae Servidores en mi PC, la terminal de PowerShell, autocompletar ni huella.</p><p style="margin-top:12px"><a class="boton" href="/app/">Usar en el navegador</a></p></div>
<div class="tarjeta"><div class="icono">🐙</div><h3>GitHub</h3><p>Todo el código, abierto y con licencia MIT.</p><p style="margin-top:12px"><a class="boton" href="${GITHUB}" target="_blank" rel="noopener">Abrir GitHub</a></p></div>
</div>`,

    instalar: `<h2>Requisitos e instalación</h2>
<p class="intro">Para tenerla encendida las 24 horas necesitas un <b>VPS</b> (un servidor rentado). También puedes instalarla en tu PC, pero solo funciona mientras la PC esté prendida y conectada a internet.</p>
<div class="rejilla">
<div class="tarjeta"><h3>Mínimo</h3><p>2 vCPU · 4 GB de RAM · 40 GB de disco · Ubuntu 22.04 o 24.04 · Docker</p></div>
<div class="tarjeta"><h3>Recomendado</h3><p>4 vCPU · 8 GB de RAM · 100 GB de disco (para la IA gratis, el antivirus y los respaldos)</p></div>
<div class="tarjeta"><h3>Dominio</h3><p>Un dominio con DNS en Cloudflare (gratis) para el HTTPS y los sitios.</p></div>
<div class="tarjeta"><h3>En tu PC</h3><p>Windows 10/11 con Docker Desktop. Solo funciona mientras la PC está prendida.</p></div>
</div>
<h3 style="margin-top:36px">Pasos en un VPS</h3>
<ol>
<li>Renta un VPS con Ubuntu y entra por SSH.</li>
<li>En Cloudflare apunta <code>setup.tudominio.com</code> a la IP del VPS.</li>
<li>Instala:<pre>git clone ${GITHUB}.git /opt/mi-setup/app
cd /opt/mi-setup/app &amp;&amp; sudo sh deploy/instalar.sh</pre></li>
<li>Abre <code>https://setup.tudominio.com</code>, crea tu cuenta y activa el 2FA.</li>
<li>Instala la app de Windows o de Android (en <a href="/descargas">Descargas</a>) y escribe la dirección de tu servidor.</li>
</ol>
<div class="nota">Las claves de servicios (IA, Cloudflare, Google…) se ponen en Ajustes → Servicios y claves. Nunca salen de tu servidor.</div>`,

    wiki: `<h2>Wiki</h2><p class="intro">Cómo se usa cada apartado de Mi Setup. Lo mismo que ves en el botón «¿Cómo se usa?» dentro de la app.</p>
<div class="wiki"><aside><a href="#primeros-pasos">Primeros pasos</a>${wiki
      .map((g) => `<b>${esc(g.grupo)}</b>${g.temas.map((t) => `<a href="#${t.id}">${esc(t.titulo)}</a>`).join("")}`)
      .join("")}</aside>
<div class="articulo">
<section id="primeros-pasos"><h3>Primeros pasos</h3><ol>
<li>Al abrir Mi Setup por primera vez creas la <b>cuenta maestra</b>: la que administra todo.</li>
<li>Activa el 2FA en Ajustes → Seguridad.</li>
<li>Pon las claves de los servicios que uses en Ajustes → Servicios y claves.</li>
<li>Invita a otras personas en Cuentas y permisos y dales solo los apartados que quieras. Lo que no tienen permitido no les aparece en ningún lado.</li>
</ol><div class="nota">La IA de Mi Setup solo propone: nada se ejecuta en tu servidor hasta que tocas «Aprobar».</div></section>
${wiki
  .flatMap((g) => g.temas)
  .map((t) => {
    const captura = CAPTURA_TEMA[t.id] ? img(CAPTURA_TEMA[t.id]!) : null;
    return `<section id="${t.id}"><h3>${esc(t.titulo)}</h3>${captura ? `<img src="${captura}" alt="${esc(t.titulo)}">` : ""}<ol>${t.pasos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>${t.nota ? `<div class="nota">${esc(t.nota)}</div>` : ""}</section>`;
  })
  .join("\n")}
</div></div>`,

    demo: `<h2>Demo en vivo</h2>
<p class="intro">Una copia de la app con datos de ejemplo, separada de cualquier VPS real. Se actualiza sola con cada versión nueva y <b>nada de lo que hagas se guarda</b>.</p>
<div class="ventana"><div class="barra"><i></i><i></i><i></i></div><iframe class="marco-demo" src="/demo/" title="Demo de Mi Setup" loading="lazy"></iframe></div>
<p class="pie-foto"><a href="/demo/" target="_blank" rel="noopener">Abrir la demo en pantalla completa</a></p>`,

    comunidad: `<h2>Comunidad</h2>
<p class="intro">Versiones mejoradas de Mi Setup hechas por la comunidad. ¿Hiciste la tuya? Súbela con tu nombre o como anónimo, y etiqueta a <a href="https://x.com/${X_OFICIAL}" target="_blank" rel="noopener"><b>@${X_OFICIAL}</b></a> en X.</p>
<div class="nota">Cada archivo se revisa con antivirus y aparece cuando el autor lo aprueba. Los mensajes con insultos o groserías se bloquean. El nombre «JokeerYT» está reservado: solo lo usa el autor oficial.</div>
<div data-ms-comunidad>Cargando comunidad…</div>`,
  };

  return {
    paginas: PAGINAS.map(([id, nombre]) => ({ nombre: id === "demo" ? "Demo en vivo" : nombre, html: marco(id, paginas[id], img("logo")) })),
    css: CSS_OFICIAL,
  };
}

function leerWiki(): Wiki {
  try {
    return JSON.parse(readFileSync(join(CARPETA_OFICIAL, "wiki.json"), "utf8")) as Wiki;
  } catch {
    return [];
  }
}

/** Crea (o actualiza con cada versión, si nadie lo editó) el sitio oficial sin publicar. */
export async function sembrarSitioOficial(deps: ModuleDeps): Promise<void> {
  if (deps.config.env.EDICION === "publica") return;
  const { db } = deps;
  const guardado = await getSetting<{ sitio: string; version: string; actualizado: string }>(db, CLAVE);
  let sitio: typeof sites.$inferSelect | undefined;
  if (guardado) {
    [sitio] = await db.select().from(sites).where(eq(sites.id, guardado.sitio));
    // Lo borraron o ya lo editaron: no se toca.
    if (!sitio || guardado.version === VERSION || sitio.updatedAt.toISOString() !== guardado.actualizado || sitio.published) return;
  } else {
    const [maestra] = await db.select({ id: users.id }).from(users).where(and(eq(users.role, "maestra"), eq(users.isActive, true))).orderBy(asc(users.createdAt)).limit(1);
    if (!maestra) return; // Se intenta otra vez al siguiente arranque.
    const [ocupado] = await db.select({ id: sites.id }).from(sites).where(eq(sites.slug, SLUG_OFICIAL));
    if (ocupado) {
      await setSetting(db, CLAVE, { sitio: ocupado.id, version: VERSION, actualizado: "" }, deps.now());
      return;
    }
    [sitio] = await db
      .insert(sites)
      .values({
        ownerId: maestra.id,
        slug: SLUG_OFICIAL,
        name: "Mi Setup (página oficial)",
        draft: {},
        settings: {
          titulo: "Mi Setup — página oficial",
          descripcion: "Tu servidor, tus apps y tu día en un solo lugar. Gratis y de código abierto.",
          color: "#b49cff",
          moneda: "MXN",
          avisos: true,
          comunidad: { activa: true, oficial: "JokeerYT" },
          demo: true,
          descargas: true,
        },
      })
      .returning();
  }
  if (!sitio) return;
  const ahora = await generarContenido(deps, sitio, false);
  await setSetting(db, CLAVE, { sitio: sitio.id, version: VERSION, actualizado: ahora.toISOString() }, ahora);
}

const CAPTURAS = ["inicio", "finanzas", "notas", "calendario", "ia", "sitios", "herramientas", "editor-fotos", "finanzas-celular", "notas-celular"];
/** Archivos del sitio: [nombre, ruta dentro de sitio-oficial, tipo]. */
const ARCHIVOS: [string, string, string][] = [
  ["logo", "logo.png", "image/png"],
  ...CAPTURAS.map((n): [string, string, string] => [n, `capturas/${n}.png`, "image/png"]),
  ["recorrido", "video/recorrido.webm", "video/webm"],
  ["recorrido-foto", "video/recorrido.png", "image/png"],
];
const rutaDe = (nombre: string, i: number) =>
  i === 0
    ? "/"
    : `/${nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`;

async function generarContenido(deps: ModuleDeps, sitio: typeof sites.$inferSelect, publicar: boolean): Promise<Date> {
  const { db } = deps;
  const dir = join(carpetaArchivos(deps), "sitios", sitio.id);
  await mkdir(dir, { recursive: true });
  const previas = await db.select().from(siteAssets).where(eq(siteAssets.siteId, sitio.id));
  const ids = new Map<string, string>();
  for (const [nombre, relativa, mime] of ARCHIVOS) {
    const ruta = join(CARPETA_OFICIAL, relativa);
    if (!existsSync(ruta)) continue;
    const datos = readFileSync(ruta);
    const archivo = `${nombre}${relativa.slice(relativa.lastIndexOf("."))}`;
    const previa = previas.find((a) => a.name === archivo);
    if (previa) {
      await writeFile(join(dir, previa.storedName), datos);
      await db.update(siteAssets).set({ size: datos.length }).where(eq(siteAssets.id, previa.id));
      ids.set(nombre, previa.id);
    } else {
      const interno = crypto.randomUUID();
      await writeFile(join(dir, interno), datos);
      const [a] = await db.insert(siteAssets).values({ siteId: sitio.id, name: archivo, storedName: interno, mime, size: datos.length }).returning();
      ids.set(nombre, a!.id);
    }
  }
  const id = sitio.id;
  const contenido = armarSitioOficial((n) => (ids.has(n) ? `/api/sitios/${id}/archivos/${ids.get(n)}` : null), leerWiki(), VERSION);
  const ahora = deps.now();
  const ajustes = { ...(sitio.settings as Record<string, unknown>), ...(ids.has("logo") ? { icono: ids.get("logo") } : {}) };
  const cambios: Partial<typeof sites.$inferInsert> = { draft: { importado: contenido }, settings: ajustes, updatedAt: ahora };
  if (publicar) {
    const publico = (t: string) => t.split(`/api/sitios/${id}/archivos/`).join("/_archivos/");
    const paginas = contenido.paginas.map((p, i) => ({ ruta: rutaDe(p.nombre, i), titulo: i === 0 ? "" : p.nombre, html: publico(p.html), css: publico(contenido.css), privada: false }));
    cambios.published = { paginas };
    cambios.publishedAt = ahora;
    await db.insert(siteVersions).values({ siteId: id, draft: { importado: contenido }, published: { paginas }, note: `Actualizado a la versión ${VERSION}` });
  }
  await db.update(sites).set(cambios).where(eq(sites.id, id));
  return ahora;
}

export async function actualizarSitioOficial(deps: ModuleDeps, sitio: typeof sites.$inferSelect): Promise<{ publicado: boolean }> {
  const publicar = Boolean(sitio.published);
  const ahora = await generarContenido(deps, sitio, publicar);
  await setSetting(deps.db, CLAVE, { sitio: sitio.id, version: VERSION, actualizado: ahora.toISOString() }, ahora);
  return { publicado: publicar };
}
