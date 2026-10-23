/**
 * Blueprint (extensiones del panel de Pterodactyl):
 * - Revisar un .blueprint (subido o bajado de la tienda): se lee su conf.yml
 *   para saber qué es, su versión y para qué versión de Blueprint se hizo.
 * - Tienda: extensiones gratis de la página oficial de Blueprint y de GitHub.
 * La instalación la hace la ruta de ptero-admin (confirmación + PIN o huella).
 */
import { HttpError } from "../http-error.js";
import { listarZip, leerDelZip } from "./zip-leer.js";

export const MAX_BLUEPRINT = 50 * 1024 * 1024;
export const ID_EXTENSION = /^[a-zA-Z0-9_-]{1,64}$/;

export interface InfoBlueprint {
  identificador: string;
  nombre: string;
  version: string;
  autor: string;
  descripcion: string;
  objetivo: string;
}

/** Lee la sección `info:` del conf.yml de Blueprint (YAML simple, clave: valor). */
export function leerConfBlueprint(texto: string): InfoBlueprint {
  const info: Record<string, string> = {};
  let dentro = false;
  for (const linea of texto.split(/\r?\n/)) {
    if (/^\S/.test(linea)) dentro = /^info:\s*$/.test(linea);
    else if (dentro) {
      const m = /^\s+([a-zA-Z_]+):\s*(.*)$/.exec(linea);
      if (m) info[m[1]!] = m[2]!.replace(/\s+#.*$/, "").replace(/^["']|["']$/g, "").trim();
    }
  }
  const identificador = info.identifier ?? "";
  if (!ID_EXTENSION.test(identificador) || identificador === "blueprint") throw new HttpError(400, "El conf.yml no tiene un identificador válido");
  return {
    identificador,
    nombre: info.name || identificador,
    version: info.version ?? "",
    autor: info.author ?? "",
    descripcion: info.description ?? "",
    objetivo: info.target ?? "",
  };
}

/** Revisa que el archivo sea un .blueprint de verdad y devuelve su información. */
export function revisarBlueprint(buf: Buffer): InfoBlueprint {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) throw new HttpError(400, "No es un archivo .blueprint (debe ser un zip)");
  const entradas = listarZip(buf);
  if (entradas.some((e) => e.nombre.includes("..") || e.nombre.startsWith("/"))) throw new HttpError(400, "El archivo trae rutas peligrosas; no se instala");
  const conf = entradas.filter((e) => /(^|\/)conf\.yml$/i.test(e.nombre)).sort((a, b) => a.nombre.split("/").length - b.nombre.split("/").length)[0];
  if (!conf) throw new HttpError(400, "No trae conf.yml: no parece una extensión de Blueprint");
  return leerConfBlueprint(leerDelZip(buf, conf).toString("utf8"));
}

