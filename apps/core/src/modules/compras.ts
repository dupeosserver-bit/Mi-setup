/**
 * Compras: buscar un producto en varias tiendas desde una sola opción.
 * - Mercado Libre: resultados dentro de la app (su API pide una app gratis:
 *   MERCADOLIBRE_CLIENT_ID / MERCADOLIBRE_CLIENT_SECRET).
 * - Amazon, Walmart, Liverpool, Coppel, Costco, Temu…: no tienen API abierta;
 *   se abren sus búsquedas con lo que escribiste. Google Shopping junta casi todas.
 * - Foto de un objeto: la IA dice qué es y qué buscar.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import type { ModuleDeps } from "./common.js";
import type { IaSimple } from "./ia/simple.js";
import { tipoPorBytes } from "./notas-adjuntos.js";

export const TIENDAS = [
  { id: "google", nombre: "Google Shopping (todas)", url: "https://www.google.com/search?tbm=shop&gl=mx&hl=es&q=", grupo: "comparar" },
  { id: "mercadolibre", nombre: "Mercado Libre", url: "https://listado.mercadolibre.com.mx/", grupo: "tiendas" },
  { id: "amazon", nombre: "Amazon", url: "https://www.amazon.com.mx/s?k=", grupo: "tiendas" },
  { id: "walmart", nombre: "Walmart", url: "https://www.walmart.com.mx/search?q=", grupo: "tiendas" },
  { id: "liverpool", nombre: "Liverpool", url: "https://www.liverpool.com.mx/tienda?s=", grupo: "tiendas" },
  { id: "coppel", nombre: "Coppel", url: "https://www.coppel.com/SearchDisplay?searchTerm=", grupo: "tiendas" },
  { id: "elektra", nombre: "Elektra", url: "https://www.elektra.mx/", grupo: "tiendas" },
  { id: "costco", nombre: "Costco", url: "https://www.costco.com.mx/search?text=", grupo: "tiendas" },
  { id: "officedepot", nombre: "Office Depot", url: "https://www.officedepot.com.mx/officedepot/en/search/?text=", grupo: "tiendas" },
  { id: "cyberpuerta", nombre: "Cyberpuerta", url: "https://www.cyberpuerta.mx/index.php?cl=search&searchparam=", grupo: "tecnologia" },
  { id: "ddtech", nombre: "DDTech", url: "https://ddtech.mx/buscar/", grupo: "tecnologia" },
  { id: "bestbuy", nombre: "Best Buy (EE. UU.)", url: "https://www.bestbuy.com/site/searchpage.jsp?st=", grupo: "tecnologia" },
  { id: "aliexpress", nombre: "AliExpress", url: "https://es.aliexpress.com/w/wholesale-", grupo: "importado" },
  { id: "temu", nombre: "Temu", url: "https://www.temu.com/mx/search_result.html?search_key=", grupo: "importado" },
  { id: "shein", nombre: "Shein", url: "https://www.shein.com.mx/pdsearch/", grupo: "importado" },
  { id: "ebay", nombre: "eBay", url: "https://www.ebay.com/sch/i.html?_nkw=", grupo: "importado" },
] as const;

/** Enlace de búsqueda de cada tienda (cada una arma su dirección distinto). */
export function enlaceTienda(id: (typeof TIENDAS)[number]["id"], q: string): string {
  const t = TIENDAS.find((x) => x.id === id)!;
  const limpio = q.trim();
  const guiones = encodeURIComponent(limpio.replace(/\s+/g, "-"));
  if (id === "mercadolibre") return `${t.url}${guiones}`;
  if (id === "aliexpress") return `${t.url}${guiones}.html`;
  if (id === "elektra") return `${t.url}${encodeURIComponent(limpio)}?_q=${encodeURIComponent(limpio)}&map=ft`;
  if (id === "ddtech") return `${t.url}${encodeURIComponent(limpio)}`;
  if (id === "shein") return `${t.url}${encodeURIComponent(limpio)}/`;
  return `${t.url}${encodeURIComponent(limpio)}`;
}

interface ResultadoMl {
  id: string;
  title: string;
  price: number;
  original_price?: number | null;
  currency_id: string;
  thumbnail: string;
  permalink: string;
  shipping?: { free_shipping?: boolean };
  condition?: string;
}

