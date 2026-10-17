/**
 * Novedades: clima (Open-Meteo, sin clave), ofertas de videojuegos
 * (CheapShark, sin clave) y vigilante de precios (p. ej. RAM) por URL y
 * selector CSS. Las fallas de una tienda no rompen a las demás: se guardan
 * como último error y se reintenta en la siguiente vuelta.
 */
import { load } from "cheerio";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appSettings, priceHistory, priceWatches } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";
import { pedirJson } from "./redes/oauth.js";
import { descargarTextoSeguro } from "./red-segura.js";

// ---------------------------------------------------------------- caché simple en memoria

const cache = new Map<string, { hasta: number; valor: unknown }>();
async function conCache<T>(clave: string, ms: number, fn: () => Promise<T>): Promise<T> {
  const c = cache.get(clave);
  if (c && c.hasta > Date.now()) return c.valor as T;
  const valor = await fn();
  cache.set(clave, { hasta: Date.now() + ms, valor });
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return valor;
}

// ---------------------------------------------------------------- precios

/**
 * Convierte "$1,299.00", "1.299,99 €", "MXN 2 450" en número. Un separador
 * seguido de exactamente 3 dígitos es de miles; con 1 o 2 dígitos al final es
 * el decimal.
 */
export function interpretarPrecio(texto: string): number | null {
  // \s ya incluye los espacios duros (U+00A0, U+202F) que usan algunas tiendas.
  const m = /\d[\d.,\s]*/.exec(texto);
  if (!m) return null;
  const s = m[0].replace(/\s/g, "").replace(/[.,]+$/, "");
  const ultimo = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (ultimo === -1) return Number(s);
  const decimales = s.length - ultimo - 1;
  const entero = (decimales === 3 ? s : s.slice(0, ultimo)).replace(/[.,]/g, "");
  const fraccion = decimales === 3 ? "" : s.slice(ultimo + 1);
  const n = Number(fraccion ? `${entero}.${fraccion}` : entero);
  return Number.isFinite(n) ? n : null;
}

/** Extrae el precio del HTML con el selector (usa el atributo content si existe, p. ej. meta itemprop=price). */
export function extraerPrecio(html: string, selector: string): { precio: number; texto: string } {
  const $ = load(html);
  let el;
  try {
    el = $(selector).first();
  } catch {
    throw new HttpError(400, "Selector CSS inválido");
  }
  if (!el.length) throw new HttpError(422, "No se encontró el selector en la página");
  const texto = (el.attr("content") ?? el.text()).trim().slice(0, 200);
  const precio = interpretarPrecio(texto);
  if (precio === null || precio <= 0) throw new HttpError(422, `No se pudo leer un precio en "${texto.slice(0, 60)}"`);
  return { precio, texto };
}

function vigilanteDto(w: typeof priceWatches.$inferSelect) {
  return {
    id: w.id,
    nombre: w.name,
    url: w.url,
    selector: w.selector,
    activo: w.active,
    precio: w.lastPrice === null ? null : Number(w.lastPrice),
    texto: w.lastText,
    revisado: w.lastCheckedAt?.toISOString() ?? null,
    error: w.lastError,
  };
}

async function revisarUno(deps: ModuleDeps, w: typeof priceWatches.$inferSelect) {
  const ahora = deps.now();
  try {
    const html = await descargarTextoSeguro(w.url);
    const { precio, texto } = extraerPrecio(html, w.selector);
    const anterior = w.lastPrice === null ? null : Number(w.lastPrice);
    const [act] = await deps.db
      .update(priceWatches)
      .set({ lastPrice: precio.toFixed(2), lastText: texto, lastCheckedAt: ahora, lastError: null })
      .where(eq(priceWatches.id, w.id))
      .returning();
    if (anterior === null || anterior !== precio) {
      await deps.db.insert(priceHistory).values({ watchId: w.id, price: precio.toFixed(2), at: ahora });
    }
    if (anterior !== null && anterior !== precio) {
      const baja = precio < anterior;
      await deps.notifier.send({
        title: `${baja ? "Bajó" : "Subió"} el precio: ${w.name}`,
        message: `${anterior} → ${precio} (${texto})`,
        priority: baja ? 4 : 3,
        tags: [baja ? "chart_with_downwards_trend" : "chart_with_upwards_trend"],
      });
      if (w.createdBy) deps.hub.publicar(`usuario:${w.createdBy}`, { recurso: "novedades", aviso: { titulo: w.name, cuerpo: `${anterior} → ${precio}` } });
    }
    return act ?? w;
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error al revisar";
    const [act] = await deps.db
      .update(priceWatches)
      .set({ lastCheckedAt: ahora, lastError: mensaje.slice(0, 300) })
      .where(eq(priceWatches.id, w.id))
      .returning();
    return act ?? w;
  }
}

/** Tarea periódica: revisa todos los vigilantes activos, uno tras otro. */
export async function revisarPrecios(deps: ModuleDeps): Promise<void> {
  const activos = await deps.db.select().from(priceWatches).where(eq(priceWatches.active, true)).limit(100);
  for (const w of activos) await revisarUno(deps, w);
}

// ---------------------------------------------------------------- rutas

const vigilanteSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  url: z.string().trim().url("URL inválida").max(2000).refine((u) => /^https?:\/\//i.test(u), "Solo http o https"),
  selector: z.string().trim().min(1).max(300),
  activo: z.boolean().default(true),
});

const ubicacionSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export function novedadesRoutes(deps: ModuleDeps) {
  const leer = { config: { acceso: { modulo: "novedades" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "novedades" as const, nivel: "escritura" as const } } };

  return async function (app: FastifyInstance): Promise<void> {
    // -------- clima
    app.get("/api/novedades/ciudades", leer, async (request) => {
      const { q } = z.object({ q: z.string().trim().min(2).max(100) }).parse(request.query);
      const r = await conCache(`geo:${q.toLowerCase()}`, 24 * 60 * 60_000, () =>
        pedirJson<{ results?: { name: string; latitude: number; longitude: number; admin1?: string; country?: string }[] }>(
          "Open-Meteo",
          `https://geocoding-api.open-meteo.com/v1/search?count=6&language=es&name=${encodeURIComponent(q)}`,
        ),
      );
      return (r.results ?? []).map((c) => ({ nombre: [c.name, c.admin1, c.country].filter(Boolean).join(", "), lat: c.latitude, lon: c.longitude }));
    });

    app.get("/api/novedades/clima/ubicacion", leer, async (request) => {
      const user = currentUser(request);
      const [fila] = await deps.db.select().from(appSettings).where(eq(appSettings.key, `clima:${user.id}`));
      return (fila?.value as z.infer<typeof ubicacionSchema> | undefined) ?? null;
    });

    app.put("/api/novedades/clima/ubicacion", leer, async (request) => {
      const user = currentUser(request);
      const u = ubicacionSchema.parse(request.body);
      await deps.db
        .insert(appSettings)
        .values({ key: `clima:${user.id}`, value: u, updatedAt: deps.now() })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: u, updatedAt: deps.now() } });
      return u;
    });

    app.get("/api/novedades/clima", leer, async (request) => {
      const { lat, lon } = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) }).parse(request.query);
      return conCache(`clima:${lat.toFixed(2)}:${lon.toFixed(2)}`, 10 * 60_000, () =>
        pedirJson<unknown>(
          "Open-Meteo",
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=5` +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        ),
      );
    });

    // -------- ofertas (CheapShark)
    app.get("/api/novedades/tiendas", leer, async () =>
      conCache("tiendas", 24 * 60 * 60_000, async () => {
        const r = await pedirJson<{ storeID: string; storeName: string; isActive: number }[]>("CheapShark", "https://www.cheapshark.com/api/1.0/stores");
        return r.filter((t) => t.isActive === 1).map((t) => ({ id: t.storeID, nombre: t.storeName }));
      }),
    );

    app.get("/api/novedades/ofertas", leer, async (request) => {
      const q = z
        .object({
          tienda: z.string().regex(/^\d{1,3}$/).optional(),
          precioMax: z.coerce.number().min(0).max(200).default(15),
          titulo: z.string().trim().max(100).optional(),
        })
        .parse(request.query);
      const params = new URLSearchParams({ pageSize: "30", sortBy: "Deal Rating", upperPrice: String(q.precioMax), onSale: "1" });
      if (q.tienda) params.set("storeID", q.tienda);
      if (q.titulo) params.set("title", q.titulo);
      const r = await conCache(`ofertas:${params}`, 30 * 60_000, () =>
        pedirJson<
          { dealID: string; title: string; storeID: string; salePrice: string; normalPrice: string; savings: string; thumb: string; metacriticScore: string }[]
        >("CheapShark", `https://www.cheapshark.com/api/1.0/deals?${params}`),
      );
      return r.map((d) => ({
        id: d.dealID,
        titulo: d.title,
        tienda: d.storeID,
        precio: Number(d.salePrice),
        precioNormal: Number(d.normalPrice),
        ahorro: Math.round(Number(d.savings)),
        imagen: d.thumb,
        metacritic: Number(d.metacriticScore) || null,
        url: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(d.dealID)}`,
      }));
    });

    // -------- vigilante de precios
    app.get("/api/novedades/vigilante", leer, async () => {
      const filas = await deps.db.select().from(priceWatches).orderBy(desc(priceWatches.createdAt));
      return filas.map(vigilanteDto);
    });

    app.post("/api/novedades/vigilante", escribir, async (request) => {
      const user = currentUser(request);
      const d = vigilanteSchema.parse(request.body);
      const [w] = await deps.db
        .insert(priceWatches)
        .values({ name: d.nombre, url: d.url, selector: d.selector, active: d.activo, createdBy: user.id })
        .returning();
      if (!w) throw new HttpError(500, "No se pudo guardar");
      return vigilanteDto(await revisarUno(deps, w));
    });

    app.patch("/api/novedades/vigilante/:id", escribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = vigilanteSchema.partial().parse(request.body);
      const [w] = await deps.db
        .update(priceWatches)
        .set({
          ...(d.nombre !== undefined ? { name: d.nombre } : {}),
          ...(d.url !== undefined ? { url: d.url } : {}),
          ...(d.selector !== undefined ? { selector: d.selector } : {}),
          ...(d.activo !== undefined ? { active: d.activo } : {}),
        })
        .where(eq(priceWatches.id, id))
        .returning();
      if (!w) throw new HttpError(404, "Vigilante no encontrado");
      return vigilanteDto(w);
    });

    app.post("/api/novedades/vigilante/:id/revisar", escribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const [w] = await deps.db.select().from(priceWatches).where(eq(priceWatches.id, id));
      if (!w) throw new HttpError(404, "Vigilante no encontrado");
      return vigilanteDto(await revisarUno(deps, w));
    });

    app.get("/api/novedades/vigilante/:id/historial", leer, async (request) => {
      const { id } = idParams.parse(request.params);
      const filas = await deps.db.select().from(priceHistory).where(eq(priceHistory.watchId, id)).orderBy(desc(priceHistory.at)).limit(100);
      return filas.reverse().map((h) => ({ precio: Number(h.price), fecha: h.at.toISOString() }));
    });

    app.delete("/api/novedades/vigilante/:id", escribir, async (request) => {
      const { id } = idParams.parse(request.params);
      await deps.db.delete(priceWatches).where(eq(priceWatches.id, id));
      return { ok: true };
    });
  };
}
