/**
 * Exportar e importar sitios con todo:
 * - Paquete de Mi Setup (.zip con sitio.json + archivos/): editor (todas las
 *   páginas), lo publicado, ajustes, tablas de datos e imágenes y archivos.
 *   Se vuelve a abrir igualito en este u otro Mi Setup.
 * - Un sitio que ya tienes hecho: un .html o un .zip con index.html, otras
 *   páginas .html, su CSS y sus imágenes. Se convierte a páginas del editor.
 * No se importan cuentas de visitantes, pedidos ni estadísticas (son datos de
 * personas y se quedan en el sitio original).
 */
import { load } from "cheerio";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { HttpError } from "../../http-error.js";

export const FORMATO_SITIO = "mi-setup-sitio";
const MAX_ARCHIVOS = 400;
const MAX_TOTAL = 150 * 1024 * 1024;

export interface ArchivoPaquete {
  id: string;
  nombre: string;
  mime: string;
  datos: Uint8Array;
}

export interface DatosSitio {
  formato: typeof FORMATO_SITIO;
  version: 1;
  nombre: string;
  slug: string;
  ajustes: Record<string, unknown>;
  borrador: Record<string, unknown>;
  publicado: unknown;
  tablas: { nombre: string; columnas: unknown; filas: unknown }[];
  archivos: { id: string; nombre: string; mime: string }[];
}

export function armarPaquete(datos: Omit<DatosSitio, "formato" | "version" | "archivos">, archivos: ArchivoPaquete[]): Uint8Array {
  const json: DatosSitio = { formato: FORMATO_SITIO, version: 1, ...datos, archivos: archivos.map(({ id, nombre, mime }) => ({ id, nombre, mime })) };
  const zip: Record<string, Uint8Array> = { "sitio.json": strToU8(JSON.stringify(json)) };
  for (const a of archivos) zip[`archivos/${a.id}`] = a.datos;
  zip["LEEME.txt"] = strToU8(`Sitio «${datos.nombre}» de Mi Setup. Para abrirlo: Sitios y apps → Importar → elige este .zip.\n`);
  return zipSync(zip, { level: 6 });
}

const MIME_POR_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  pdf: "application/pdf",
  zip: "application/zip",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
  txt: "text/plain",
  csv: "text/csv",
};
export const mimePorNombre = (n: string) => MIME_POR_EXT[n.split(".").pop()?.toLowerCase() ?? ""] ?? null;

export type Importado =
  | { tipo: "mi-setup"; datos: DatosSitio; archivos: Map<string, Uint8Array> }
  | { tipo: "html"; nombre: string; paginas: { nombre: string; html: string }[]; css: string; archivos: Map<string, { nombre: string; mime: string; datos: Uint8Array }> };

