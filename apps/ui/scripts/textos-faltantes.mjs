#!/usr/bin/env node
/**
 * pnpm --filter @mi-setup/ui i18n — lista los textos de la interfaz que todavía
 * no están en los diccionarios de src/i18n (en, pt, fr, de, it).
 * Saca el texto de JSX, cadenas y plantillas (con {0}, {1}… donde va algo variable).
 * Tradúcelos y agrégalos a cada <idioma>.json con la misma clave en español
 * (o a no-traducir.json si deben quedarse igual).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const archivos = [];
(function rec(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) rec(p);
    else if (/\.tsx?$/.test(f) && !/\.test\.|\.d\.ts|grapesjs-locale/.test(f)) archivos.push(p);
  }
})(raiz);
const textos = new Set();
const plantillas = new Set();
const ATRIB_NO = /^(className|type|href|src|key|id|to|accept|name|autoComplete|inputMode|rel|target|role|method|d|viewBox|fill|stroke|value|defaultValue|pattern|lang|htmlFor|style|data-[\w-]+|capture|sandbox|allow|referrerPolicy|loading|crossOrigin|encType|form|list|dir|wrap|spellCheck|draggable)$/;
const LLAMADAS_NO = /^(api|querySelector|querySelectorAll|getElementById|addEventListener|removeEventListener|createElement|setItem|getItem|removeItem|fetch|startsWith|endsWith|includes|split|join|replace|replaceAll|test|matchMedia|get|set|has|delete|on|off|emit|toLocaleString|toLocaleDateString|toLocaleTimeString|NumberFormat|DateTimeFormat|setAttribute|getAttribute|removeAttribute|closest|matches|append|send|postMessage|invoke|require|import|Error|RegExp|descargar|guardarBlob|setProperty|getPropertyValue|insertAdjacentHTML|execCommand|runCommand|addCommand|getComponent|indexOf|lastIndexOf|padStart|padEnd|localeCompare|cx|clsx|encodeURIComponent|decodeURIComponent|atob|btoa|parseInt|parseFloat|Number|Symbol|navegar|navigate|invalidateQueries|setQueryData|getQueryData|log|warn|error|info|debug|dispatchEvent|Event|CustomEvent|abrirExterno|on|emit|createObjectURL|track|load|add|select)$/;
const parece = (s) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length < 2 || t.length > 4000) return false;
  if (!/[a-záéíóúñü]/i.test(t)) return false;
  if (/^(https?:|\/|#|\.|\{|<|\$)/.test(t)) return false;
  if (/^[\w.-]+\.(png|jpe?g|svg|webp|gif|mp4|webm|mp3|zip|json|js|ts|tsx|css|html?|pdf|txt|md|py|java|yml|yaml|exe|apk|sh)$/i.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9_]*$/.test(t)) return false; // identificadores
  if (/^[a-z0-9:_\-/[\].%#(),+*]+( [a-z0-9:_\-/[\].%#(),+*!]+)*$/.test(t) && !/[áéíóúñ]/.test(t) && !/^(de|en|el|la|los|las|y|o|con|sin|por|para|del|al|un|una|que|se|no|si|ya|es|mi|tu|su|lo|le)( |$)/.test(t)) return false; // clases css y valores
  if (/(rgba?\(|gradient\(|var\(--|calc\(|=>|function |\bdef \b|console\.|\{\{|;\s*$|^[a-z-]+:\s\S+$)/.test(t)) return false;
  if (/^[A-Z_][A-Z0-9_]+$/.test(t)) return false; // CONSTANTES
  if (/^[\w-]+\/[\w.+-]+$/.test(t)) return false; // mime
  return true;
};
const agregar = (t) => textos.add(t);
for (const f of archivos) {
  const src = ts.createSourceFile(f, readFileSync(f, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const prohibido = (n) => {
    let p = n.parent;
    if (ts.isJsxAttribute(p) && ATRIB_NO.test(p.name.getText())) return true;
    if (ts.isJsxExpression(p) && ts.isJsxAttribute(p.parent) && ATRIB_NO.test(p.parent.name.getText())) return true;
    if (ts.isCallExpression(p) && p.arguments.includes(n)) { const nombre = p.expression.getText().split(".").pop(); if (LLAMADAS_NO.test(nombre)) return true; }
    if (ts.isNewExpression(p)) return true;
    if (ts.isBinaryExpression(p) && /^(===|!==|==|!=|in)$/.test(p.operatorToken.getText())) return true;
    if (ts.isCaseClause(p)) return true;
    if (ts.isPropertyAssignment(p) && p.name === n) return true;
    if (ts.isLiteralTypeNode(p) || ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p) || ts.isModuleDeclaration(p)) return true;
    if (ts.isElementAccessExpression(p)) return true;
    if (ts.isPropertyAssignment(p) && /^(id|ruta|clave|tipo|url|icono|modulo|valor|value|src|href|className|color|formato|mime|ext|accept|patron|regex|campo|variable|nombreArchivo|sitio|key|tag|lang|codigo|code|comando|cmd|html|css|js|plantilla|json|svg|emoji|archivo|path|host|dominio|ip|puerto|selector|evento|categoria_id)$/.test(p.name.getText())) return true;
    return false;
  };
  const visit = (n) => {
    if (ts.isJsxText(n)) { const t = n.text.replace(/\s+/g, " ").trim(); if (parece(t)) agregar(t); }
    else if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !prohibido(n)) { const t = n.text.replace(/\s+/g, " ").trim(); if (parece(t)) agregar(t); }
    else if (ts.isTemplateExpression(n) && !prohibido(n)) {
      let t = n.head.text; n.templateSpans.forEach((s, i) => { t += `{${i}}` + s.literal.text; });
      t = t.replace(/\s+/g, " ").trim();
      const soloTexto = t.replace(/\{\d+\}/g, "");
      if (/[a-záéíóúñ]{3,}/i.test(soloTexto) && /\s/.test(soloTexto.trim()) && parece(soloTexto.replace(/\s+/g, " ").trim() || "x") && !/^\{\d+\}$/.test(t)) plantillas.add(t);
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}

const IDIOMAS = ["en", "pt", "fr", "de", "it"];
// Textos que se dejan igual a propósito (código, nombres propios, datos de ejemplo).
const igual = new Set(JSON.parse(readFileSync(join(raiz, "i18n", "no-traducir.json"), "utf8")));
let total = 0;
for (const idioma of IDIOMAS) {
  const ruta = join(raiz, "i18n", `${idioma}.json`);
  const dic = existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : {};
  const faltan = [...textos, ...plantillas].filter((t) => !(t in dic) && !igual.has(t));
  total += faltan.length;
  process.stdout.write(`${idioma}: ${faltan.length} sin traducir\n`);
  if (process.argv.includes("--lista")) for (const t of faltan) process.stdout.write(`  ${JSON.stringify(t)}\n`);
}
process.stdout.write(total ? "Usa --lista para verlos (algunos son a propósito: nombres propios, código o datos).\n" : "Todo traducido.\n");
