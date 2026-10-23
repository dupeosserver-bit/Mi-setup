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
import { pedirJson } from "./http-json.js";
import { descargarTextoSeguro } from "./red-segura.js";

/** Las tiendas grandes (Amazon, Mercado Libre…) mandan páginas de 3 a 8 MB: se leen hasta 10 MB y, si pasan, se usa lo leído. */
const PAGINA_TIENDA = { maxBytes: 10_000_000, cortar: true, timeoutMs: 20_000 };

// ---------------------------------------------------------------- caché simple en memoria

const cache = new Map<string, { hasta: number; valor: unknown }>();
export async function conCache<T>(clave: string, ms: number, fn: () => Promise<T>): Promise<T> {
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

/** Lugares típicos del precio en tiendas conocidas (si la página no trae datos estructurados). */
const SELECTORES_CONOCIDOS = [
  "#corePrice_feature_div .a-offscreen", // Amazon
  ".a-price .a-offscreen", // Amazon
  ".ui-pdp-price__second-line .andes-money-amount__fraction", // Mercado Libre
  ".andes-money-amount__fraction", // Mercado Libre
  ".priceText", // Cyberpuerta
  ".a-product__paragraphDiscountPrice", // Liverpool
  ".a-product__paragraphRegularPrice", // Liverpool
  ".pdp-price .price-value", // Coppel
  "[data-testid='price-wrap'] [itemprop='price']", // Walmart
  ".vtex-product-price-1-x-sellingPriceValue", // Elektra y tiendas VTEX
  ".product-price-amount .notranslate", // Costco
  ".product-price", // varias tiendas
  ".price-new",
  ".price",
];

/** Busca un precio en datos JSON-LD (lo que las tiendas publican para Google). */
function precioJsonLd(valor: unknown, profundidad = 0): string | null {
  if (profundidad > 8 || valor === null || typeof valor !== "object") return null;
  if (Array.isArray(valor)) {
    for (const v of valor) {
      const p = precioJsonLd(v, profundidad + 1);
      if (p) return p;
    }
    return null;
  }
  const o = valor as Record<string, unknown>;
  for (const clave of ["price", "lowPrice"]) {
    const v = o[clave];
    if ((typeof v === "number" && v > 0) || (typeof v === "string" && /\d/.test(v))) return String(v);
  }
  for (const clave of ["offers", "@graph", "mainEntity", "itemOffered"]) {
    const p = precioJsonLd(o[clave], profundidad + 1);
    if (p) return p;
  }
  return null;
}

/** Busca un precio dentro de los datos que traen las páginas hechas con Next.js o VTEX (Walmart, Coppel, Elektra…). */
export function precioEnDatosDePagina(html: string): string | null {
  const $ = load(html);
  const buscar = (v: unknown, prof = 0): string | null => {
    if (prof > 12 || v === null || typeof v !== "object") return null;
    if (Array.isArray(v)) {
      for (const x of v.slice(0, 60)) {
        const p = buscar(x, prof + 1);
        if (p) return p;
      }
      return null;
    }
    const o = v as Record<string, unknown>;
    for (const clave of ["sellingPrice", "finalPrice", "currentPrice", "salePrice", "offerPrice", "price"]) {
      const x = o[clave];
      if (typeof x === "number" && x > 0) return String(x);
      if (typeof x === "string" && /^\$?\s?\d[\d,.]*$/.test(x.trim())) return x;
      if (x && typeof x === "object") {
        const p = buscar(x, prof + 1);
        if (p) return p;
      }
    }
    for (const x of Object.values(o).slice(0, 80)) {
      const p = buscar(x, prof + 1);
      if (p) return p;
    }
    return null;
  };
  const next = $("script#__NEXT_DATA__").first().text();
  if (next) {
    try {
      const p = buscar(JSON.parse(next));
      if (p) return p;
    } catch {
      /* JSON inválido */
    }
  }
  // VTEX guarda el precio como "Price": 1234.5 dentro de __STATE__.
  const vtex = /"(?:Price|sellingPrice|spotPrice)"\s*:\s*(\d+(?:\.\d+)?)/.exec(html);
  return vtex && Number(vtex[1]) > 0 ? vtex[1]! : null;
}

/**
 * Modo automático (sin selector): datos estructurados primero (JSON-LD y
 * meta de precio, los más fiables), después los lugares típicos de tiendas conocidas.
 */
export function detectarPrecio(html: string): { precio: number; texto: string; metodo: string } {
  const $ = load(html);
  const probar = (texto: string | undefined, metodo: string) => {
    const t = (texto ?? "").trim().slice(0, 200);
    const precio = t ? interpretarPrecio(t) : null;
    return precio !== null && precio > 0 ? { precio, texto: t, metodo } : null;
  };
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    try {
      const r = probar(precioJsonLd(JSON.parse($(script).text())) ?? undefined, "datos de la tienda (JSON-LD)");
      if (r) return r;
    } catch {
      // JSON inválido en la página: se prueba lo siguiente.
    }
  }
  for (const sel of ['meta[itemprop="price"]', '[itemprop="price"][content]', 'meta[property="product:price:amount"]', 'meta[property="og:price:amount"]']) {
    const el = $(sel).first();
    const r = el.length ? probar(el.attr("content"), "etiqueta de precio de la página") : null;
    if (r) return r;
  }
  const deDatos = probar(precioEnDatosDePagina(html) ?? undefined, "datos internos de la página");
  if (deDatos) return deDatos;
  for (const sel of SELECTORES_CONOCIDOS) {
    const el = $(sel).first();
    const r = el.length ? probar(el.attr("content") ?? el.text(), `selector ${sel}`) : null;
    if (r) return r;
  }
  throw new HttpError(
    422,
    "No encontré el precio automáticamente. Puede que la tienda bloquee a los robots (Amazon a veces lo hace) o que muestre el precio con JavaScript. Prueba con otra tienda o escribe el selector a mano.",
  );
}

