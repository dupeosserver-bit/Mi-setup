/**
 * Ficha completa de una acción o una cripto (estilo app de bolsa): gráfica por
 * rango, estadísticas clave, finanzas (ingresos, balance y flujo), noticias y
 * botones a sitios confiables para invertir. Mi Setup no compra ni vende.
 */
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { haceCuanto } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";
import { Boton, Cargando, ErrorCaja, Insignia, Modal, Pestanas, Vacio, cx } from "./ui";
import { localeActual } from "../lib/idioma";

// Mismo orden de colores en todas las gráficas (validado para daltonismo).
const C1 = "#3987e5";
const C2 = "#d95926";
const C3 = "#199e70";
const tooltip = { background: "var(--superficie, #1e1e1e)", border: "1px solid var(--borde, #333)", borderRadius: 12, fontSize: 12 };

type Rango = "1d" | "1s" | "1m" | "6m" | "1a" | "5a" | "max";
const RANGOS: { id: Rango; texto: string }[] = [
  { id: "1d", texto: "1 d" },
  { id: "1s", texto: "1 s" },
  { id: "1m", texto: "1 m" },
  { id: "6m", texto: "6 m" },
  { id: "1a", texto: "1 a" },
  { id: "5a", texto: "5 a" },
  { id: "max", texto: "Todo" },
];

/** Sitios confiables para invertir de verdad (fuera de Mi Setup). */
export const SITIOS_ACCIONES = [
  { nombre: "GBM", url: "https://gbm.com/" },
  { nombre: "Bursanet", url: "https://www.bursanet.mx/" },
  { nombre: "Hapi", url: "https://www.hapi.trade/es" },
  { nombre: "Interactive Brokers", url: "https://www.interactivebrokers.com/es/" },
  { nombre: "CETES Directo", url: "https://www.cetesdirecto.com/" },
];
export const SITIOS_CRIPTO = [
  { nombre: "Bitso", url: "https://bitso.com/mx" },
  { nombre: "Binance", url: "https://www.binance.com/es-MX" },
  { nombre: "Coinbase", url: "https://www.coinbase.com/es" },
  { nombre: "Kraken", url: "https://www.kraken.com/es" },
];

const compacto = (n: number | null | undefined, moneda?: string | null) =>
  n === null || n === undefined ? "—" : `${moneda === "USD" ? "US$" : moneda === "MXN" ? "$" : ""}${n.toLocaleString(localeActual(), { notation: "compact", maximumFractionDigits: 2 })}${moneda && !["USD", "MXN"].includes(moneda) ? ` ${moneda}` : ""}`;
const numero = (n: number | null | undefined, d = 2) => (n === null || n === undefined ? "—" : n.toLocaleString(localeActual(), { maximumFractionDigits: d }));
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : `${n.toLocaleString(localeActual(), { maximumFractionDigits: 2 })} %`);
const fecha = (f: string | null) => (f ? new Date(`${f.slice(0, 10)}T12:00:00`).toLocaleDateString(localeActual(), { day: "numeric", month: "short", year: "numeric" }) : "—");

function Dato({ texto, valor, ayuda }: { texto: string; valor: ReactNode; ayuda?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-borde py-2 text-sm last:border-0" title={ayuda}>
      <span className="text-tenue">{texto}</span>
      <span className="text-right font-medium">{valor}</span>
    </div>
  );
}

function Seccion({ titulo, children, accion }: { titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="rounded-tarjeta border border-borde bg-fondo/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{titulo}</h3>
        {accion}
      </div>
      {children}
    </section>
  );
}

