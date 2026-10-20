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
const SITIO = (dominio: string) => GOOGLE(`site:${dominio} when:2d`);
const SECCION = (tema: string) => `https://news.google.com/rss/headlines/section/topic/${tema}?hl=es-419&gl=MX&ceid=MX:es-419`;
const POPULARES_URL = "https://news.google.com/rss?hl=es-419&gl=MX&ceid=MX:es-419";

export const FUENTES_INICIALES: Fuente[] = [
  { nombre: "México (Google Noticias)", url: POPULARES_URL },
  { nombre: "Videojuegos", url: GOOGLE("videojuegos") },
  { nombre: "Tecnología", url: GOOGLE("tecnología") },
  { nombre: "Minecraft", url: GOOGLE("Minecraft") },
  { nombre: "BBC Mundo", url: "https://feeds.bbci.co.uk/mundo/rss.xml" },
  { nombre: "Xataka", url: SITIO("xataka.com.mx") },
  { nombre: "El Universal", url: SITIO("eluniversal.com.mx") },
];

/** Temas de «Populares» (lo más visto en Google Noticias México). */
export const TEMAS_POPULARES = [
  { id: "inicio", nombre: "Lo más visto", url: POPULARES_URL },
  { id: "mexico", nombre: "México", url: SECCION("NATION") },
  { id: "mundo", nombre: "Mundo", url: SECCION("WORLD") },
  { id: "negocios", nombre: "Dinero", url: SECCION("BUSINESS") },
  { id: "tecnologia", nombre: "Tecnología", url: SECCION("TECHNOLOGY") },
  { id: "entretenimiento", nombre: "Entretenimiento", url: SECCION("ENTERTAINMENT") },
  { id: "deportes", nombre: "Deportes", url: SECCION("SPORTS") },
  { id: "ciencia", nombre: "Ciencia", url: SECCION("SCIENCE") },
  { id: "salud", nombre: "Salud", url: SECCION("HEALTH") },
] as const;

/** Fuentes sugeridas para agregar con un toque. */
export const CATALOGO_FUENTES: { grupo: string; fuentes: Fuente[] }[] = [
  {
    grupo: "México",
    fuentes: [
      { nombre: "El Universal", url: SITIO("eluniversal.com.mx") },
      { nombre: "Milenio", url: SITIO("milenio.com") },
      { nombre: "El Financiero", url: SITIO("elfinanciero.com.mx") },
      { nombre: "Expansión", url: SITIO("expansion.mx") },
      { nombre: "Infobae México", url: SITIO("infobae.com/mexico") },
      { nombre: "Animal Político", url: SITIO("animalpolitico.com") },
      { nombre: "El Economista", url: SITIO("eleconomista.com.mx") },
    ],
  },
  {
    grupo: "Mundo",
    fuentes: [
      { nombre: "BBC Mundo", url: "https://feeds.bbci.co.uk/mundo/rss.xml" },
      { nombre: "CNN en Español", url: SITIO("cnnespanol.cnn.com") },
      { nombre: "El País", url: SITIO("elpais.com") },
      { nombre: "DW Español", url: SITIO("dw.com/es") },
    ],
  },
  {
    grupo: "Tecnología",
    fuentes: [
      { nombre: "Xataka", url: SITIO("xataka.com.mx") },
      { nombre: "Hipertextual", url: SITIO("hipertextual.com") },
      { nombre: "Genbeta", url: SITIO("genbeta.com") },
      { nombre: "The Verge", url: SITIO("theverge.com") },
      { nombre: "Inteligencia artificial", url: GOOGLE("inteligencia artificial") },
      { nombre: "Ciberseguridad", url: GOOGLE("ciberseguridad hackeo filtración") },
    ],
  },
  {
    grupo: "Videojuegos",
    fuentes: [
      { nombre: "3DJuegos", url: SITIO("3djuegos.com") },
      { nombre: "Vandal", url: SITIO("vandal.elespanol.com") },
      { nombre: "LevelUp", url: SITIO("levelup.com") },
      { nombre: "IGN Latinoamérica", url: SITIO("latam.ign.com") },
      { nombre: "Minecraft", url: GOOGLE("Minecraft") },
      { nombre: "Ofertas de juegos", url: GOOGLE("juegos gratis Epic Steam oferta") },
    ],
  },
  {
    grupo: "Deportes y dinero",
    fuentes: [
      { nombre: "ESPN", url: SITIO("espn.com.mx") },
      { nombre: "Récord", url: SITIO("record.com.mx") },
      { nombre: "Cripto", url: GOOGLE("bitcoin criptomonedas") },
      { nombre: "Tipo de cambio", url: GOOGLE("tipo de cambio dólar peso") },
    ],
  },
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

    app.get("/api/noticias/catalogo", leer, async () => ({ temas: TEMAS_POPULARES.map(({ id, nombre }) => ({ id, nombre })), grupos: CATALOGO_FUENTES }));

    /** Populares: en el orden de Google Noticias (lo más visto primero), no por fecha. */
    app.get("/api/noticias/populares", leer, async (request) => {
      const { tema } = z.object({ tema: z.string().max(30).default("inicio") }).parse(request.query);
      const t = TEMAS_POPULARES.find((x) => x.id === tema) ?? TEMAS_POPULARES[0];
      const noticias = await conCache(`rss:${t.url}`, 15 * 60_000, async () => interpretarFeed(await descargarTextoSeguro(t.url, { maxBytes: 3_000_000 }), t.nombre));
      return { tema: t.id, noticias };
    });

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
