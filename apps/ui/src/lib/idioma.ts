/**
 * Idiomas de la interfaz. La app está escrita en español; para los demás
 * idiomas un traductor cambia los textos que se ven en pantalla (y los
 * placeholder, title y aria-label) usando el diccionario del idioma, que se
 * baja solo cuando se elige. Lo que no está en el diccionario (nombres,
 * notas, datos del usuario) se queda tal cual.
 *
 * Los diccionarios viven en src/i18n/<idioma>.json: { "texto en español": "traducción" }.
 * Las claves con {0}, {1}… son plantillas: lo que va en su lugar se copia igual.
 * `pnpm --filter @mi-setup/ui i18n` lista los textos nuevos que faltan.
 */
import { IDIOMAS_APP, type IdiomaApp } from "@mi-setup/shared";

const CLAVE = "mi-setup.idioma";

/** Para fechas y dinero (Intl). */
export const LOCALES: Record<IdiomaApp, string> = { es: "es-MX", en: "en-US", pt: "pt-BR", fr: "fr-FR", de: "de-DE", it: "it-IT" };

const CARGAR: Record<Exclude<IdiomaApp, "es">, () => Promise<{ default: Record<string, string> }>> = {
  en: () => import("../i18n/en.json"),
  pt: () => import("../i18n/pt.json"),
  fr: () => import("../i18n/fr.json"),
  de: () => import("../i18n/de.json"),
  it: () => import("../i18n/it.json"),
};

const esIdioma = (v: unknown): v is IdiomaApp => typeof v === "string" && v in IDIOMAS_APP;

/** Idioma guardado en este dispositivo (sin esperar a la cuenta). */
export function idiomaGuardado(): IdiomaApp {
  try {
    const v = localStorage.getItem(CLAVE);
    if (esIdioma(v)) return v;
  } catch {
    /* sin almacenamiento */
  }
  return "es";
}

export const localeActual = (): string => LOCALES[idiomaGuardado()];

// ---------------------------------------------------------------- diccionario

interface Plantilla {
  readonly patron: RegExp;
  readonly huecos: number[];
  readonly destino: string;
}

export interface Diccionario {
  readonly exactos: Map<string, string>;
  readonly plantillas: Plantilla[];
}

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizar = (s: string) => s.replace(/\s+/g, " ").trim();

export function crearDiccionario(datos: Record<string, string>): Diccionario {
  const exactos = new Map<string, string>();
  const plantillas: Plantilla[] = [];
  for (const [es, otro] of Object.entries(datos)) {
    if (!otro) continue;
    if (/\{\d+\}/.test(es)) {
      const huecos: number[] = [];
      const patron = es
        .split(/(\{\d+\})/)
        .map((parte) => {
          const m = /^\{(\d+)\}$/.exec(parte);
          if (!m) return escapar(parte);
          huecos.push(Number(m[1]));
          return "(.+?)";
        })
        .join("");
      plantillas.push({ patron: new RegExp(`^${patron}$`, "s"), huecos, destino: otro });
    } else exactos.set(normalizar(es), otro);
  }
  // Las plantillas con más texto fijo primero (son más específicas).
  plantillas.sort((a, b) => b.patron.source.length - a.patron.source.length);
  return { exactos, plantillas };
}

/** Traduce un texto completo (respeta los espacios de las orillas). Devuelve null si no lo conoce. */
export function traducirTexto(dic: Diccionario, texto: string): string | null {
  const limpio = normalizar(texto);
  if (!limpio || !/[a-záéíóúñ¿¡]/i.test(limpio)) return null;
  let r = dic.exactos.get(limpio) ?? null;
  if (r === null) {
    for (const p of dic.plantillas) {
      const m = p.patron.exec(limpio);
      if (!m) continue;
      const valores: Record<number, string> = {};
      p.huecos.forEach((n, i) => (valores[n] = m[i + 1] ?? ""));
      // Lo que va en el hueco también puede ser un texto conocido («Opciones de {0}» con {0} = «Notas»).
      r = p.destino.replace(/\{(\d+)\}/g, (_, n: string) => {
        const v = valores[Number(n)] ?? "";
        return dic.exactos.get(v) ?? v;
      });
      break;
    }
  }
  if (r === null) return null;
  const inicio = /^\s*/.exec(texto)?.[0] ?? "";
  const fin = /\s*$/.exec(texto)?.[0] ?? "";
  return inicio + r + fin;
}

// ---------------------------------------------------------------- traductor de la pantalla

const ATRIBUTOS = ["placeholder", "title", "aria-label", "alt"] as const;
/** Dentro de estos no se toca nada: código, editores y lo que escribe el usuario. */
const NO_TRADUCIR = "script,style,textarea,code,pre,kbd,[contenteditable=''],[contenteditable='true'],[translate='no'],.notranslate,.monaco-editor,.xterm,.gjs-editor-cont";