/** "beta-2024-12" o "beta-2026-06" → fecha comparable; las que no se entienden → null. */
export function fechaVersionBlueprint(v: string): string | null {
  const m = /(\d{4})-(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** ¿La extensión se hizo para esta versión de Blueprint (o una anterior compatible)? */
export function compatibilidad(objetivo: string, instalada: string | null): "si" | "quizas" | "no" {
  const a = fechaVersionBlueprint(objetivo);
  const b = instalada ? fechaVersionBlueprint(instalada) : null;
  if (!a || !b) return "quizas";
  return a <= b ? "si" : "no";
}

export interface ExtensionTienda {
  id: string;
  nombre: string;
  resumen: string;
  autor: string;
  imagen: string | null;
  origen: "blueprint" | "github";
  pagina: string;
  /** Descarga directa del .blueprint si se conoce. */
  descarga: string | null;
  popularidad: number;
  actualizada: string | null;
}

/** Lista de la página oficial (formato flexible: se toma solo lo gratis). */
export function interpretarTiendaOficial(datos: unknown): ExtensionTienda[] {
  const lista = Array.isArray(datos) ? datos : Array.isArray((datos as { extensions?: unknown })?.extensions) ? (datos as { extensions: unknown[] }).extensions : [];
  const salida: ExtensionTienda[] = [];
  for (const x of lista as Record<string, unknown>[]) {
    const plataformas = (x.platforms ?? {}) as Record<string, { url?: string; price?: number; downloads?: number }>;
    const gratis = Object.entries(plataformas).find(([k, p]) => p && typeof p.url === "string" && /^https:\/\//.test(p.url) && (k.toUpperCase() === "GITHUB" || p.price === 0));
    if (!gratis) continue;
    const autor = typeof x.author === "object" && x.author ? String((x.author as { name?: string }).name ?? "") : String(x.author ?? "");
    salida.push({
      id: `bp:${String(x.identifier ?? x.id ?? x.name)}`,
      nombre: String(x.name ?? x.identifier ?? "Extensión"),
      resumen: String(x.summary ?? x.description ?? "").slice(0, 300),
      autor,
      imagen: typeof x.banner === "string" && /^https:\/\//.test(x.banner) ? x.banner : null,
      origen: "blueprint",
      pagina: gratis[1].url!,
      descarga: /\.blueprint(\?|$)/i.test(gratis[1].url!) ? gratis[1].url! : null,
      popularidad: Object.values(plataformas).reduce((a, p) => a + (p?.downloads ?? 0), 0),
      actualizada: typeof x.created === "string" ? x.created : null,
    });
  }
  return salida;
}

interface RepoGithub {
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  pushed_at: string;
  archived?: boolean;
  owner: { login: string; avatar_url?: string };
}

export function interpretarGithub(datos: { items?: RepoGithub[] }): ExtensionTienda[] {
  return (datos.items ?? [])
    .filter((r) => !r.archived)
    .map((r) => ({
      id: `gh:${r.full_name}`,
      nombre: r.name,
      resumen: (r.description ?? "").slice(0, 300),
      autor: r.owner.login,
      imagen: r.owner.avatar_url && /^https:\/\//.test(r.owner.avatar_url) ? r.owner.avatar_url : null,
      origen: "github" as const,
      pagina: r.html_url,
      descarga: null,
      popularidad: r.stargazers_count,
      actualizada: r.pushed_at,
    }));
}

/** Solo se bajan .blueprint de GitHub o de la página oficial (nada de otros sitios). */
export function descargaPermitida(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ["github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com", "blueprint.zip", "raw.githubusercontent.com"].includes(u.hostname);
  } catch {
    return false;
  }
}

export function nombreBlueprintAceptado(nombre: string): boolean {
  const base = nombre.trim().split(/[\\/]/).pop() ?? "";
  const punto = base.lastIndexOf(".");
  if (punto <= 0) return true;
  return /^\.(blueprint|zip)$/i.test(base.slice(punto));
}

export function repoDeExtension(e: Pick<ExtensionTienda, "id" | "pagina">): string | null {
  if (e.id.startsWith("gh:")) return e.id.slice(3);
  const m = /^https:\/\/github\.com\/([\w.-]{1,100})\/([\w.-]{1,100})(?:\/|$|\.git)/.exec(e.pagina);
  return m ? `${m[1]}/${m[2]!.replace(/\.git$/, "")}` : null;
}

export type Resolutor = (repo: string) => Promise<string | null | undefined>;

export async function soloDescargables(lista: ExtensionTienda[], resolver: Resolutor, opciones: { limite?: number; simultaneas?: number } = {}): Promise<{ extensiones: ExtensionTienda[]; incompleta: boolean }> {
  const candidatas = lista.slice(0, opciones.limite ?? 60);
  const salida: (ExtensionTienda | null)[] = new Array(candidatas.length).fill(null);
  let incompleta = lista.length > candidatas.length;
  let siguiente = 0;
  const trabajar = async () => {
    while (siguiente < candidatas.length) {
      const i = siguiente++;
      const e = candidatas[i]!;
      if (e.descarga) {
        salida[i] = e;
        continue;
      }
      const repo = repoDeExtension(e);
      if (!repo) continue;
      const url = await resolver(repo).catch(() => undefined);
      if (url === undefined) incompleta = true;
      if (url) salida[i] = { ...e, descarga: url };
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opciones.simultaneas ?? 6) }, trabajar));
  return { extensiones: salida.filter((e): e is ExtensionTienda => e !== null), incompleta };
}

const normalizar = (t: string) => t.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");

export function marcarInstaladas<T extends Pick<ExtensionTienda, "id" | "nombre">>(lista: T[], mapa: Record<string, string>, instaladas: { id: string; nombre: string }[]): (T & { instalada: boolean })[] {
  const ids = new Set(instaladas.map((e) => e.id.toLowerCase()));
  const nombres = new Set(instaladas.flatMap((e) => [normalizar(e.id), normalizar(e.nombre)]).filter(Boolean));
  return lista.map((e) => {
    const identificador = mapa[e.id];
    const instalada = (identificador !== undefined && ids.has(identificador.toLowerCase())) || nombres.has(normalizar(e.nombre));
    return { ...e, instalada };
  });
}