export function comprasRoutes(deps: ModuleDeps, ia: IaSimple) {
  let token: { valor: string; vence: number } | null = null;

  async function tokenMl(): Promise<string | null> {
    const id = deps.config.env.MERCADOLIBRE_CLIENT_ID;
    const secreto = deps.config.env.MERCADOLIBRE_CLIENT_SECRET;
    if (!id || !secreto) return null;
    if (token && token.vence > Date.now() + 60_000) return token.valor;
    const r = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secreto }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (!r?.ok) throw new HttpError(400, "Mercado Libre no aceptó tu App ID o clave secreta (Ajustes → Servicios y claves).");
    const d = (await r.json()) as { access_token: string; expires_in: number };
    token = { valor: d.access_token, vence: Date.now() + d.expires_in * 1000 };
    return token.valor;
  }

  return async function (app: FastifyInstance): Promise<void> {
    const leer = { config: { acceso: { modulo: "novedades" as const, nivel: "lectura" as const } } };

    /** Foto de un objeto: la IA dice qué es y con qué palabras buscarlo. */
    app.post("/api/compras/foto", leer, async (request) => {
      const user = currentUser(request);
      const archivo = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
      if (!archivo) throw new HttpError(400, "Toma o elige una foto");
      const buf = await archivo.toBuffer();
      if (archivo.file.truncated) throw new HttpError(413, "La foto pasa de 10 MB");
      const tipo = tipoPorBytes(buf, archivo.mimetype);
      if (!/^image\/(png|jpeg|webp)$/.test(tipo)) throw new HttpError(400, "La foto debe ser JPG, PNG o WebP");
      return ia.pedirJson(
        user,
        {
          sistema:
            'Identificas productos en fotos para buscarlos en tiendas de México. Responde SOLO JSON: {"producto":"qué es, corto","consulta":"palabras para buscarlo (marca y modelo si se ven)","alternativas":["otras 2 o 3 búsquedas"],"detalles":"color, tamaño o lo que ayude a elegir"}. Si no se reconoce, consulta con lo más parecido.',
          texto: "¿Qué es esto y cómo lo busco para comprarlo?",
          imagenes: [{ tipo, datos: buf.toString("base64") }],
        },
        z.object({
          producto: z.string().max(200).catch(""),
          consulta: z.string().min(1).max(120),
          alternativas: z.array(z.string().max(120)).max(5).catch([]),
          detalles: z.string().max(400).catch(""),
        }),
      );
    });

    app.get("/api/compras/buscar", leer, async (request) => {
      const { q, orden } = z
        .object({ q: z.string().trim().min(2).max(120), orden: z.enum(["relevancia", "menor", "mayor"]).default("relevancia") })
        .parse(request.query);
      const tiendas = TIENDAS.map((t) => ({ id: t.id, nombre: t.nombre, grupo: t.grupo, url: enlaceTienda(t.id, q) }));
      const acceso = await tokenMl();
      if (!acceso) return { tiendas, mercadoLibre: { configurado: false, resultados: [] } };
      const url = new URL("https://api.mercadolibre.com/sites/MLM/search");
      url.searchParams.set("q", q);
      url.searchParams.set("limit", "24");
      if (orden !== "relevancia") url.searchParams.set("sort", orden === "menor" ? "price_asc" : "price_desc");
      const r = await fetch(url, { headers: { authorization: `Bearer ${acceso}` }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
      if (!r) throw new HttpError(502, "Mercado Libre no respondió");
      if (r.status === 401 || r.status === 403) {
        token = null;
        throw new HttpError(502, "Mercado Libre no dio permiso de búsqueda a tu aplicación. Revisa que esté activa en developers.mercadolibre.com.mx.");
      }
      if (!r.ok) throw new HttpError(502, `Mercado Libre respondió ${r.status}`);
      const d = (await r.json()) as { results: ResultadoMl[] };
      return {
        tiendas,
        mercadoLibre: {
          configurado: true,
          resultados: d.results.map((x) => ({
            id: x.id,
            titulo: x.title,
            precio: x.price,
            precioAntes: x.original_price ?? null,
            moneda: x.currency_id,
            imagen: x.thumbnail.replace(/^http:/, "https:").replace("-I.jpg", "-O.jpg"),
            url: x.permalink,
            envioGratis: Boolean(x.shipping?.free_shipping),
            usado: x.condition === "used",
          })),
        },
      };
    });
  };
}
