/**
 * Mercados sin clave de API:
 * - Cripto: CoinGecko (precios, cambio 24 h, gráfica de 7 días).
 * - Inversiones: Stooq (cierre diario de acciones, ETF e índices).
 * - Divisas: Frankfurter (tipos de cambio del Banco Central Europeo).
 * Cada cuenta guarda su lista de seguimiento. Solo se muestran datos; no es
 * asesoría financiera.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import type { ModuleDeps } from "./common.js";
import { conCache } from "./novedades.js";
import { pedirJson } from "./redes/oauth.js";
import { getSetting, setSetting } from "./settings.js";

const CRIPTO_INICIAL = ["bitcoin", "ethereum", "solana", "tether", "ripple", "dogecoin"];
const INVERSIONES_INICIAL = ["aapl.us", "nvda.us", "msft.us", "tsla.us", "spy.us", "^spx"];
const DIVISAS_INICIAL = { base: "USD", destinos: ["MXN", "EUR", "GBP", "JPY", "CAD"] };

async function lista<T>(deps: ModuleDeps, clave: string, inicial: T): Promise<T> {
  return (await getSetting<T>(deps.db, clave)) ?? inicial;
}

/** Descarga texto (CSV) de un servicio externo conocido. */
async function pedirTexto(servicio: string, url: string): Promise<string> {
  const r = await fetch(url, { headers: { "user-agent": "MiSetup/0.1 (+https://setup.mexicanland.net)" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new HttpError(502, `${servicio} respondió ${r.status}`);
  return r.text();
}

interface Cotizacion {
  simbolo: string;
  nombre: string;
  precio: number | null;
  cambio: number | null;
  fecha: string | null;
  serie: number[];
  error?: string;
}

/** Últimos ~30 cierres diarios de un símbolo de Stooq. */
async function cotizacionStooq(simbolo: string): Promise<Cotizacion> {
  return conCache(`stooq:${simbolo}`, 10 * 60_000, async () => {
    try {
      const desde = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
      const csv = await pedirTexto("Stooq", `https://stooq.com/q/d/l/?s=${encodeURIComponent(simbolo)}&i=d&d1=${desde}`);
      const filas = csv
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((l) => l.split(","))
        .filter((c) => c.length >= 5 && Number.isFinite(Number(c[4])));
      if (!filas.length) return { simbolo, nombre: simbolo.toUpperCase(), precio: null, cambio: null, fecha: null, serie: [], error: "Símbolo no encontrado en Stooq" };
      const cierres = filas.map((c) => Number(c[4]));
      const ultimo = cierres.at(-1) ?? null;
      const previo = cierres.at(-2) ?? null;
      return {
        simbolo,
        nombre: simbolo.toUpperCase(),
        precio: ultimo,
        cambio: ultimo !== null && previo ? ((ultimo - previo) / previo) * 100 : null,
        fecha: filas.at(-1)?.[0] ?? null,
        serie: cierres.slice(-30),
      };
    } catch (err) {
      return { simbolo, nombre: simbolo.toUpperCase(), precio: null, cambio: null, fecha: null, serie: [], error: err instanceof Error ? err.message : "Sin datos" };
    }
  });
}

export function mercadosRoutes(deps: ModuleDeps) {
  const acceso = (modulo: "cripto" | "inversiones" | "divisas", nivel: "lectura" | "escritura") => ({ config: { acceso: { modulo, nivel } } });

  return async function (app: FastifyInstance): Promise<void> {
    // ---------------------------------------------------------------- cripto
    app.get("/api/cripto", acceso("cripto", "lectura"), async (request) => {
      const user = currentUser(request);
      const { moneda } = z.object({ moneda: z.enum(["mxn", "usd", "eur"]).default("mxn") }).parse(request.query);
      const ids = await lista(deps, `cripto:${user.id}`, CRIPTO_INICIAL);
      if (!ids.length) return [];
      const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=${moneda}&ids=${ids.map(encodeURIComponent).join(",")}&sparkline=true&price_change_percentage=24h,7d`;
      const r = await conCache(`cripto:${moneda}:${ids.join(",")}`, 2 * 60_000, () =>
        pedirJson<
          {
            id: string;
            symbol: string;
            name: string;
            image: string;
            current_price: number;
            market_cap: number;
            price_change_percentage_24h_in_currency: number | null;
            price_change_percentage_7d_in_currency: number | null;
            sparkline_in_7d?: { price: number[] };
          }[]
        >("CoinGecko", url),
      );
      return r.map((c) => ({
        id: c.id,
        simbolo: c.symbol.toUpperCase(),
        nombre: c.name,
        imagen: c.image,
        precio: c.current_price,
        capitalizacion: c.market_cap,
        cambio24h: c.price_change_percentage_24h_in_currency,
        cambio7d: c.price_change_percentage_7d_in_currency,
        // 7 días de precios por hora: se toma 1 de cada 4 para la mini gráfica.
        serie: (c.sparkline_in_7d?.price ?? []).filter((_, i) => i % 4 === 0),
      }));
    });

    app.get("/api/cripto/buscar", acceso("cripto", "lectura"), async (request) => {
      const { q } = z.object({ q: z.string().trim().min(1).max(50) }).parse(request.query);
      const r = await conCache(`cripto-buscar:${q.toLowerCase()}`, 60 * 60_000, () =>
        pedirJson<{ coins: { id: string; name: string; symbol: string; thumb: string; market_cap_rank: number | null }[] }>(
          "CoinGecko",
          `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`,
        ),
      );
      return r.coins.slice(0, 10).map((c) => ({ id: c.id, nombre: c.name, simbolo: c.symbol.toUpperCase(), imagen: c.thumb, rango: c.market_cap_rank }));
    });

    app.put("/api/cripto/lista", acceso("cripto", "lectura"), async (request) => {
      const user = currentUser(request);
      const { ids } = z.object({ ids: z.array(z.string().trim().regex(/^[a-z0-9-]{1,80}$/)).max(30) }).parse(request.body);
      await setSetting(deps.db, `cripto:${user.id}`, [...new Set(ids)], deps.now());
      return { ok: true };
    });

    // ---------------------------------------------------------------- inversiones
    app.get("/api/inversiones", acceso("inversiones", "lectura"), async (request) => {
      const user = currentUser(request);
      const simbolos = await lista(deps, `inversiones:${user.id}`, INVERSIONES_INICIAL);
      return Promise.all(simbolos.map((s) => cotizacionStooq(s)));
    });

    app.put("/api/inversiones/lista", acceso("inversiones", "lectura"), async (request) => {
      const user = currentUser(request);
      const { simbolos } = z
        .object({ simbolos: z.array(z.string().trim().toLowerCase().regex(/^\^?[a-z0-9.-]{1,20}$/, "Símbolo inválido (ej. aapl.us, ^spx, amxl.mx)")).max(20) })
        .parse(request.body);
      await setSetting(deps.db, `inversiones:${user.id}`, [...new Set(simbolos)], deps.now());
      return { ok: true };
    });

    // ---------------------------------------------------------------- divisas
    app.get("/api/divisas/monedas", acceso("divisas", "lectura"), async () =>
      conCache("divisas-monedas", 24 * 60 * 60_000, () => pedirJson<Record<string, string>>("Frankfurter", "https://api.frankfurter.app/currencies")),
    );

    app.get("/api/divisas", acceso("divisas", "lectura"), async (request) => {
      const user = currentUser(request);
      const pref = await lista(deps, `divisas:${user.id}`, DIVISAS_INICIAL);
      const destinos = pref.destinos.filter((d) => d !== pref.base);
      if (!destinos.length) return { base: pref.base, fecha: null, tasas: {}, historial: {} };
      const hoy = await conCache(`divisas:${pref.base}:${destinos.join(",")}`, 30 * 60_000, () =>
        pedirJson<{ date: string; rates: Record<string, number> }>("Frankfurter", `https://api.frankfurter.app/latest?from=${pref.base}&to=${destinos.join(",")}`),
      );
      const desde = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
      const hist = await conCache(`divisas-hist:${pref.base}:${destinos.join(",")}:${desde}`, 6 * 60 * 60_000, () =>
        pedirJson<{ rates: Record<string, Record<string, number>> }>("Frankfurter", `https://api.frankfurter.app/${desde}..?from=${pref.base}&to=${destinos.join(",")}`).catch(() => ({ rates: {} })),
      );
      const historial: Record<string, { fecha: string; valor: number }[]> = {};
      for (const [fecha, tasas] of Object.entries(hist.rates).sort(([a], [b]) => a.localeCompare(b))) {
        for (const [moneda, valor] of Object.entries(tasas)) (historial[moneda] ??= []).push({ fecha, valor });
      }
      return { base: pref.base, destinos, fecha: hoy.date, tasas: hoy.rates, historial };
    });

    app.get("/api/divisas/convertir", acceso("divisas", "lectura"), async (request) => {
      const q = z
        .object({ de: z.string().regex(/^[A-Z]{3}$/), a: z.string().regex(/^[A-Z]{3}$/), cantidad: z.coerce.number().positive().max(1e12) })
        .parse(request.query);
      if (q.de === q.a) return { resultado: q.cantidad, tasa: 1, fecha: null };
      const r = await conCache(`conv:${q.de}:${q.a}`, 30 * 60_000, () =>
        pedirJson<{ date: string; rates: Record<string, number> }>("Frankfurter", `https://api.frankfurter.app/latest?from=${q.de}&to=${q.a}`),
      );
      const tasa = r.rates[q.a];
      if (tasa === undefined) throw new HttpError(404, "Moneda no disponible");
      return { resultado: q.cantidad * tasa, tasa, fecha: r.date };
    });

    app.put("/api/divisas/lista", acceso("divisas", "lectura"), async (request) => {
      const user = currentUser(request);
      const d = z.object({ base: z.string().regex(/^[A-Z]{3}$/), destinos: z.array(z.string().regex(/^[A-Z]{3}$/)).max(15) }).parse(request.body);
      await setSetting(deps.db, `divisas:${user.id}`, { base: d.base, destinos: [...new Set(d.destinos)] }, deps.now());
      return { ok: true };
    });
  };
}
