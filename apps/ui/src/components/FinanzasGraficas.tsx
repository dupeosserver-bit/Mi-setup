/**
 * Mis finanzas → Resumen: gastos de la semana (lunes a domingo, columnas) y
 * gastos e ingresos en el tiempo (línea). Colores validados para daltonismo:
 * ingresos azul, gastos naranja, ahorro aqua (mismo orden en ambas gráficas).
 */
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { Boton, Cargando, ErrorCaja, Pestanas, Tarjeta } from "./ui";
import { localeActual } from "../lib/idioma";

export const COLOR_INGRESOS = "#3987e5";
export const COLOR_GASTOS = "#d95926";
export const COLOR_AHORRO = "#199e70";

const dinero = (n: number) => `$${n.toLocaleString(localeActual(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const corto = (n: number) => (Math.abs(n) >= 1000 ? `$${(n / 1000).toLocaleString(localeActual(), { maximumFractionDigits: 1 })}k` : `$${Math.round(n)}`);
const estiloTooltip = { background: "var(--superficie, #1e1e1e)", border: "1px solid var(--borde, #333)", borderRadius: 12, fontSize: 12 };
const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString(localeActual(), { day: "numeric", month: "short" });

interface Semana {
  desde: string;
  hasta: string;
  dias: { fecha: string; dia: string; gastos: number; ingresos: number }[];
  gastos: number;
  ingresos: number;
  promedio: number;
  diaMayor: { fecha: string; dia: string; gastos: number } | null;
}

function moverSemana(fecha: string, semanas: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  return new Date(d.getTime() + semanas * 7 * 86_400_000).toISOString().slice(0, 10);
}

export function GastosSemana() {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const q = useQuery({ queryKey: ["finanzas-personales", "semana", fecha], queryFn: () => api<Semana>(`/api/finanzas-personales/semana?fecha=${fecha}`) });
  const s = q.data;
  const esEstaSemana = s ? new Date().toISOString().slice(0, 10) <= s.hasta : true;
  return (
    <Tarjeta
      titulo="Gastos de la semana"
      icono={CalendarDays}
      acciones={
        <div className="flex items-center gap-1">
          <Boton tamano="icono" variante="fantasma" icono={ChevronLeft} aria-label="Semana anterior" onClick={() => setFecha(moverSemana(fecha, -1))} />
          <span className="text-xs text-tenue">{s ? `${fechaCorta(s.desde)} – ${fechaCorta(s.hasta)}` : ""}</span>
          <Boton tamano="icono" variante="fantasma" icono={ChevronRight} aria-label="Semana siguiente" disabled={esEstaSemana} onClick={() => setFecha(moverSemana(fecha, 1))} />
        </div>
      }
    >
      {q.isLoading ? <Cargando /> : null}
      <ErrorCaja error={q.error} />
      {s ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Dato texto="Gastaste" valor={dinero(s.gastos)} />
            <Dato texto="Promedio por día" valor={dinero(s.promedio)} />
            <Dato texto="Día que más" valor={s.diaMayor ? `${s.diaMayor.dia} · ${dinero(s.diaMayor.gastos)}` : "—"} />
            <Dato texto="Entró" valor={dinero(s.ingresos)} />
          </div>
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <BarChart data={s.dias} barCategoryGap="25%">
                <CartesianGrid strokeOpacity={0.12} vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={corto} tickLine={false} axisLine={false} />
                <Tooltip
                  cursor={{ fill: "rgba(127,127,127,0.12)" }}
                  formatter={(v: number) => dinero(v)}
                  labelFormatter={(_, p) => (p?.[0] ? fechaCorta((p[0].payload as { fecha: string }).fecha) : "")}
                  contentStyle={estiloTooltip}
                />
                <Bar dataKey="gastos" name="Gastos" fill={COLOR_GASTOS} radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* Lo mismo en tabla, para leerlo sin la gráfica */}
          <details className="mt-2 text-xs text-tenue">
            <summary className="cursor-pointer">Ver como tabla</summary>
            <table className="mt-2 w-full">
              <tbody>
                {s.dias.map((d) => (
                  <tr key={d.fecha} className="border-t border-borde">
                    <td className="py-1">
                      {d.dia} {fechaCorta(d.fecha)}
                    </td>
                    <td className="text-right text-texto">{dinero(d.gastos)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      ) : null}
    </Tarjeta>
  );
}

function Dato({ texto, valor }: { texto: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-fondo px-3 py-2">
      <p className="text-[11px] text-tenue">{texto}</p>
      <p className="truncate font-semibold">{valor}</p>
    </div>
  );
}

type Periodo = "30d" | "90d" | "12m";
interface Tendencia {
  periodo: Periodo;
  puntos: { clave: string; gastos: number; ingresos: number; ahorro: number }[];
}

const etiqueta = (clave: string, periodo: Periodo) =>
  periodo === "12m" ? new Date(`${clave}-15T12:00:00`).toLocaleDateString(localeActual(), { month: "short" }) : fechaCorta(clave);

export function TendenciaFinanzas() {
  const [periodo, setPeriodo] = useState<Periodo>("12m");
  const [ver, setVer] = useState<"movimientos" | "ahorro">("movimientos");
  const q = useQuery({ queryKey: ["finanzas-personales", "tendencia", periodo], queryFn: () => api<Tendencia>(`/api/finanzas-personales/tendencia?periodo=${periodo}`) });
  const datos = (q.data?.puntos ?? []).map((p) => ({ ...p, etiqueta: etiqueta(p.clave, periodo) }));
  return (
    <Tarjeta titulo="Gastos e ingresos en el tiempo" icono={TrendingUp}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Pestanas
          valor={periodo}
          alCambiar={setPeriodo}
          opciones={[
            { id: "30d", texto: "30 días" },
            { id: "90d", texto: "3 meses" },
            { id: "12m", texto: "12 meses" },
          ]}
        />
        <Pestanas
          valor={ver}
          alCambiar={setVer}
          opciones={[
            { id: "movimientos", texto: "Gastos e ingresos" },
            { id: "ahorro", texto: "Ahorro acumulado" },
          ]}
        />
      </div>
      {q.isLoading ? <Cargando /> : null}
      <ErrorCaja error={q.error} />
      {datos.length ? (
        <div className="h-64 w-full">
          <ResponsiveContainer>
            <LineChart data={datos}>
              <CartesianGrid strokeOpacity={0.12} vertical={false} />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={corto} tickLine={false} axisLine={false} />
              <Tooltip formatter={(v: number) => dinero(v)} contentStyle={estiloTooltip} cursor={{ stroke: "rgba(127,127,127,0.5)" }} />
              <Legend />
              {ver === "movimientos" ? (
                <>
                  <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke={COLOR_INGRESOS} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="gastos" name="Gastos" stroke={COLOR_GASTOS} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                </>
              ) : (
                <Line type="monotone" dataKey="ahorro" name="Ahorro acumulado" stroke={COLOR_AHORRO} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-tenue">
        {periodo === "30d" ? "Cada punto es un día." : periodo === "90d" ? "Cada punto es una semana (de lunes a domingo)." : "Cada punto es un mes."} El ahorro acumulado es lo que entró menos lo que salió desde el inicio del periodo.
      </p>
    </Tarjeta>
  );
}