/** Extrae el precio del HTML: con el selector (usa el atributo content si existe) o automático si está vacío. */
export function extraerPrecio(html: string, selector: string): { precio: number; texto: string } {
  if (!selector.trim() || selector.trim() === "auto") return detectarPrecio(html);
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
    objetivo: w.targetPrice === null ? null : Number(w.targetPrice),
    texto: w.lastText,
    revisado: w.lastCheckedAt?.toISOString() ?? null,
    error: w.lastError,
  };
}

async function revisarUno(deps: ModuleDeps, w: typeof priceWatches.$inferSelect) {
  const ahora = deps.now();
  try {
    const html = await descargarTextoSeguro(w.url, PAGINA_TIENDA);
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
    // Precio objetivo: se avisa al cruzarlo (no en cada revisión mientras siga abajo).
    const objetivo = w.targetPrice === null ? null : Number(w.targetPrice);
    if (objetivo !== null && precio <= objetivo && (anterior === null || anterior > objetivo)) {
      await deps.notifier.send({ title: `¡Llegó a tu precio! ${w.name}`, message: `Ahora cuesta ${precio} (tu objetivo: ${objetivo})`, priority: 5, tags: ["moneybag"] });
      if (w.createdBy) deps.hub.publicar(`usuario:${w.createdBy}`, { recurso: "novedades", aviso: { titulo: `¡Precio objetivo! ${w.name}`, cuerpo: `Ahora: ${precio}` } });
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
  /** Vacío = automático (la app busca el precio sola). */
  selector: z.string().trim().max(300).default(""),
  activo: z.boolean().default(true),
  /** Precio al que quieres comprar: avisa cuando baje a ese valor o menos. */
  objetivo: z.number().positive().max(10_000_000).nullable().default(null),
});

const ubicacionSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** Detectar la ubicación cada vez que se abre Clima (GPS o, si no hay, por IP). */
  auto: z.boolean().default(false),
});

/** Lo que usamos de appdetails de Steam. */
interface DatosSteam {
  name: string;
  header_image: string;
  short_description: string;
  is_free: boolean;
  price_overview?: { final: number; discount_percent: number };
  release_date?: { date: string };
  genres?: { description: string }[];
  developers?: string[];
  metacritic?: { score: number };
  pc_requirements?: { minimum?: string; recommended?: string };
}

