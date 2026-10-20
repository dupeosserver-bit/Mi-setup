/**
 * Texto de las notas con el estilo de Discord: **negrita**, *cursiva*, __subrayado__, ~~tachado~~,
 * ||spoiler|| (se esconde hasta que lo tocas), `código`, > cita, # títulos, -# texto pequeño,
 * listas y casillas. Se muestra como página con los símbolos escondidos.
 */
import DOMPurify from "dompurify";
import { Marked, type Tokens, type TokenizerAndRendererExtension } from "marked";
import { API_BASE } from "./api";

export const COLORES_NOTA = {
  rojo: { nombre: "Rojo", fondo: "rgba(239, 68, 68, 0.16)", punto: "#ef4444" },
  naranja: { nombre: "Naranja", fondo: "rgba(249, 115, 22, 0.16)", punto: "#f97316" },
  amarillo: { nombre: "Amarillo", fondo: "rgba(234, 179, 8, 0.18)", punto: "#eab308" },
  verde: { nombre: "Verde", fondo: "rgba(34, 197, 94, 0.15)", punto: "#22c55e" },
  azul: { nombre: "Azul", fondo: "rgba(59, 130, 246, 0.16)", punto: "#3b82f6" },
  morado: { nombre: "Morado", fondo: "rgba(139, 92, 246, 0.17)", punto: "#8b5cf6" },
  rosa: { nombre: "Rosa", fondo: "rgba(236, 72, 153, 0.16)", punto: "#ec4899" },
  gris: { nombre: "Gris", fondo: "rgba(148, 163, 184, 0.16)", punto: "#94a3b8" },
} as const;
export type ColorNota = keyof typeof COLORES_NOTA;
export const fondoNota = (c: string | null | undefined): string | undefined => (c && c in COLORES_NOTA ? COLORES_NOTA[c as ColorNota].fondo : undefined);

type Token = Tokens.Generic;

const spoiler: TokenizerAndRendererExtension = {
  name: "spoiler",
  level: "inline",
  start: (src) => src.indexOf("||"),
  tokenizer(src) {
    const m = /^\|\|(?=\S)([^\n]+?)(?<=\S)\|\|/.exec(src);
    if (!m) return undefined;
    return { type: "spoiler", raw: m[0], text: m[1]!, tokens: this.lexer.inlineTokens(m[1]!) };
  },
  renderer(t: Token) {
    return `<span class="spoiler" data-spoiler>${this.parser.parseInline(t.tokens ?? [])}</span>`;
  },
};

/** En Discord __texto__ es subrayado (en Markdown normal sería negrita). */
const subrayado: TokenizerAndRendererExtension = {
  name: "subrayado",
  level: "inline",
  start: (src) => src.indexOf("__"),
  tokenizer(src) {
    const m = /^__(?=\S)([^\n]+?)(?<=\S)__(?!_)/.exec(src);
    if (!m) return undefined;
    return { type: "subrayado", raw: m[0], text: m[1]!, tokens: this.lexer.inlineTokens(m[1]!) };
  },
  renderer(t: Token) {
    return `<u>${this.parser.parseInline(t.tokens ?? [])}</u>`;
  },
};

/** «-# texto» = letra pequeña y apagada, como en Discord. */
const pequeno: TokenizerAndRendererExtension = {
  name: "pequeno",
  level: "block",
  start: (src) => src.match(/^-# /m)?.index,
  tokenizer(src) {
    const m = /^-# +([^\n]+)(?:\n|$)/.exec(src);
    if (!m) return undefined;
    return { type: "pequeno", raw: m[0], text: m[1]!, tokens: this.lexer.inlineTokens(m[1]!) };
  },
  renderer(t: Token) {
    return `<p class="texto-pequeno">${this.parser.parseInline(t.tokens ?? [])}</p>\n`;
  },
};

const motor = new Marked({ gfm: true, breaks: true });
motor.use({ extensions: [spoiler, subrayado, pequeno] });

/** Markdown a HTML sin limpiar (para pruebas); en la pantalla se usa aHtml. */
export function renderMarkdown(contenido: string): string {
  let indice = 0;
  // Las notas de voz ([🎤 …](adjunto)) se ven como reproductor.
  const html = (motor.parse(contenido, { async: false }) as string).replace(
    /<a href="(\/api\/notas\/adjuntos\/[\w-]+\/[\w-]+)">🎤([^<]*)<\/a>/g,
    (_m, src: string, texto: string) => `<span class="nota-voz">🎤${texto}<audio controls preload="none" src="${src}"></audio></span>`,
  );
  // Cada casilla lleva su número para poder marcarla desde la página.
  return html.replace(/<input([^>]*?)type="checkbox"([^>]*?)>/g, (_m, a: string, b: string) => {
    const marcada = /checked/.test(a + b);
    return `<input type="checkbox" data-casilla="${indice++}"${marcada ? " checked" : ""}>`;
  });
}

/** Direcciones del servidor guardadas como /api/… se completan (en el celular la app no vive en el mismo sitio). */
const completarDirecciones = (html: string): string => html.replace(/(src|href)="(\/api\/notas\/adjuntos\/)/g, (_m, atributo: string, ruta: string) => `${atributo}="${API_BASE}${ruta}`);

/** Convierte el texto en página (HTML limpio: sin scripts ni eventos). */
export function aHtml(contenido: string): string {
  const limpio = DOMPurify.sanitize(renderMarkdown(contenido), { ADD_TAGS: ["audio"], ADD_ATTR: ["data-casilla", "data-spoiler", "controls", "preload"], FORBID_TAGS: ["style", "form"], FORBID_ATTR: ["style"] });
  return completarDirecciones(limpio);
}

/** Quita de la nota los enlaces/imágenes que apuntan a un adjunto borrado. */
export function quitarAdjunto(contenido: string, ruta: string): string {
  const escapada = ruta.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return contenido.replace(new RegExp(`!?\\[[^\\]]*\\]\\(${escapada}\\)\\n?`, "g"), "");
}

export const fmtTamano = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
