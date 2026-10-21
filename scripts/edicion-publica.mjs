#!/usr/bin/env node
/**
 * Quita de un build ya compilado el código que solo trae la edición personal
 * (Pterodactyl, Redes y streams, Servidores en mi PC, Mi casa y Control remoto)
 * y revisa que nada de lo que queda lo importe.
 *
 *   node scripts/edicion-publica.mjs core apps/core/dist
 *   node scripts/edicion-publica.mjs desktop apps/desktop/dist
 *
 * La interfaz no necesita esto: se compila con VITE_EDICION=publica y Vite deja
 * fuera esas pantallas.
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";

const decir = (texto) => process.stdout.write(`${texto}\n`);
const fallar = (texto) => {
  process.stderr.write(`${texto}\n`);
  process.exit(1);
};

const QUITAR = {
  core: [
    "modules/personales.js",
    "modules/ptero.js",
    "modules/ptero-admin.js",
    "modules/blueprint-tienda.js",
    "modules/redes",
    "modules/bots-discord",
    "modules/vps/bots.js",
    "modules/hostlocal.js",
    "modules/control-remoto.js",
    "modules/clips.js",
    "modules/casa.js",
  ],
  desktop: ["servidores-locales.js"],
};

const [tipo, carpeta] = process.argv.slice(2);
if (!tipo || !carpeta || !QUITAR[tipo]) {
  fallar("Uso: node scripts/edicion-publica.mjs <core|desktop> <carpeta dist>");
}
const raiz = resolve(carpeta);
if (!existsSync(raiz)) {
  fallar(`No existe ${raiz}: compila primero.`);
}

const quitados = [];
for (const r of QUITAR[tipo]) {
  for (const ext of ["", ".map", ".d.ts"]) {
    const ruta = join(raiz, ext === ".d.ts" ? r.replace(/\.js$/, ".d.ts") : r + ext);
    if (existsSync(ruta)) {
      rmSync(ruta, { recursive: true, force: true });
      if (!ext) quitados.push(r);
    }
  }
}

// Nada de lo que queda puede importar lo quitado de forma fija (los import() dinámicos
// que dependen de la edición sí se permiten: no se ejecutan en la pública).
const archivos = [];
const recorrer = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) recorrer(p);
    else if (p.endsWith(".js")) archivos.push(p);
  }
};
recorrer(raiz);
const errores = [];
for (const f of archivos) {
  const codigo = readFileSync(f, "utf8");
  const fijos = [...codigo.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["'](\.[^"']+)["']/gm), ...codigo.matchAll(/^\s*(?:const|let|var)\s+[^=]+=\s*require\(["'](\.[^"']+)["']\)/gm)];
  for (const m of fijos) {
    let destino = resolve(dirname(f), m[1]);
    if (!destino.endsWith(".js") && existsSync(destino + ".js")) destino += ".js";
    if (!existsSync(destino) && !existsSync(join(destino, "index.js"))) errores.push(`${relative(raiz, f)} importa ${m[1]}, que ya no existe`);
  }
}
if (errores.length) {
  fallar("La edición pública quedó rota:\n" + errores.join("\n"));
}
decir(`Edición pública (${tipo}): se quitaron ${quitados.length} piezas (${quitados.join(", ")}).`);