/** Gráfica del precio con botones de rango (1 día … todo). */
function GraficaPrecio({ url, moneda }: { url: (r: Rango) => string; moneda: string | null }) {
  const [rango, setRango] = useState<Rango>("6m");
  const q = useQuery({ queryKey: ["mercado-grafica", url(rango)], queryFn: () => api<{ serie: { t: number; v: number }[] }>(url(rango)) });
  const serie = q.data?.serie ?? [];
  const primero = serie[0]?.v ?? 0;
  const ultimo = serie.at(-1)?.v ?? 0;
  const cambio = primero ? ((ultimo - primero) / primero) * 100 : null;
  const corto = rango === "1d" || rango === "1s";
  return (
    <div>
      {cambio !== null ? (
        <p className={cx("text-sm", cambio >= 0 ? "text-ok" : "text-peligro")}>
          {cambio >= 0 ? "▲" : "▼"} {Math.abs(cambio).toFixed(2)} % en {RANGOS.find((r) => r.id === rango)!.texto}
        </p>
      ) : null}
      <div className="mt-2 h-56 w-full">
        {q.isLoading ? <Cargando /> : null}
        <ErrorCaja error={q.error} />
        {serie.length ? (
          <ResponsiveContainer>
            <AreaChart data={serie}>
              <defs>
                <linearGradient id="relleno-precio" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C1} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                minTickGap={30}
                tickFormatter={(t: number) => new Date(t).toLocaleDateString(localeActual(), corto ? { weekday: "short", hour: "2-digit" } : { month: "short", year: "2-digit" })}
              />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} width={56} tickLine={false} axisLine={false} tickFormatter={(v: number) => numero(v, 2)} orientation="right" />
              <Tooltip
                contentStyle={tooltip}
                labelFormatter={(t: number) => new Date(t).toLocaleString(localeActual(), { dateStyle: "medium", ...(corto ? { timeStyle: "short" } : {}) })}
                formatter={(v: number) => [`${numero(v, 4)} ${moneda ?? ""}`, "Precio"]}
              />
              <Area type="monotone" dataKey="v" stroke={C1} strokeWidth={2} fill="url(#relleno-precio)" dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap justify-center gap-1">
        {RANGOS.map((r) => (
          <button key={r.id} type="button" onClick={() => setRango(r.id)} className={cx("rounded-full px-3 py-1 text-xs", rango === r.id ? "bg-tarjeta font-semibold text-texto" : "text-tenue hover:text-texto")}>
            {r.texto}
          </button>
        ))}
      </div>
    </div>
  );
}