/** Normaliza una ruta relativa del zip ("./img/a.png", "../x") respecto a la página. */
export function resolverRuta(base: string, ruta: string): string | null {
  if (/^(https?:|data:|mailto:|tel:|#|\/\/)/i.test(ruta)) return null;
  const limpia = ruta.split(/[?#]/)[0]!;
  const partes = (limpia.startsWith("/") ? [] : base.split("/").slice(0, -1)).concat(limpia.split("/"));
  const salida: string[] = [];
  for (const p of partes) {
    if (!p || p === ".") continue;
    if (p === "..") salida.pop();
    else salida.push(p);
  }
  return salida.join("/");
}

function quitarCarpetaComun(rutas: string[]): string {
  const conIndex = rutas.filter((r) => /(^|\/)index\.html?$/i.test(r)).sort((a, b) => a.split("/").length - b.split("/").length)[0];
  return conIndex ? conIndex.replace(/index\.html?$/i, "") : "";
}

export function leerImportacion(nombreArchivo: string, buf: Uint8Array): Importado {
  const esZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
  if (!esZip) {
    if (!/\.html?$/i.test(nombreArchivo)) throw new HttpError(400, "Sube un .zip (de Mi Setup o de tu sitio) o un archivo .html");
    const html = strFromU8(buf);
    return convertirHtml(new Map([["index.html", html]]), new Map(), nombreArchivo.replace(/\.html?$/i, ""));
  }
  let total = 0;
  const contenido = unzipSync(buf, {
    filter: (f) => {
      total += f.originalSize;
      if (total > MAX_TOTAL) throw new HttpError(413, "El sitio pesa más de 150 MB");
      return !f.name.endsWith("/") && !f.name.includes("__MACOSX");
    },
  });
  const nombres = Object.keys(contenido);
  if (nombres.length > MAX_ARCHIVOS * 2) throw new HttpError(400, "El .zip trae demasiados archivos");
  if (contenido["sitio.json"]) {
    const datos = JSON.parse(strFromU8(contenido["sitio.json"])) as DatosSitio;
    if (datos.formato !== FORMATO_SITIO) throw new HttpError(400, "El sitio.json no es de Mi Setup");
    const archivos = new Map<string, Uint8Array>();
    for (const a of datos.archivos ?? []) {
      const d = contenido[`archivos/${a.id}`];
      if (d) archivos.set(a.id, d);
    }
    return { tipo: "mi-setup", datos, archivos };
  }
  const raiz = quitarCarpetaComun(nombres);
  const paginas = new Map<string, string>();
  const recursos = new Map<string, Uint8Array>();
  for (const n of nombres) {
    if (raiz && !n.startsWith(raiz)) continue;
    const rel = n.slice(raiz.length);
    if (/\.html?$/i.test(rel)) paginas.set(rel, strFromU8(contenido[n]!));
    else recursos.set(rel, contenido[n]!);
  }
  if (!paginas.size) throw new HttpError(400, "El .zip no trae ninguna página .html");
  return convertirHtml(paginas, recursos, nombreArchivo.replace(/\.zip$/i, ""));
}

/** Convierte páginas HTML sueltas en páginas del editor (el CSS de todas se junta). */
function convertirHtml(paginas: Map<string, string>, recursos: Map<string, Uint8Array>, nombre: string): Importado & { tipo: "html" } {
  const archivos = new Map<string, { nombre: string; mime: string; datos: Uint8Array }>();
  const estilos: string[] = [];
  const cssVistos = new Set<string>();
  const usar = (ruta: string | null) => {
    if (!ruta || !recursos.has(ruta)) return null;
    const mime = mimePorNombre(ruta);
    if (!mime) return null;
    if (!archivos.has(ruta)) archivos.set(ruta, { nombre: ruta.split("/").pop()!, mime, datos: recursos.get(ruta)! });
    return `{{archivo:${ruta}}}`;
  };
  // Las url(...) del CSS apuntan a imágenes del zip.
  const arreglarCss = (css: string, base: string) =>
    css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (todo, comilla: string, ruta: string) => {
      const r = usar(resolverRuta(base, ruta));
      return r ? `url(${comilla}${r}${comilla})` : todo;
    });
  const orden = [...paginas.keys()].sort((a, b) => (/^index\.html?$/i.test(a) ? -1 : /^index\.html?$/i.test(b) ? 1 : a.localeCompare(b)));
  const salida: { nombre: string; html: string }[] = [];
  for (const ruta of orden.slice(0, 30)) {
    const $ = load(paginas.get(ruta)!);
    $("script").remove();
    $("[onclick],[onload],[onerror],[onmouseover]").each((_, el) => {
      for (const at of Object.keys((el as { attribs?: Record<string, string> }).attribs ?? {})) if (/^on/i.test(at)) $(el).removeAttr(at);
    });
    $("style").each((_, el) => {
      estilos.push(arreglarCss($(el).html() ?? "", ruta));
    });
    $('link[rel="stylesheet"]').each((_, el) => {
      const r = resolverRuta(ruta, $(el).attr("href") ?? "");
      if (r && recursos.has(r) && !cssVistos.has(r)) {
        cssVistos.add(r);
        estilos.push(arreglarCss(strFromU8(recursos.get(r)!), r));
      }
    });
    $("img[src], source[src], video[src], audio[src], a[href]").each((_, el) => {
      const at = el.tagName === "a" ? "href" : "src";
      const valor = $(el).attr(at) ?? "";
      const destino = resolverRuta(ruta, valor);
      if (el.tagName === "a" && destino && /\.html?$/i.test(destino)) {
        // Enlaces entre páginas: se cambian a las rutas del sitio.
        const n = destino.replace(/\.html?$/i, "").replace(/(^|\/)index$/i, "");
        $(el).attr("href", n ? `/${n.split("/").pop()}` : "/");
        return;
      }
      const r = usar(destino);
      if (r) $(el).attr(at, r);
    });
    $("[style]").each((_, el) => {
      $(el).attr("style", arreglarCss($(el).attr("style") ?? "", ruta));
    });
    const titulo = $("title").first().text().trim();
    const base = ruta.replace(/\.html?$/i, "").split("/").pop() ?? "";
    salida.push({ nombre: /^index$/i.test(base) ? titulo || "Inicio" : titulo || base, html: $("body").html() ?? $.root().html() ?? "" });
  }
  return { tipo: "html", nombre: nombre || "Sitio importado", paginas: salida, css: estilos.join("\n"), archivos };
}

/** Cambia {{archivo:ruta}} por la dirección del archivo ya subido. */
export function ponerArchivos(texto: string, urls: Map<string, string>): string {
  return texto.replace(/\{\{archivo:([^}]+)\}\}/g, (todo, ruta: string) => urls.get(ruta) ?? todo);
}

/** Cambia los ids viejos de archivos por los nuevos en todo el JSON del sitio. */
export function cambiarIds<T>(valor: T, ids: Map<string, string>): T {
  let texto = JSON.stringify(valor);
  for (const [viejo, nuevo] of ids) texto = texto.split(viejo).join(nuevo);
  return JSON.parse(texto) as T;
}