let dic: Diccionario | null = null;
let observador: MutationObserver | null = null;
/** Texto original (en español) de cada nodo que se tradujo, para volver o retraducir. */
const originales = new WeakMap<Node, { es: string; puesto: string }>();
const atributosOriginales = new WeakMap<Element, Map<string, { es: string; puesto: string }>>();
const tocados = new Set<WeakRef<Node>>();
let tituloOriginal: string | null = null;

function bloqueado(el: Element | null): boolean {
  return Boolean(el?.closest(NO_TRADUCIR));
}

function traducirNodoTexto(n: Text): void {
  if (!dic) return;
  const previo = originales.get(n);
  const actual = n.nodeValue ?? "";
  // Si el valor es el que pusimos, no hay nada nuevo; si React lo cambió, el nuevo es el español.
  const es = previo && previo.puesto === actual ? previo.es : actual;
  if (bloqueado(n.parentElement)) return;
  const t = traducirTexto(dic, es);
  if (t === null || t === actual) {
    if (previo && previo.puesto !== actual) originales.delete(n);
    return;
  }
  originales.set(n, { es, puesto: t });
  tocados.add(new WeakRef(n));
  n.nodeValue = t;
}

function traducirAtributos(el: Element): void {
  if (!dic || bloqueado(el)) return;
  for (const a of ATRIBUTOS) {
    const actual = el.getAttribute(a);
    if (!actual) continue;
    let mapa = atributosOriginales.get(el);
    const previo = mapa?.get(a);
    const es = previo && previo.puesto === actual ? previo.es : actual;
    const t = traducirTexto(dic, es);
    if (t === null || t === actual) continue;
    if (!mapa) {
      mapa = new Map();
      atributosOriginales.set(el, mapa);
    }
    mapa.set(a, { es, puesto: t });
    tocados.add(new WeakRef(el));
    el.setAttribute(a, t);
  }
}

function recorrer(raiz: Node): void {
  if (raiz.nodeType === Node.TEXT_NODE) return traducirNodoTexto(raiz as Text);
  if (!(raiz instanceof Element) && raiz !== document.body) return;
  if (raiz instanceof Element) {
    if (bloqueado(raiz)) return;
    traducirAtributos(raiz);
  }
  const caminante = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n instanceof Element && n.matches(NO_TRADUCIR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = caminante.nextNode(); n; n = caminante.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) traducirNodoTexto(n as Text);
    else traducirAtributos(n as Element);
  }
}

function traducirTitulo(): void {
  if (!dic) return;
  tituloOriginal ??= document.title;
  const t = traducirTexto(dic, tituloOriginal);
  if (t) document.title = t;
}

function detener(): void {
  observador?.disconnect();
  observador = null;
  // Regresa todo al español.
  for (const ref of tocados) {
    const n = ref.deref();
    if (!n) continue;
    if (n.nodeType === Node.TEXT_NODE) {
      const o = originales.get(n);
      if (o && n.nodeValue === o.puesto) n.nodeValue = o.es;
      originales.delete(n);
    } else if (n instanceof Element) {
      for (const [a, o] of atributosOriginales.get(n) ?? []) if (n.getAttribute(a) === o.puesto) n.setAttribute(a, o.es);
      atributosOriginales.delete(n);
    }
  }
  tocados.clear();
  if (tituloOriginal !== null) document.title = tituloOriginal;
  tituloOriginal = null;
}

function arrancar(): void {
  recorrer(document.body);
  traducirTitulo();
  observador = new MutationObserver((cambios) => {
    for (const c of cambios) {
      if (c.type === "characterData") traducirNodoTexto(c.target as Text);
      else if (c.type === "attributes") traducirAtributos(c.target as Element);
      else c.addedNodes.forEach((n) => recorrer(n));
    }
  });
  observador.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATRIBUTOS] });
}

let pedido = 0;

/** Cambia el idioma de la pantalla (y lo recuerda en este dispositivo). */
export async function ponerIdioma(idioma: IdiomaApp): Promise<void> {
  const mio = ++pedido;
  try {
    localStorage.setItem(CLAVE, idioma);
  } catch {
    /* sin almacenamiento */
  }
  document.documentElement.lang = idioma;
  if (idioma === "es") {
    dic = null;
    detener();
    return;
  }
  const datos = (await CARGAR[idioma]()).default;
  if (mio !== pedido) return;
  detener();
  dic = crearDiccionario(datos);
  arrancar();
}

/** Traduce un texto suelto desde el código (p. ej. para window.confirm o el título). */
export function t(texto: string): string {
  return (dic && traducirTexto(dic, texto)) ?? texto;
}
