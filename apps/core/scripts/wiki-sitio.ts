/**
 * Genera la wiki del sitio oficial (sitio-oficial/wiki.json) a partir de la
 * ayuda de la app (apps/ui/src/lib/ayuda.ts), solo con los apartados de la
 * edición pública y sin mencionar cosas de la edición personal.
 *
 *   pnpm --filter @mi-setup/core exec tsx scripts/wiki-sitio.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fijarEdicion, MODULE_CATEGORIES, MODULES, moduloEnEdicion, type ModuleId } from "@mi-setup/shared";
import { AYUDA } from "../../ui/src/lib/ayuda.js";

fijarEdicion("publica");
/** Palabras de la edición personal que nunca salen en lo público. */
export const PROHIBIDAS = /pterodactyl|discord|twitch|kick|stream|bots? |minecraft|mi casa|control remoto|servidores en mi pc|x \(twitter\)|mexicanland/i;
const GRUPOS: Record<string, string> = {
  principal: "Menú principal",
  vps: "VPS",
  panel: "Negocio",
  seguridad: "Seguridad",
  novedades: "Novedades",
  herramientas: "Herramientas",
  programacion: "Programación",
  sitios: "Sitios y apps",
  estudio: "Estudio",
  entretenimiento: "Entretenimiento",
  ia: "IA",
  ajustes: "Ajustes",
};

const wiki = MODULE_CATEGORIES.filter((c) => GRUPOS[c])
  .map((c) => ({
    grupo: GRUPOS[c]!,
    temas: (Object.keys(MODULES) as ModuleId[])
      .filter((m) => MODULES[m].category === c && moduloEnEdicion(m) && AYUDA[m])
      .map((m) => ({
        id: m.replace(/_/g, "-"),
        titulo: MODULES[m].label,
        pasos: AYUDA[m].pasos.filter((p) => !PROHIBIDAS.test(p)),
        nota: AYUDA[m].nota && !PROHIBIDAS.test(AYUDA[m].nota) ? AYUDA[m].nota : undefined,
      }))
      .filter((t) => t.pasos.length),
  }))
  .filter((g) => g.temas.length);

writeFileSync(fileURLToPath(new URL("../sitio-oficial/wiki.json", import.meta.url)), `${JSON.stringify(wiki, null, 1)}\n`);
process.stdout.write(`${wiki.reduce((n, g) => n + g.temas.length, 0)} temas\n`);