function Noticias({ url }: { url: string }) {
  const q = useQuery({ queryKey: ["mercado-noticias", url], queryFn: () => api<{ titulo: string; fuente: string; fecha: string | null; url: string; imagen: string | null }[]>(url) });
  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCaja error={q.error} />;
  if (!q.data?.length) return <Vacio texto="No hay noticias recientes." />;
  return (
    <div className="space-y-2">
      {q.data.map((n, i) => (
        <button key={`${n.url}-${i}`} type="button" onClick={() => abrirExterno(n.url)} className="flex w-full gap-3 rounded-xl border border-borde bg-superficie p-3 text-left hover:bg-tarjeta">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-3 text-sm font-medium">{n.titulo}</p>
            <p className="mt-1 text-xs text-tenue">
              {n.fecha ? haceCuanto(n.fecha) : ""}
              {n.fuente ? ` · ${n.fuente}` : ""}
            </p>
          </div>
          {n.imagen ? <img src={n.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-lg object-cover" /> : null}
        </button>
      ))}
    </div>
  );
}

function SitiosConfiables({ sitios, texto }: { sitios: { nombre: string; url: string }[]; texto: string }) {
  return (
    <section className="rounded-tarjeta border border-borde p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <ShieldCheck className="h-4 w-4 text-ok" /> {texto}
      </p>
      <p className="mt-1 text-xs text-tenue">Por seguridad Mi Setup no compra ni vende. Abre la app o el sitio oficial (revisa que la dirección sea la correcta):</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {sitios.map((s) => (
          <Boton key={s.nombre} tamano="sm" icono={ExternalLink} onClick={() => abrirExterno(s.url)}>
            {s.nombre}
          </Boton>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- acciones

interface Periodo {
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
interface DetalleAccion {
  simbolo: string;
  resumen: {
    nombre: string;
    moneda: string | null;
    precio: number | null;
    perfil: { sector: string | null; industria: string | null; descripcion: string | null; sitio: string | null; empleados: number | null; pais: string | null };
    estadisticas: Record<string, number | string | boolean | null>;
    proximoReporte: string | null;
  } | null;
  finanzas: { anual: Periodo[]; trimestral: Periodo[] };
  errores: string[];
}

const RECOMENDACION: Record<string, string> = { strong_buy: "Compra fuerte", buy: "Compra", hold: "Mantener", sell: "Venta", strong_sell: "Venta fuerte", underperform: "Por debajo del mercado", none: "—" };

function GraficaFinanzas({ datos, series, etiqueta }: { datos: Periodo[]; series: { clave: keyof Periodo; nombre: string; color: string }[]; etiqueta: (f: string) => string }) {
  const filas = datos.filter((d) => series.some((s) => typeof d[s.clave] === "number")).map((d) => ({ ...d, etiqueta: etiqueta(d.fecha) }));
  if (!filas.length) return <p className="text-sm text-tenue">Sin datos.</p>;
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <BarChart data={filas} barGap={2}>
          <CartesianGrid strokeOpacity={0.12} vertical={false} />
          <XAxis dataKey="etiqueta" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10 }} width={52} tickLine={false} axisLine={false} tickFormatter={(v: number) => compacto(v)} />
          <Tooltip contentStyle={tooltip} formatter={(v: number) => compacto(v)} cursor={{ fill: "rgba(127,127,127,0.12)" }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s) => (
            <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function FinanzasAccion({ d, moneda }: { d: DetalleAccion["finanzas"]; moneda: string | null }) {
  const [vista, setVista] = useState<"anual" | "trimestral">("anual");
  const datos = (vista === "anual" ? d.anual : d.trimestral).slice(-8);
  const etiqueta = (f: string) => (vista === "anual" ? f.slice(0, 4) : `${f.slice(2, 4)}-${f.slice(5, 7)}`);
  const ultimo = [...datos].reverse().find((x) => x.ingresos !== undefined);
  const balance = [...datos].reverse().find((x) => x.activos !== undefined);
  const flujo = [...datos].reverse().find((x) => x.flujoLibre !== undefined);
  if (!d.anual.length && !d.trimestral.length) return <Vacio texto="No hay estados financieros para este símbolo (los índices y ETF no tienen)." />;
  return (
    <div className="space-y-3">
      <Pestanas valor={vista} alCambiar={setVista} opciones={[{ id: "anual", texto: "Anual" }, { id: "trimestral", texto: "Trimestral" }]} />
      <Seccion titulo="Estado de ingresos">
        {ultimo?.ingresos && ultimo.ingresoNeto !== undefined ? <p className="mb-2 text-sm">Margen de beneficio: <b>{pct((ultimo.ingresoNeto / ultimo.ingresos) * 100)}</b></p> : null}
        <GraficaFinanzas datos={datos} etiqueta={etiqueta} series={[{ clave: "ingresos", nombre: "Ingresos", color: C1 }, { clave: "ingresoNeto", nombre: "Ingreso neto", color: C2 }]} />
        {ultimo ? <p className="mt-1 text-xs text-tenue">Último: ingresos {compacto(ultimo.ingresos, moneda)} · neto {compacto(ultimo.ingresoNeto, moneda)}</p> : null}
      </Seccion>
      <Seccion titulo="Balance general">
        {balance?.activos && balance.pasivos !== undefined ? <p className="mb-2 text-sm">Deuda en activos: <b>{pct((balance.pasivos / balance.activos) * 100)}</b></p> : null}
        <GraficaFinanzas datos={datos} etiqueta={etiqueta} series={[{ clave: "activos", nombre: "Activos totales", color: C1 }, { clave: "pasivos", nombre: "Pasivos totales", color: C2 }]} />
      </Seccion>
      <Seccion titulo="Flujo de efectivo">
        {flujo ? <p className="mb-2 text-sm">Flujo libre: <b>{compacto(flujo.flujoLibre, moneda)}</b></p> : null}
        <GraficaFinanzas
          datos={datos}
          etiqueta={etiqueta}
          series={[
            { clave: "flujoOperativo", nombre: "Operaciones", color: C1 },
            { clave: "flujoInversion", nombre: "Inversiones", color: C2 },
            { clave: "flujoFinanciamiento", nombre: "Financiamiento", color: C3 },
          ]}
        />
      </Seccion>
      <p className="text-xs text-tenue">Datos de Yahoo Finance. El rendimiento pasado no garantiza resultados futuros.</p>
    </div>
  );
}

export function FichaAccion({ simbolo, alCerrar }: { simbolo: string; alCerrar: () => void }) {
  const [pestana, setPestana] = useState<"descripcion" | "finanzas" | "noticias">("descripcion");
  const q = useQuery({ queryKey: ["inversiones", "detalle", simbolo], queryFn: () => api<DetalleAccion>(`/api/inversiones/detalle/${encodeURIComponent(simbolo)}`) });
  const r = q.data?.resumen;
  const e = r?.estadisticas;
  const moneda = r?.moneda ?? null;
  return (
    <Modal abierto titulo={`${simbolo}${r ? ` · ${r.nombre}` : ""}`} alCerrar={alCerrar} ancho="sm:max-w-3xl">
      <div className="space-y-4">
        {r?.precio !== undefined && r?.precio !== null ? (
          <p className="text-3xl font-bold">
            {numero(r.precio, 2)} <span className="text-base font-normal text-tenue">{moneda}</span>
          </p>
        ) : null}
        <Pestanas
          valor={pestana}
          alCambiar={setPestana}
          opciones={[
            { id: "descripcion", texto: "Descripción" },
            { id: "finanzas", texto: "Finanzas" },
            { id: "noticias", texto: "Noticias" },
          ]}
        />
        {q.isLoading ? <Cargando /> : null}
        <ErrorCaja error={q.error} />
        {pestana === "descripcion" ? (
          <>
            <GraficaPrecio moneda={moneda} url={(rango) => `/api/inversiones/grafica/${encodeURIComponent(simbolo)}?rango=${rango}`} />
            {e ? (
              <Seccion titulo="Estadísticas clave">
                <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  <Dato texto="Capitalización" valor={compacto(e.capitalizacion as number, moneda)} />
                  <Dato texto="Precio / beneficio (P/E)" valor={numero(e.pe as number)} ayuda="Cuántas veces sus ganancias de un año vale la acción" />
                  <Dato texto="P/E estimado" valor={numero(e.peFuturo as number)} />
                  <Dato texto="Ganancia por acción (EPS)" valor={numero(e.eps as number)} />
                  <Dato texto="¿Paga dividendos?" valor={e.pagaDividendos ? <Insignia tono="ok">Sí</Insignia> : <Insignia>No</Insignia>} />
                  <Dato texto="Dividendo al año" valor={e.dividendoAnual ? `${numero(e.dividendoAnual as number)} ${moneda ?? ""}` : "—"} />
                  <Dato texto="Rendimiento del dividendo" valor={pct(e.rendimientoDividendo as number)} />
                  <Dato texto="Fecha ex-dividendo" valor={fecha(e.fechaExDividendo as string | null)} />
                  <Dato texto="Margen de beneficio" valor={pct(e.margenBeneficio as number)} />
                  <Dato texto="Rentabilidad (ROE)" valor={pct(e.roe as number)} ayuda="Ganancia contra el dinero de los accionistas" />
                  <Dato texto="Máximo 52 semanas" valor={numero(e.maximo52 as number)} />
                  <Dato texto="Mínimo 52 semanas" valor={numero(e.minimo52 as number)} />
                  <Dato texto="Máximo / mínimo del día" valor={`${numero(e.maximoDia as number)} / ${numero(e.minimoDia as number)}`} />
                  <Dato texto="Volumen" valor={compacto(e.volumen as number)} />
                  <Dato texto="Beta (qué tanto se mueve)" valor={numero(e.beta as number)} />
                  <Dato texto="Deuda / capital" valor={numero(e.deudaCapital as number)} />
                  <Dato texto="Opinión de analistas" valor={RECOMENDACION[String(e.recomendacion ?? "none")] ?? "—"} />
                  <Dato texto="Próximo reporte" valor={fecha(r?.proximoReporte ?? null)} />
                </div>
              </Seccion>
            ) : null}
            {r?.perfil.descripcion ? (
              <Seccion titulo={`Acerca de ${r.nombre}`}>
                <p className="text-sm leading-relaxed text-tenue">{r.perfil.descripcion}</p>
                <p className="mt-2 text-xs text-tenue">
                  {[r.perfil.sector, r.perfil.industria, r.perfil.pais, r.perfil.empleados ? `${r.perfil.empleados.toLocaleString(localeActual())} empleados` : null].filter(Boolean).join(" · ")}
                </p>
              </Seccion>
            ) : null}
            {q.data?.errores.length ? <p className="text-xs text-aviso">No todo se pudo cargar: {q.data.errores.join(" · ")}</p> : null}
          </>
        ) : null}
        {pestana === "finanzas" && q.data ? <FinanzasAccion d={q.data.finanzas} moneda={moneda} /> : null}
        {pestana === "noticias" ? <Noticias url={`/api/inversiones/noticias/${encodeURIComponent(simbolo)}`} /> : null}
        <SitiosConfiables sitios={SITIOS_ACCIONES} texto="Invertir en un sitio confiable" />
        <p className="text-xs text-tenue">Solo informativo, no es asesoría financiera. Datos con retraso.</p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- cripto

interface DetalleCripto {
  id: string;
  nombre: string;
  simbolo: string;
  imagen: string | null;
  rango: number | null;
  descripcion: string | null;
  sitio: string | null;
  categorias: string[];
  inicio: string | null;
  estadisticas: Record<string, number | string | null>;
}

export function FichaCripto({ id, moneda, alCerrar }: { id: string; moneda: "mxn" | "usd" | "eur"; alCerrar: () => void }) {
  const [pestana, setPestana] = useState<"descripcion" | "noticias">("descripcion");
  const q = useQuery({ queryKey: ["cripto", "detalle", id, moneda], queryFn: () => api<DetalleCripto>(`/api/cripto/detalle/${id}?moneda=${moneda}`) });
  const c = q.data;
  const e = c?.estadisticas;
  const M = moneda.toUpperCase();
  const dinero = (n: unknown) => (typeof n === "number" ? n.toLocaleString(localeActual(), { style: "currency", currency: M, maximumFractionDigits: n < 1 ? 6 : 2 }) : "—");
  return (
    <Modal abierto titulo={c ? `${c.nombre} (${c.simbolo})` : id} alCerrar={alCerrar} ancho="sm:max-w-3xl">
      <div className="space-y-4">
        {c ? (
          <div className="flex items-center gap-3">
            {c.imagen ? <img src={c.imagen} alt="" className="h-10 w-10 rounded-full" referrerPolicy="no-referrer" /> : null}
            <div>
              <p className="text-3xl font-bold">{dinero(e?.precio)}</p>
              <p className="text-xs text-tenue">{c.rango ? `#${c.rango} por capitalización` : ""}</p>
            </div>
          </div>
        ) : null}
        <Pestanas
          valor={pestana}
          alCambiar={setPestana}
          opciones={[
            { id: "descripcion", texto: "Descripción" },
            { id: "noticias", texto: "Noticias" },
          ]}
        />
        {q.isLoading ? <Cargando /> : null}
        <ErrorCaja error={q.error} />
        {pestana === "descripcion" ? (
          <>
            <GraficaPrecio moneda={M} url={(rango) => `/api/cripto/grafica/${id}?moneda=${moneda}&rango=${rango}`} />
            {e ? (
              <>
                <Seccion titulo="Estadísticas">
                  <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                    <Dato texto="Capitalización" valor={compacto(e.capitalizacion as number, M)} />
                    <Dato texto="Valor si existieran todas" valor={compacto(e.valoracionTotal as number, M)} />
                    <Dato texto="Volumen 24 h" valor={compacto(e.volumen24h as number, M)} />
                    <Dato texto="Máximo / mínimo 24 h" valor={`${dinero(e.maximo24h)} / ${dinero(e.minimo24h)}`} />
                    <Dato texto="Cambio 24 h" valor={pct(e.cambio24h as number)} />
                    <Dato texto="Cambio 7 días" valor={pct(e.cambio7d as number)} />
                    <Dato texto="Cambio 30 días" valor={pct(e.cambio30d as number)} />
                    <Dato texto="Cambio 1 año" valor={pct(e.cambio1a as number)} />
                    <Dato texto="Máximo histórico" valor={`${dinero(e.maximoHistorico)} (${fecha(e.fechaMaximo as string | null)})`} />
                    <Dato texto="Lejos de su máximo" valor={pct(e.desdeMaximo as number)} />
                    <Dato texto="Mínimo histórico" valor={`${dinero(e.minimoHistorico)} (${fecha(e.fechaMinimo as string | null)})`} />
                    <Dato texto="En circulación" valor={compacto(e.circulante as number)} />
                    <Dato texto="Oferta total" valor={compacto(e.total as number)} />
                    <Dato texto="Oferta máxima" valor={e.maximo ? compacto(e.maximo as number) : "Sin límite"} />
                  </div>
                </Seccion>
                {/* Oferta en circulación contra la máxima: qué tanto falta por crearse. */}
                {typeof e.circulante === "number" && typeof e.maximo === "number" && e.maximo > 0 ? (
                  <Seccion titulo="Cuánto ya existe">
                    <div className="h-3 overflow-hidden rounded-full bg-tarjeta">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (e.circulante / e.maximo) * 100)}%`, background: C1 }} />
                    </div>
                    <p className="mt-1 text-xs text-tenue">{pct((e.circulante / e.maximo) * 100)} de la oferta máxima ya circula.</p>
                  </Seccion>
                ) : null}
              </>
            ) : null}
            {c?.descripcion ? (
              <Seccion titulo={`Acerca de ${c.nombre}`}>
                <p className="text-sm leading-relaxed text-tenue">{c.descripcion}</p>
                {c.categorias.length ? <p className="mt-2 text-xs text-tenue">{c.categorias.join(" · ")}</p> : null}
              </Seccion>
            ) : null}
          </>
        ) : null}
        {pestana === "noticias" ? <Noticias url={`/api/cripto/noticias/${id}?nombre=${encodeURIComponent(c?.nombre ?? id)}`} /> : null}
        <SitiosConfiables sitios={SITIOS_CRIPTO} texto="Wallet y compra en sitios confiables" />
        <p className="text-xs text-tenue">Datos de CoinGecko. Las cripto suben y bajan mucho: invierte solo lo que puedas perder. No es asesoría financiera.</p>
      </div>
    </Modal>
  );
}
