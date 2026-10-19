/**
 * Monaco (el editor de VS Code) cargado desde la propia app, sin CDN: así
 * funciona sin internet y respeta la política de seguridad (CSP).
 */
import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import JsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import TsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_id: string, etiqueta: string) {
    if (etiqueta === "json") return new JsonWorker();
    if (etiqueta === "css" || etiqueta === "scss" || etiqueta === "less") return new CssWorker();
    if (etiqueta === "html" || etiqueta === "handlebars" || etiqueta === "razor") return new HtmlWorker();
    if (etiqueta === "typescript" || etiqueta === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};

loader.config({ monaco });

/** Lenguaje de Monaco según la extensión del archivo. */
export function lenguajeDe(nombre: string): string {
  const ext = nombre.toLowerCase().split(".").pop() ?? "";
  const mapa: Record<string, string> = {
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    json: "json",
    mcmeta: "json",
    html: "html",
    htm: "html",
    css: "css",
    scss: "scss",
    md: "markdown",
    py: "python",
    java: "java",
    kt: "kotlin",
    kts: "kotlin",
    gradle: "groovy",
    groovy: "groovy",
    xml: "xml",
    yml: "yaml",
    yaml: "yaml",
    toml: "ini",
    properties: "ini",
    ini: "ini",
    cfg: "ini",
    sh: "shell",
    bat: "bat",
    cmd: "bat",
    ps1: "powershell",
    sql: "sql",
    lua: "lua",
    c: "c",
    h: "c",
    cpp: "cpp",
    cs: "csharp",
    go: "go",
    rs: "rust",
    php: "php",
  };
  return mapa[ext] ?? "plaintext";
}

export { monaco };
