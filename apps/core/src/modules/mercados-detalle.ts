/**
 * Ficha completa de una acción o una cripto (como en las apps de bolsa):
 * - Acciones (Yahoo Finance): perfil, estadísticas clave (capitalización,
 *   P/E, EPS, dividendos, máximos y mínimos, rentabilidad), estado de
 *   ingresos, balance (activos y pasivos), flujo de efectivo, gráfica por
 *   rango y noticias.
 * - Cripto (CoinGecko): estadísticas, máximo y mínimo histórico, oferta,
 *   gráfica por rango y noticias (Google Noticias).
 * Solo datos para informarte: no se compra ni se vende desde la app.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import type { ModuleDeps } from "./common.js";
import { conCache } from "./novedades.js";
import { interpretarFeed } from "./noticias.js";
import { descargarTextoSeguro } from "./red-segura.js";
import { pedirJson } from "./http-json.js";

const NAVEGADOR = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };
const SIMBOLO = z.string().trim().toUpperCase().regex(/^\^?[A-Z0-9.=-]{1,20}$/, "Símbolo inválido");

// ---------------------------------------------------------------- Yahoo: sesión (cookie + crumb)

let sesion: { cookie: string; crumb: string; vence: number } | null = null;

async function sesionYahoo(): Promise<{ cookie: string; crumb: string }> {
  if (sesion && sesion.vence > Date.now()) return sesion;
  const r1 = await fetch("https://fc.yahoo.com", { headers: NAVEGADOR, redirect: "manual", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const cookie = (r1?.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", { headers: { ...NAVEGADOR, cookie }, signal: AbortSignal.timeout(10_000) });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.length > 40) throw new HttpError(502, "Yahoo Finance no dio acceso a las estadísticas");
  sesion = { cookie, crumb, vence: Date.now() + 6 * 60 * 60_000 };
  return sesion;
}

type Valor = { raw?: number; fmt?: string } | number | undefined | null;
const num = (v: Valor): number | null => (typeof v === "number" ? v : v && typeof v.raw === "number" ? v.raw : null);

interface ResumenYahoo {
  quoteSummary: {
    result:
      | {
          price?: Record<string, Valor | string>;
          assetProfile?: { sector?: string; industry?: string; longBusinessSummary?: string; website?: string; fullTimeEmployees?: number; country?: string };
          summaryDetail?: Record<string, Valor>;
          defaultKeyStatistics?: Record<string, Valor>;
          financialData?: Record<string, Valor | string>;
          calendarEvents?: { earnings?: { earningsDate?: Valor[] }; exDividendDate?: Valor; dividendDate?: Valor };
        }[]
      | null;
    error: { description?: string } | null;
  };
}

export interface EstadisticasAccion {
  nombre: string;
  moneda: string | null;
  precio: number | null;
  perfil: { sector: string | null; industria: string | null; descripcion: string | null; sitio: string | null; empleados: number | null; pais: string | null };
  estadisticas: {
    capitalizacion: number | null;
    pe: number | null;
    peFuturo: number | null;
    eps: number | null;
    pagaDividendos: boolean;
    dividendoAnual: number | null;
    rendimientoDividendo: number | null;
    fechaExDividendo: string | null;
    beta: number | null;
    maximo52: number | null;
    minimo52: number | null;
    maximoDia: number | null;
    minimoDia: number | null;
    volumen: number | null;
    margenBeneficio: number | null;
    roe: number | null;
    deudaCapital: number | null;
    recomendacion: string | null;
  };
  proximoReporte: string | null;
}

const fechaDe = (v: Valor): string | null => {
  const n = num(v);
  return n ? new Date(n * 1000).toISOString().slice(0, 10) : null;
};

export function interpretarResumenYahoo(r: ResumenYahoo, simbolo: string): EstadisticasAccion {
  const d = r.quoteSummary.result?.[0];
  if (!d) throw new HttpError(404, r.quoteSummary.error?.description ?? "Símbolo no encontrado");
  const sd = d.summaryDetail ?? {};
  const ks = d.defaultKeyStatistics ?? {};
  const fd = (d.financialData ?? {}) as Record<string, Valor>;
  const pr = d.price ?? {};
  const dividendo = num(sd.dividendRate) ?? num(sd.trailingAnnualDividendRate);
  const rendimiento = num(sd.dividendYield) ?? num(sd.trailingAnnualDividendYield);
  return {
    nombre: String((pr.longName as string | undefined) ?? (pr.shortName as string | undefined) ?? simbolo),
    moneda: (pr.currency as string | undefined) ?? (sd.currency as unknown as string | undefined) ?? null,
    precio: num(pr.regularMarketPrice as Valor) ?? num(fd.currentPrice),
    perfil: {
      sector: d.assetProfile?.sector ?? null,
      industria: d.assetProfile?.industry ?? null,
      descripcion: d.assetProfile?.longBusinessSummary ?? null,
      sitio: d.assetProfile?.website ?? null,
      empleados: d.assetProfile?.fullTimeEmployees ?? null,
      pais: d.assetProfile?.country ?? null,
    },
    estadisticas: {
      capitalizacion: num(sd.marketCap) ?? num(pr.marketCap as Valor),
      pe: num(sd.trailingPE),
      peFuturo: num(sd.forwardPE) ?? num(ks.forwardPE),
      eps: num(ks.trailingEps),
      pagaDividendos: Boolean(dividendo && dividendo > 0),
      dividendoAnual: dividendo && dividendo > 0 ? dividendo : null,
      rendimientoDividendo: rendimiento !== null ? rendimiento * 100 : null,
      fechaExDividendo: fechaDe(sd.exDividendDate) ?? fechaDe(d.calendarEvents?.exDividendDate),
      beta: num(sd.beta) ?? num(ks.beta),
      maximo52: num(sd.fiftyTwoWeekHigh),
      minimo52: num(sd.fiftyTwoWeekLow),
      maximoDia: num(sd.dayHigh) ?? num(sd.regularMarketDayHigh),
      minimoDia: num(sd.dayLow) ?? num(sd.regularMarketDayLow),
      volumen: num(sd.volume) ?? num(sd.regularMarketVolume),
      margenBeneficio: num(fd.profitMargins) !== null ? num(fd.profitMargins)! * 100 : num(ks.profitMargins) !== null ? num(ks.profitMargins)! * 100 : null,
      roe: num(fd.returnOnEquity) !== null ? num(fd.returnOnEquity)! * 100 : null,
      deudaCapital: num(fd.debtToEquity),
      recomendacion: typeof (d.financialData ?? {}).recommendationKey === "string" ? String((d.financialData ?? {}).recommendationKey) : null,
    },
    proximoReporte: fechaDe(d.calendarEvents?.earnings?.earningsDate?.[0]),
  };
}

// ---------------------------------------------------------------- Yahoo: estados financieros

const TIPOS_FINANZAS = [
  "TotalRevenue",
  "NetIncome",
  "TotalAssets",
  "TotalLiabilitiesNetMinorityInterest",
  "OperatingCashFlow",
  "InvestingCashFlow",
  "FinancingCashFlow",
  "FreeCashFlow",
  "DilutedEPS",
] as const;
const CLAVES_FINANZAS: Record<(typeof TIPOS_FINANZAS)[number], string> = {
  TotalRevenue: "ingresos",
  NetIncome: "ingresoNeto",
  TotalAssets: "activos",
  TotalLiabilitiesNetMinorityInterest: "pasivos",
  OperatingCashFlow: "flujoOperativo",
  InvestingCashFlow: "flujoInversion",
  FinancingCashFlow: "flujoFinanciamiento",
  FreeCashFlow: "flujoLibre",
  DilutedEPS: "eps",
};

export interface PeriodoFinanciero {
  fecha: string;
  ingresos?: number;
  ingresoNeto?: number;
  activos?: number;
  pasivos?: number;
  flujoOperativo?: number;
  flujoInversion?: number;
  flujoFinanciamiento?: number;
  flujoLibre?: number;
  eps?: number;
}

interface SerieYahoo {
  timeseries: { result: ({ meta: { type: string[] } } & Record<string, { asOfDate: string; reportedValue?: { raw?: number } }[] | unknown>)[] | null };
}

/** Junta las series (ingresos, activos…) por fecha. */
export function interpretarFinanzas(r: SerieYahoo, prefijo: "annual" | "quarterly"): PeriodoFinanciero[] {
  const porFecha = new Map<string, PeriodoFinanciero>();
  for (const s of r.timeseries.result ?? []) {
    const tipo = s.meta.type[0] ?? "";
    const base = tipo.replace(prefijo, "") as (typeof TIPOS_FINANZAS)[number];
    const clave = CLAVES_FINANZAS[base];
    const datos = s[tipo];
    if (!clave || !Array.isArray(datos)) continue;
    for (const p of datos as { asOfDate: string; reportedValue?: { raw?: number } }[]) {
      if (!p || typeof p.reportedValue?.raw !== "number") continue;
      const fila = porFecha.get(p.asOfDate) ?? { fecha: p.asOfDate };
      (fila as unknown as Record<string, number | string>)[clave] = p.reportedValue.raw;
      porFecha.set(p.asOfDate, fila);
    }
  }
  return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

async function finanzasYahoo(simbolo: string, prefijo: "annual" | "quarterly"): Promise<PeriodoFinanciero[]> {
  const ahora = Math.floor(Date.now() / 1000);
  const tipos = TIPOS_FINANZAS.map((t) => `${prefijo}${t}`).join(",");
  const r = await pedirJson<SerieYahoo>(
    "Yahoo Finance",
    `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(simbolo)}?symbol=${encodeURIComponent(simbolo)}&type=${tipos}&period1=${ahora - 6 * 365 * 86_400}&period2=${ahora}`,
    { headers: NAVEGADOR },
  );
  return interpretarFinanzas(r, prefijo);
}

// ---------------------------------------------------------------- gráficas por rango

export const RANGOS = {
  "1d": { yahoo: ["1d", "5m"], dias: "1" },
  "1s": { yahoo: ["5d", "30m"], dias: "7" },
  "1m": { yahoo: ["1mo", "1d"], dias: "30" },
  "6m": { yahoo: ["6mo", "1d"], dias: "180" },
  "1a": { yahoo: ["1y", "1d"], dias: "365" },
  "5a": { yahoo: ["5y", "1wk"], dias: "1825" },
  max: { yahoo: ["max", "1mo"], dias: "max" },
} as const;
export type Rango = keyof typeof RANGOS;
const RANGO = z.enum(Object.keys(RANGOS) as [Rango, ...Rango[]]).default("6m");

interface ChartYahoo {
  chart: { result: { timestamp?: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] | null };
}

export function serieDeChart(r: ChartYahoo): { t: number; v: number }[] {
  const d = r.chart.result?.[0];
  const cierres = d?.indicators.quote[0]?.close ?? [];
  return (d?.timestamp ?? []).flatMap((t, i) => (typeof cierres[i] === "number" ? [{ t: t * 1000, v: cierres[i]! }] : []));
}

// ---------------------------------------------------------------- CoinGecko

interface MonedaGecko {
  id: string;
  symbol: string;
  name: string;
  image?: { large?: string };
  market_cap_rank?: number | null;
  genesis_date?: string | null;
  categories?: string[];
  description?: { es?: string; en?: string };
  links?: { homepage?: string[]; blockchain_site?: string[] };
  market_data: Record<string, Record<string, number | string | null> | number | null>;
}

export function interpretarCripto(c: MonedaGecko, moneda: string) {
  const m = c.market_data;
  const en = (k: string) => {
    const v = m[k];
    return v && typeof v === "object" ? ((v[moneda] as number | null | undefined) ?? null) : null;
  };
  const n = (k: string) => (typeof m[k] === "number" ? (m[k] as number) : null);
  const fecha = (k: string) => {
    const v = m[k];
    return v && typeof v === "object" && typeof v[moneda] === "string" ? String(v[moneda]).slice(0, 10) : null;
  };
  const limpio = (t: string) => t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  return {
    id: c.id,
    nombre: c.name,
    simbolo: c.symbol.toUpperCase(),
    imagen: c.image?.large ?? null,
    rango: c.market_cap_rank ?? null,
    descripcion: limpio(c.description?.es || c.description?.en || "").slice(0, 1500) || null,
    sitio: c.links?.homepage?.find((u) => /^https:\/\//.test(u)) ?? null,
    categorias: (c.categories ?? []).filter(Boolean).slice(0, 5),
    inicio: c.genesis_date ?? null,
    estadisticas: {
      precio: en("current_price"),
      capitalizacion: en("market_cap"),
      valoracionTotal: en("fully_diluted_valuation"),
      volumen24h: en("total_volume"),
      maximo24h: en("high_24h"),
      minimo24h: en("low_24h"),
      maximoHistorico: en("ath"),
      fechaMaximo: fecha("ath_date"),
      desdeMaximo: en("ath_change_percentage"),
      minimoHistorico: en("atl"),
      fechaMinimo: fecha("atl_date"),
      cambio24h: n("price_change_percentage_24h"),
      cambio7d: n("price_change_percentage_7d"),
      cambio30d: n("price_change_percentage_30d"),
      cambio1a: n("price_change_percentage_1y"),
      circulante: n("circulating_supply"),
      total: n("total_supply"),
      maximo: n("max_supply"),
    },
  };
}

// ---------------------------------------------------------------- rutas

export function mercadosDetalleRoutes(_deps: ModuleDeps) {
  const acceso = (modulo: "cripto" | "inversiones") => ({ config: { acceso: { modulo, nivel: "lectura" as const } } });

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/inversiones/detalle/:simbolo", acceso("inversiones"), async (request) => {
      const simbolo = SIMBOLO.parse((request.params as { simbolo: string }).simbolo);
      return conCache(`detalle:${simbolo}`, 15 * 60_000, async () => {
        const errores: string[] = [];
        const resumen = await (async () => {
          const { cookie, crumb } = await sesionYahoo();
          const r = await pedirJson<ResumenYahoo>(
            "Yahoo Finance",
            `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(simbolo)}?modules=price,assetProfile,summaryDetail,defaultKeyStatistics,financialData,calendarEvents&crumb=${encodeURIComponent(crumb)}`,
            { headers: { ...NAVEGADOR, cookie } },
          );
          return interpretarResumenYahoo(r, simbolo);
        })().catch((err: unknown) => {
          sesion = null;
          errores.push(`Estadísticas: ${err instanceof Error ? err.message.slice(0, 120) : "sin datos"}`);
          return null;
        });
        const [anual, trimestral] = await Promise.all([
          finanzasYahoo(simbolo, "annual").catch(() => {
            errores.push("Estados financieros anuales no disponibles");
            return [] as PeriodoFinanciero[];
          }),
          finanzasYahoo(simbolo, "quarterly").catch(() => [] as PeriodoFinanciero[]),
        ]);
        return { simbolo, resumen, finanzas: { anual, trimestral }, errores };
      });
    });

    app.get("/api/inversiones/grafica/:simbolo", acceso("inversiones"), async (request) => {
      const simbolo = SIMBOLO.parse((request.params as { simbolo: string }).simbolo);
      const { rango } = z.object({ rango: RANGO }).parse(request.query);
      const [r, i] = RANGOS[rango].yahoo;
      const datos = await conCache(`grafica:${simbolo}:${rango}`, rango === "1d" ? 2 * 60_000 : 15 * 60_000, () =>
        pedirJson<ChartYahoo>("Yahoo Finance", `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(simbolo)}?range=${r}&interval=${i}`, { headers: NAVEGADOR }),
      );
      return { rango, serie: serieDeChart(datos) };
    });

    app.get("/api/inversiones/noticias/:simbolo", acceso("inversiones"), async (request) => {
      const simbolo = SIMBOLO.parse((request.params as { simbolo: string }).simbolo);
      const r = await conCache(`noticias-accion:${simbolo}`, 20 * 60_000, () =>
        pedirJson<{ news?: { title: string; publisher?: string; link: string; providerPublishTime?: number; thumbnail?: { resolutions?: { url: string }[] } }[] }>(
          "Yahoo Finance",
          `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(simbolo)}&quotesCount=0&newsCount=15&lang=es-MX&region=MX`,
          { headers: NAVEGADOR },
        ),
      );
      return (r.news ?? [])
        .filter((n) => /^https:\/\//.test(n.link))
        .map((n) => ({
          titulo: n.title,
          fuente: n.publisher ?? "",
          fecha: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null,
          url: n.link,
          imagen: n.thumbnail?.resolutions?.find((x) => /^https:\/\//.test(x.url))?.url ?? null,
        }));
    });

    // ---- cripto
    const idCripto = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,80}$/, "Moneda inválida");
    const monedaRef = z.enum(["mxn", "usd", "eur"]).default("mxn");

    app.get("/api/cripto/detalle/:id", acceso("cripto"), async (request) => {
      const id = idCripto.parse((request.params as { id: string }).id);
      const { moneda } = z.object({ moneda: monedaRef }).parse(request.query);
      const c = await conCache(`cripto-detalle:${id}`, 5 * 60_000, () =>
        pedirJson<MonedaGecko>("CoinGecko", `https://api.coingecko.com/api/v3/coins/${id}?localization=true&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`),
      );
      return interpretarCripto(c, moneda);
    });

    app.get("/api/cripto/grafica/:id", acceso("cripto"), async (request) => {
      const id = idCripto.parse((request.params as { id: string }).id);
      const { moneda, rango } = z.object({ moneda: monedaRef, rango: RANGO }).parse(request.query);
      const r = await conCache(`cripto-grafica:${id}:${moneda}:${rango}`, 10 * 60_000, () =>
        pedirJson<{ prices: [number, number][] }>("CoinGecko", `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=${moneda}&days=${RANGOS[rango].dias}`),
      );
      const puntos = r.prices.map(([t, v]) => ({ t, v }));
      // Como mucho ~400 puntos para que la gráfica sea ligera en el celular.
      const paso = Math.max(1, Math.ceil(puntos.length / 400));
      return { rango, serie: puntos.filter((_, i) => i % paso === 0 || i === puntos.length - 1) };
    });

    app.get("/api/cripto/noticias/:id", acceso("cripto"), async (request) => {
      const id = idCripto.parse((request.params as { id: string }).id);
      const { nombre } = z.object({ nombre: z.string().trim().max(60).default("") }).parse(request.query);
      const q = `${nombre || id} cripto`;
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=MX&ceid=MX:es-419`;
      return conCache(`cripto-noticias:${q}`, 20 * 60_000, async () => interpretarFeed(await descargarTextoSeguro(url, { maxBytes: 3_000_000 }), "Google Noticias").slice(0, 15));
    });
  };
}
