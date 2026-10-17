/**
 * Noticias por RSS/Atom: cada cuenta elige sus fuentes (vienen algunas de
 * Google Noticias en español). Las fuentes se descargan con protección SSRF
 * y se guardan en caché 15 min; una fuente caída no afecta a las demás.
 */
import { load } from "cheerio";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentUser } from "../security/rbac.js";
import type { ModuleDeps } from "./common.js";
import { conCache } from "./novedades.js";
import { descargarTextoSeguro } from "./red-segura.js";
import { getSetting, setSetting } from "./settings.js";

interface Fuente {
  nombre: string;
  url: string;
}

const GOOGLE = (q: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=MX&ceid=MX:es-419`;

export const FUENTES_INICIALES: Fuente[] = [
  { nombre: "México (Google Noticias)", url: "https://news.google.com/rss?hl=es-419&gl=MX&ceid=MX:es-419" },
  { nombre: "Videojuegos", url: GOOGLE("videojuegos") },
  { nombre: "Tecnología", url: GOOGLE("tecnología") },
  { nombre: "Minecraft", url: GOOGLE("Minecraft") },
  { nombre: "BBC Mundo", url: "https://feeds.bbci.co.uk/mundo/rss.xml" },
];

export interface Noticia {
  titulo: string;
  url: string;
  fecha: string | null;
  fuente: string;
  resumen: string;
  imagen: string | null;
}

const sinHtml = (s: string) => load(`<div>${s}</div>`).text().replace(/\s+/g, " ").trim();

/** Lee un RSS 2.0 o Atom y devuelve sus noticias. */
export function interpretarFeed(xml: string, fuente: string): Noticia[] {
  const $ = load(xml, { xmlMode: true });
  const items = $("item").length ? $("item") : $("entry");
  const salida: Noticia[] = [];
  items.each((_, el) => {
    const n = $(el);
    const titulo = sinHtml(n.find("title").first().text());
    const url = n.find("link").first().attr("href") ?? n.find("link").first().text().trim();
    if (!titulo || !/^https?:\/\//i.test(url)) return;
    const fecha = n.find("pubDate").first().text() || n.find("updated").first().text() || n.find("published").first().text();
    const imagen =
      n.find("media\\:content, content").first().attr("url") ??
      n.find("media\\:thumbnail, thumbnail").first().attr("url") ??
      n.find("enclosure[type^='image']").first().attr("url") ??
      null;
    const origen = n.find("source").first().text().trim();
    salida.push({
      titulo: titulo.slice(0, 300),
      url,
      fecha: fecha && !Number.isNaN(Date.parse(fecha)) ? new Date(fecha).toISOString() : null,
      fuente: origen || fuente,
      resumen: sinHtml(n.find("description").first().text() || n.find("summary").first().text() || "").slice(0, 280),
      imagen: imagen && /^https:\/\//i.test(imagen) ? imagen : null,
    });
  });
  return salida.slice(0, 40);
}

export function noticiasRoutes(deps: ModuleDeps) {
  const leer = { config: { acceso: { modulo: "noticias" as const, nivel: "lectura" as const } } };
  const fuentesDe = async (userId: string) => (await getSetting<Fuente[]>(deps.db, `noticias:${userId}`)) ?? FUENTES_INICIALES;

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/noticias/fuentes", leer, async (request) => fuentesDe(currentUser(request).id));

    app.put("/api/noticias/fuentes", leer, async (request) => {
      const user = currentUser(request);
      const { fuentes } = z
        .object({
          fuentes: z
            .array(z.object({ nombre: z.string().trim().min(1).max(60), url: z.string().trim().url("URL inválida").max(1000).refine((u) => /^https?:\/\//i.test(u), "Solo http o https") }))
            .max(20),
        })
        .parse(request.body);
      await setSetting(deps.db, `noticias:${user.id}`, fuentes, deps.now());
      return { ok: true };
    });

    app.get("/api/noticias", leer, async (request) => {
      const { fuente } = z.object({ fuente: z.string().max(60).optional() }).parse(request.query);
      const todas = await fuentesDe(currentUser(request).id);
      const elegidas = fuente ? todas.filter((f) => f.nombre === fuente) : todas;
      const resultados = await Promise.all(
        elegidas.map(async (f) => {
          try {
            const noticias = await conCache(`rss:${f.url}`, 15 * 60_000, async () => interpretarFeed(await descargarTextoSeguro(f.url, { maxBytes: 3_000_000 }), f.nombre));
            return { fuente: f.nombre, noticias, error: null as string | null };
          } catch (err) {
            return { fuente: f.nombre, noticias: [] as Noticia[], error: err instanceof Error ? err.message : "No se pudo leer" };
          }
        }),
      );
      const noticias = resultados
        .flatMap((r) => r.noticias)
        .sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""))
        .slice(0, 120);
      return { noticias, errores: resultados.filter((r) => r.error).map((r) => ({ fuente: r.fuente, error: r.error })) };
    });
  };
}
