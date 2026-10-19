/**
 * Compras: buscar un producto en varias tiendas desde una sola opción.
 * - Mercado Libre: resultados dentro de la app (su API pide una app gratis:
 *   MERCADOLIBRE_CLIENT_ID / MERCADOLIBRE_CLIENT_SECRET).
 * - Amazon, Walmart, Liverpool, AliExpress…: no tienen API abierta; se abren
 *   sus búsquedas con lo que escribiste.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import type { ModuleDeps } from "./common.js";

export const TIENDAS = [
  { id: "mercadolibre", nombre: "Mercado Libre", url: "https://listado.mercadolibre.com.mx/" },
  { id: "amazon", nombre: "Amazon", url: "https://www.amazon.com.mx/s?k=" },
  { id: "walmart", nombre: "Walmart", url: "https://www.walmart.com.mx/search?q=" },
  { id: "liverpool", nombre: "Liverpool", url: "https://www.liverpool.com.mx/tienda?s=" },
  { id: "coppel", nombre: "Coppel", url: "https://www.coppel.com/SearchDisplay?searchTerm=" },
  { id: "cyberpuerta", nombre: "Cyberpuerta", url: "https://www.cyberpuerta.mx/index.php?cl=search&searchparam=" },
  { id: "aliexpress", nombre: "AliExpress", url: "https://es.aliexpress.com/w/wholesale-" },
  { id: "ebay", nombre: "eBay", url: "https://www.ebay.com/sch/i.html?_nkw=" },
] as const;

/** Enlace de búsqueda de cada tienda (Mercado Libre usa guiones; AliExpress termina en .html). */
export function enlaceTienda(id: (typeof TIENDAS)[number]["id"], q: string): string {
  const t = TIENDAS.find((x) => x.id === id)!;
  if (id === "mercadolibre") return `${t.url}${encodeURIComponent(q.trim().replace(/\s+/g, "-"))}`;
  if (id === "aliexpress") return `${t.url}${encodeURIComponent(q.trim().replace(/\s+/g, "-"))}.html`;
  return `${t.url}${encodeURIComponent(q.trim())}`;
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

export function comprasRoutes(deps: ModuleDeps) {
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

    app.get("/api/compras/buscar", leer, async (request) => {
      const { q, orden } = z
        .object({ q: z.string().trim().min(2).max(120), orden: z.enum(["relevancia", "menor", "mayor"]).default("relevancia") })
        .parse(request.query);
      const tiendas = TIENDAS.map((t) => ({ id: t.id, nombre: t.nombre, url: enlaceTienda(t.id, q) }));
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