/** Tiendas para buscar juegos (las de claves de terceros se marcan como mercado). */
export const TIENDAS_JUEGOS = [
  { id: "steam", nombre: "Steam", tipo: "oficial", url: "https://store.steampowered.com/search/?term=" },
  { id: "epic", nombre: "Epic Games", tipo: "oficial", url: "https://store.epicgames.com/es-MX/browse?q=" },
  { id: "gog", nombre: "GOG", tipo: "oficial", url: "https://www.gog.com/es/games?query=" },
  { id: "humble", nombre: "Humble Bundle", tipo: "autorizada", url: "https://www.humblebundle.com/store/search?search=" },
  { id: "fanatical", nombre: "Fanatical", tipo: "autorizada", url: "https://www.fanatical.com/es/search?search=" },
  { id: "gmg", nombre: "Green Man Gaming", tipo: "autorizada", url: "https://www.greenmangaming.com/search/?query=" },
  { id: "instant", nombre: "Instant Gaming", tipo: "revendedor", url: "https://www.instant-gaming.com/es/busquedas/?q=" },
  { id: "eneba", nombre: "Eneba", tipo: "mercado", url: "https://www.eneba.com/mx/store?text=" },
  { id: "g2a", nombre: "G2A", tipo: "mercado", url: "https://www.g2a.com/es/search?query=" },
  { id: "kinguin", nombre: "Kinguin", tipo: "mercado", url: "https://www.kinguin.net/listing?phrase=" },
] as const;

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

    /** Nombre del lugar para unas coordenadas (GPS del dispositivo). OpenStreetMap / Nominatim. */
    app.get("/api/novedades/lugar", leer, async (request) => {
      const { lat, lon } = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) }).parse(request.query);
      const r = await conCache(`lugar:${lat.toFixed(2)}:${lon.toFixed(2)}`, 24 * 60 * 60_000, () =>
        pedirJson<{ address?: { city?: string; town?: string; village?: string; municipality?: string; state?: string; country?: string } }>(
          "OpenStreetMap",
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=es&lat=${lat}&lon=${lon}`,
        ).catch(() => ({ address: undefined })),
      );
      const a = r.address;
      const ciudad = a?.city ?? a?.town ?? a?.village ?? a?.municipality;
      return { nombre: [ciudad, a?.state, a?.country].filter(Boolean).join(", ") || `Mi ubicación (${lat.toFixed(2)}, ${lon.toFixed(2)})`, lat, lon };
    });

    /** Ubicación aproximada por la IP pública de quien pregunta (cuando el dispositivo no da GPS). */
    app.get("/api/novedades/ip-ubicacion", leer, async (request) => {
      const ip = request.ip;
      if (!ip || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1|fc|fd|fe80)/i.test(ip)) {
        throw new HttpError(422, "No se pudo ubicar por IP desde una red local; busca tu ciudad o permite la ubicación del dispositivo.");
      }
      const r = await pedirJson<{ success: boolean; city?: string; region?: string; country?: string; latitude?: number; longitude?: number }>(
        "ipwho.is",
        `https://ipwho.is/${encodeURIComponent(ip)}?lang=es`,
      );
      if (!r.success || r.latitude === undefined || r.longitude === undefined) throw new HttpError(502, "No se pudo ubicar por IP");
      return { nombre: [r.city, r.region, r.country].filter(Boolean).join(", "), lat: r.latitude, lon: r.longitude };
    });

    // -------- juegos gratis (GamerPower: Epic, Steam, GOG…) y tiendas para buscar
    app.get("/api/novedades/juegos-gratis", leer, async (request) => {
      const { plataforma, pagina } = z
        .object({
          plataforma: z.enum(["todas", "pc", "epic-games-store", "steam", "gog", "ps5", "xbox-series-xs", "switch", "android"]).default("todas"),
          pagina: z.coerce.number().int().min(1).max(50).default(1),
        })
        .parse(request.query);
      const url = `https://www.gamerpower.com/api/giveaways?type=game&sort-by=date${plataforma === "todas" ? "" : `&platform=${plataforma}`}`;
      const r = await conCache(`gratis:${plataforma}`, 30 * 60_000, async () => {
        const lista = await pedirJson<
          { id: number; title: string; worth: string; image: string; description: string; open_giveaway_url: string; platforms: string; end_date: string; status: string }[] | { status: number }
        >("GamerPower", url).catch(() => []);
        return Array.isArray(lista) ? lista : [];
      });
      const activos = r.filter((g) => g.status === "Active");
      const porPagina = 12;
      return {
        pagina,
        totalPaginas: Math.max(1, Math.ceil(activos.length / porPagina)),
        juegos: activos.slice((pagina - 1) * porPagina, pagina * porPagina).map((g) => ({
          id: g.id,
          titulo: g.title,
          valor: g.worth === "N/A" ? null : g.worth,
          imagen: g.image,
          descripcion: g.description.slice(0, 300),
          url: g.open_giveaway_url,
          plataformas: g.platforms,
          termina: g.end_date === "N/A" ? null : g.end_date,
        })),
      };
    });

    app.get("/api/novedades/tiendas-juegos", leer, async () => TIENDAS_JUEGOS);

    // -------- Steam: buscar juegos y ver sus datos (jugadores, reseñas, requisitos)
    app.get("/api/novedades/steam/buscar", leer, async (request) => {
      const { q } = z.object({ q: z.string().trim().min(2).max(100) }).parse(request.query);
      const r = await conCache(`steam-buscar:${q.toLowerCase()}`, 60 * 60_000, () =>
        pedirJson<{ items?: { id: number; name: string; tiny_image: string; price?: { final: number; currency: string } }[] }>(
          "Steam",
          `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=spanish&cc=MX`,
        ),
      );
      return (r.items ?? []).slice(0, 12).map((j) => ({
        id: j.id,
        nombre: j.name,
        imagen: j.tiny_image,
        precio: j.price ? j.price.final / 100 : null,
        moneda: j.price?.currency ?? null,
      }));
    });

    app.get("/api/novedades/steam/:appid", leer, async (request) => {
      const { appid } = z.object({ appid: z.coerce.number().int().positive().max(99_999_999) }).parse(request.params);
      return conCache(`steam-juego:${appid}`, 30 * 60_000, async () => {
        const [detalle, jugadores, spy] = await Promise.all([
          pedirJson<Record<string, { success: boolean; data?: DatosSteam }>>("Steam", `https://store.steampowered.com/api/appdetails?appids=${appid}&l=spanish&cc=MX`),
          pedirJson<{ response?: { player_count?: number } }>("Steam", `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appid}`).catch(() => null),
          pedirJson<{ positive?: number; negative?: number; owners?: string; average_forever?: number; ccu?: number }>(
            "SteamSpy",
            `https://steamspy.com/api.php?request=appdetails&appid=${appid}`,
          ).catch(() => null),
        ]);
        const d = detalle[String(appid)]?.data;
        if (!d) throw new HttpError(404, "Ese juego no está en Steam");
        const texto = (html?: string) => (html ? load(html).text().replace(/\s+\n/g, "\n").trim() : null);
        const positivas = spy?.positive ?? 0;
        const negativas = spy?.negative ?? 0;
        return {
          id: appid,
          nombre: d.name,
          imagen: d.header_image,
          descripcion: d.short_description,
          precio: d.is_free ? 0 : d.price_overview ? d.price_overview.final / 100 : null,
          descuento: d.price_overview?.discount_percent ?? 0,
          lanzamiento: d.release_date?.date ?? null,
          generos: (d.genres ?? []).map((g) => g.description),
          desarrollador: d.developers?.[0] ?? null,
          metacritic: d.metacritic?.score ?? null,
          jugadoresAhora: jugadores?.response?.player_count ?? null,
          picoAyer: spy?.ccu ?? null,
          resenas: positivas + negativas > 0 ? { positivas, negativas, porcentaje: Math.round((positivas / (positivas + negativas)) * 100) } : null,
          duenos: spy?.owners ?? null,
          horasPromedio: spy?.average_forever ? Math.round(spy.average_forever / 60) : null,
          requisitos: { minimos: texto(d.pc_requirements?.minimum), recomendados: texto(d.pc_requirements?.recommended) },
          url: `https://store.steampowered.com/app/${appid}`,
          steamdb: `https://steamdb.info/app/${appid}/`,
        };
      });
    });

    // -------- Steam: listas (populares, más jugados, mejor valorados, recomendados por tus géneros)
    app.get("/api/novedades/steam/listas", leer, async (request) => {
      const q = z
        .object({
          tipo: z.enum(["populares", "mas-jugados", "mejor-valorados", "recomendados"]),
          generos: z.string().max(200).default(""),
          pagina: z.coerce.number().int().min(1).max(20).default(1),
        })
        .parse(request.query);
      type Spy = Record<string, { appid: number; name: string; positive: number; negative: number; ccu: number; price?: string; owners?: string }>;
      const spy = (url: string) => conCache(`steamspy:${url}`, 6 * 60 * 60_000, () => pedirJson<Spy>("SteamSpy", url));
      let lista: Spy[string][];
      // Ojo: las llaves numéricas hacen que Object.values salga ordenado por appid; hay que ordenar siempre.
      if (q.tipo === "populares") lista = Object.values(await spy("https://steamspy.com/api.php?request=top100in2weeks")).sort((a, b) => b.positive + b.negative - (a.positive + a.negative));
      else if (q.tipo === "mas-jugados") lista = Object.values(await spy("https://steamspy.com/api.php?request=top100in2weeks")).sort((a, b) => b.ccu - a.ccu);
      else if (q.tipo === "mejor-valorados") {
        lista = Object.values(await spy("https://steamspy.com/api.php?request=top100forever"))
          .filter((j) => j.positive + j.negative >= 5000)
          .sort((a, b) => b.positive / (b.positive + b.negative) - a.positive / (a.positive + a.negative));
      } else {
        const generos = q.generos
          .split(",")
          .map((g) => g.trim())
          .filter((g) => /^[\w &+-]{2,30}$/.test(g))
          .slice(0, 4);
        if (!generos.length) throw new HttpError(400, "Elige al menos un género que te guste");
        const juntos = new Map<number, Spy[string] & { coincide: number }>();
        for (const g of generos) {
          const r = await spy(`https://steamspy.com/api.php?request=tag&tag=${encodeURIComponent(g)}`);
          for (const j of Object.values(r)) {
            if (j.positive + j.negative < 2000) continue;
            const ya = juntos.get(j.appid);
            juntos.set(j.appid, { ...j, coincide: (ya?.coincide ?? 0) + 1 });
          }
        }
        // Más géneros en común primero; luego los mejor valorados con más reseñas.
        const puntaje = (j: Spy[string] & { coincide: number }) => j.coincide * 10 + (j.positive / (j.positive + j.negative)) * Math.log10(j.positive + j.negative);
        lista = [...juntos.values()].sort((a, b) => puntaje(b) - puntaje(a));
      }
      const porPagina = 12;
      return {
        total: Math.min(lista.length, 240),
        pagina: q.pagina,
        juegos: lista.slice((q.pagina - 1) * porPagina, q.pagina * porPagina).map((j) => ({
          id: j.appid,
          nombre: j.name,
          imagen: `https://cdn.cloudflare.steamstatic.com/steam/apps/${j.appid}/header.jpg`,
          valoracion: j.positive + j.negative > 0 ? Math.round((j.positive / (j.positive + j.negative)) * 100) : null,
          resenas: j.positive + j.negative,
          jugadores: j.ccu,
          precioUsd: j.price ? Number(j.price) / 100 : null,
        })),
      };
    });

    /** Precio de un juego en varias regiones de Steam (cada uno en su moneda). */
    app.get("/api/novedades/steam/:appid/regiones", leer, async (request) => {
      const { appid } = z.object({ appid: z.coerce.number().int().positive().max(99_999_999) }).parse(request.params);
      const regiones = ["MX", "US", "AR", "BR", "CL", "CO", "ES", "GB", "CA", "TR", "IN", "JP"];
      return conCache(`steam-regiones:${appid}`, 6 * 60 * 60_000, async () => {
        const resultados = await Promise.all(
          regiones.map(async (cc) => {
            const r = await pedirJson<Record<string, { success: boolean; data?: { price_overview?: { final: number; currency: string; discount_percent: number } } | [] }>>(
              "Steam",
              `https://store.steampowered.com/api/appdetails?appids=${appid}&cc=${cc}&filters=price_overview`,
            ).catch(() => null);
            const d = r?.[String(appid)]?.data;
            const p = d && !Array.isArray(d) ? d.price_overview : undefined;
            return p ? { region: cc, precio: p.final / 100, moneda: p.currency, descuento: p.discount_percent } : { region: cc, precio: null, moneda: null, descuento: 0 };
          }),
        );
        return resultados;
      });
    });

    /** Ofertas especiales de Steam en la región que elijas (precios en su moneda). */
    app.get("/api/novedades/steam/ofertas", leer, async (request) => {
      const { region } = z.object({ region: z.string().regex(/^[A-Z]{2}$/).default("MX") }).parse(request.query);
      const r = await conCache(`steam-ofertas:${region}`, 60 * 60_000, () =>
        pedirJson<{ specials?: { items?: { id: number; name: string; discount_percent: number; original_price: number | null; final_price: number; currency: string; header_image: string }[] } }>(
          "Steam",
          `https://store.steampowered.com/api/featuredcategories?cc=${region}&l=spanish`,
        ),
      );
      return (r.specials?.items ?? []).map((j) => ({
        id: j.id,
        nombre: j.name,
        descuento: j.discount_percent,
        precio: j.final_price / 100,
        precioNormal: j.original_price ? j.original_price / 100 : null,
        moneda: j.currency,
        imagen: j.header_image,
        url: `https://store.steampowered.com/app/${j.id}`,
      }));
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
      const { lat, lon, dias } = z
        .object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180), dias: z.coerce.number().int().min(1).max(16).default(10) })
        .parse(request.query);
      return conCache(`clima:${lat.toFixed(2)}:${lon.toFixed(2)}:${dias}`, 10 * 60_000, () =>
        pedirJson<unknown>(
          "Open-Meteo",
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=${dias}` +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        ),
      );
    });

    /** Clima a detalle: hora por hora de ayer y los próximos 10 días (para ver cualquier día), sol y UV. */
    app.get("/api/novedades/clima/detalle", leer, async (request) => {
      const { lat, lon } = z.object({ lat: z.coerce.number().min(-90).max(90), lon: z.coerce.number().min(-180).max(180) }).parse(request.query);
      return conCache(`clima-detalle:${lat.toFixed(2)}:${lon.toFixed(2)}`, 10 * 60_000, () =>
        pedirJson<unknown>(
          "Open-Meteo",
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&past_days=1&forecast_days=10` +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day,uv_index,pressure_msl,visibility" +
            "&hourly=temperature_2m,precipitation_probability,weather_code,is_day,apparent_temperature,wind_speed_10m,relative_humidity_2m" +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max",
        ),
      );
    });

    /** Tipos de cambio desde el dólar (para ver los precios de juegos en tu moneda). */
    app.get("/api/novedades/tasas", leer, async () =>
      conCache("tasas-usd", 6 * 60 * 60_000, async () => {
        const r = await pedirJson<{ result: string; rates?: Record<string, number> }>("ExchangeRate-API", "https://open.er-api.com/v6/latest/USD");
        const quiero = ["USD", "MXN", "EUR", "ARS", "BRL", "COP", "CLP", "PEN", "GBP", "CAD", "TRY", "INR", "JPY"];
        return { base: "USD", tasas: Object.fromEntries(quiero.map((m) => [m, r.rates?.[m] ?? null]).filter(([, v]) => v !== null)) as Record<string, number> };
      }),
    );

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
          pagina: z.coerce.number().int().min(1).max(50).default(1),
        })
        .parse(request.query);
      // CheapShark cuenta las páginas desde 0.
      const params = new URLSearchParams({ pageSize: "30", sortBy: "Deal Rating", upperPrice: String(q.precioMax), onSale: "1", pageNumber: String(q.pagina - 1) });
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

    // Probar una página antes de guardar: dice qué precio encontró y cómo.
    app.post("/api/novedades/vigilante/probar", escribir, async (request) => {
      const d = vigilanteSchema.pick({ url: true, selector: true }).parse(request.body);
      const html = await descargarTextoSeguro(d.url, PAGINA_TIENDA);
      if (!d.selector) return detectarPrecio(html);
      return { ...extraerPrecio(html, d.selector), metodo: `selector ${d.selector}` };
    });

    app.post("/api/novedades/vigilante", escribir, async (request) => {
      const user = currentUser(request);
      const d = vigilanteSchema.parse(request.body);
      const [w] = await deps.db
        .insert(priceWatches)
        .values({ name: d.nombre, url: d.url, selector: d.selector, active: d.activo, targetPrice: d.objetivo === null ? null : d.objetivo.toFixed(2), createdBy: user.id })
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
          ...(d.objetivo !== undefined ? { targetPrice: d.objetivo === null ? null : d.objetivo.toFixed(2) } : {}),
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
