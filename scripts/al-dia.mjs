#!/usr/bin/env node
/**
 * Deja todo al día con cada versión, con un solo comando:
 *
 *   pnpm al-dia 0.11.6b      (sube la versión y regenera todo)
 *   pnpm al-dia              (solo regenera, con la versión que ya tiene)
 *
 * 1. Versión: los package.json, Android (versionName y versionCode + 1).
 * 2. Demo compilada → capturas y video del recorrido para la página oficial.
 * 3. Wiki de la página oficial (sale de la ayuda de la app).
 * 4. README: versión actual y nombres de las descargas.
 *
 * La página oficial toma todo esto al arrancar la versión nueva en el VPS
 * (si nadie la editó a mano) y la sección Descargas lee /opt/mi-setup/descargas.
 * Para saltar pasos lentos: --sin-video, --sin-capturas.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const nueva = args.find((a) => !a.startsWith("--"));
const sin = (paso) => args.includes(`--sin-${paso}`);
const decir = (t) => process.stdout.write(`${t}\n`);
// Comandos fijos (sin nada que escriba la persona): se pasan tal cual a la terminal.
const correr = (comando, cwd = raiz) => execSync(comando, { cwd, stdio: "inherit" });

const PAQUETES = ["package.json", "apps/core/package.json", "apps/ui/package.json", "apps/desktop/package.json", "apps/mobile/package.json", "packages/shared/package.json"];
const GRADLE = join(raiz, "apps/mobile/android/app/build.gradle");

/** "0.11.6b" → { version: "0.11.6", etapa: "b" } */
export function partirVersion(texto) {
  const m = /^(\d+\.\d+\.\d+)([a-z]?)$/.exec(texto ?? "");
  if (!m) throw new Error(`Versión inválida: ${texto} (ejemplo: 0.11.6b)`);
  return { version: m[1], etapa: m[2] };
}

/** Cambia la versión de Android; el versionCode sube 1 solo si la versión cambió. */
export function versionAndroid(gradle, completa) {
  const actual = /versionName "([^"]+)"/.exec(gradle)?.[1];
  if (actual === completa) return gradle;
  return gradle.replace(/versionCode (\d+)/, (_, n) => `versionCode ${Number(n) + 1}`).replace(/versionName "[^"]+"/, `versionName "${completa}"`);
}

/** Versión actual y nombres de descargas del README. */
export function readmeAlDia(readme, version, etapa) {
  return readme
    .replace(/Versión actual: \*\*[^*]+\*\*/, `Versión actual: **${version}${etapa}**`)
    .replace(/`MiSetup-[\d.]+\.exe`/, `\`MiSetup-${version}.exe\``)
    .replace(/`MiSetup-[\d.]+[a-z]?\.apk`/, `\`MiSetup-${version}${etapa}.apk\``);
}

function leerJson(ruta) {
  return JSON.parse(readFileSync(join(raiz, ruta), "utf8"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (nueva) {
    const { version, etapa } = partirVersion(nueva);
    decir(`1/4 Versión ${version}${etapa}`);
    for (const ruta of PAQUETES) {
      const texto = readFileSync(join(raiz, ruta), "utf8");
      writeFileSync(join(raiz, ruta), texto.replace(/"version": "[^"]+"/, `"version": "${version}"`).replace(/"etapa": "[^"]*"/, `"etapa": "${etapa}"`));
    }
    writeFileSync(GRADLE, versionAndroid(readFileSync(GRADLE, "utf8"), `${version}${etapa}`));
  } else {
    decir("1/4 Versión: se queda igual");
  }
  const { version, etapa = "" } = leerJson("package.json");

  if (sin("capturas") && sin("video")) {
    decir("2/4 Capturas y video: saltados");
  } else {
    decir("2/4 Demo, capturas y video (tarda unos minutos)");
    correr("pnpm --filter @mi-setup/ui build:demo");
    if (!sin("capturas")) correr("node scripts/capturas-sitio.mjs", join(raiz, "apps/ui"));
    if (!sin("video")) correr("node scripts/grabar-video.mjs", join(raiz, "apps/ui"));
  }

  decir("3/4 Wiki de la página oficial");
  correr("pnpm --filter @mi-setup/core exec tsx --conditions=development scripts/wiki-sitio.ts");

  decir("4/4 README");
  const readme = join(raiz, "README.md");
  writeFileSync(readme, readmeAlDia(readFileSync(readme, "utf8"), version, etapa));

  decir(`\nListo: Mi Setup ${version}${etapa} al día. Revisa los cambios con: git status`);
}
