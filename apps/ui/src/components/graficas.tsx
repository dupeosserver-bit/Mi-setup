/**
 * Gráficas en vivo (Recharts). Ventana deslizante de 5 minutos solo en
 * memoria: no se guarda historial.
 */
import { LIVE_WINDOW_MS } from "@mi-setup/shared";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtBytes, fmtHora } from "../lib/formato";
import { useTema } from "../lib/tiempo-real";

export const COLORES = ["#E5E5EA", "#8E8E93", "#30D158", "#FFD60A", "#FF453A", "#636366", "#AEAEB2"];
const TOOLTIP = {
  contentStyle: { background: "#1c1c1e", border: "1px solid #3a3a3c", borderRadius: 12, fontSize: 12 },
  labelStyle: { color: "#8e8e93" },
  itemStyle: { color: "#f2f2f7" },
};

export type PuntoSerie = { t: number } & Record<string, number | undefined>;

/** Se suscribe a un tema y guarda los puntos de los últimos 5 minutos. */
export function useVentana(tema: string | null, mapear: (datos: unknown) => PuntoSerie | null): PuntoSerie[] {
  const [puntos, setPuntos] = useState<PuntoSerie[]>([]);
  useTema(tema, (datos) => {
    const p = mapear(datos);
    if (!p) return;
    setPuntos((prev) => {
      const limite = p.t - LIVE_WINDOW_MS;
      return [...prev.filter((x) => x.t >= limite), p].slice(-600);
    });
  });
  return puntos;
}

export interface Serie {
  clave: string;
  nombre: string;
  color?: string;
}

export function LineaEnVivo({
  datos,
  series,
  formato = (v) => String(Math.round(v)),
  dominio,
  altura = 160,
}: {
  datos: PuntoSerie[];
  series: Serie[];
  formato?: (v: number) => string;
  dominio?: [number, number];
  altura?: number;
}) {
  if (datos.length === 0) {
    return <div className="flex items-center justify-center text-xs text-tenue" style={{ height: altura }}>Esperando datos en vivo…</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <AreaChart data={datos} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#2c2c2e" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          domain={["dataMin", "dataMax"]}
          tickFormatter={fmtHora}
          stroke="#8e8e93"
          fontSize={10}
          minTickGap={48}
          tickLine={false}
        />
        <YAxis domain={dominio ?? ["auto", "auto"]} tickFormatter={formato} stroke="#8e8e93" fontSize={10} width={56} tickLine={false} />
        <Tooltip {...TOOLTIP} labelFormatter={(v) => fmtHora(Number(v))} formatter={(v) => formato(Number(v))} />
        {series.map((s, i) => (
          <Area
            key={s.clave}
            dataKey={s.clave}
            name={s.nombre}
            type="monotone"
            stroke={s.color ?? COLORES[i % COLORES.length]}
            fill={s.color ?? COLORES[i % COLORES.length]}
            fillOpacity={0.12}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function colorPorUso(pct: number): string {
  if (pct >= 90) return "#FF453A";
  if (pct >= 75) return "#FFD60A";
  return "#E5E5EA";
}

/** Anillo de uso (disco, batería, RAM). */
export function Anillo({
  valor,
  total,
  etiqueta,
  detalle,
  invertido = false,
}: {
  valor: number;
  total: number;
  etiqueta: string;
  detalle?: string;
  /** true cuando "más es mejor" (batería). */
  invertido?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, (valor / total) * 100) : 0;
  const color = invertido ? colorPorUso(100 - pct) : colorPorUso(pct);
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-28 w-28">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={[{ v: pct }, { v: 100 - pct }]}
              dataKey="v"
              innerRadius="72%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              <Cell fill={color} />
              <Cell fill="#2c2c2e" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold">{pct.toFixed(0)}%</div>
      </div>
      <p className="mt-2 text-sm font-medium">{etiqueta}</p>
      {detalle ? <p className="text-xs text-tenue">{detalle}</p> : null}
    </div>
  );
}

export function BarrasDiscos({ discos }: { discos: { nombre: string; usado: number; total: number }[] }) {
  if (discos.length === 0) return <p className="text-xs text-tenue">Sin datos de disco.</p>;
  return (
    <div className="space-y-3">
      {discos.map((d) => {
        const pct = d.total > 0 ? (d.usado / d.total) * 100 : 0;
        return (
          <div key={d.nombre}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="truncate">{d.nombre}</span>
              <span className="text-tenue">
                {fmtBytes(d.usado)} / {fmtBytes(d.total)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-tarjeta">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colorPorUso(pct) }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Barras agrupadas (p. ej. ingresos y gastos por mes). */
export function Barras({
  datos,
  clave,
  series,
  formato = (v) => String(v),
  altura = 220,
}: {
  datos: Record<string, string | number>[];
  clave: string;
  series: Serie[];
  formato?: (v: number) => string;
  altura?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={datos} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#2c2c2e" vertical={false} />
        <XAxis dataKey={clave} stroke="#8e8e93" fontSize={10} tickLine={false} />
        <YAxis tickFormatter={formato} stroke="#8e8e93" fontSize={10} width={64} tickLine={false} />
        <Tooltip {...TOOLTIP} formatter={(v) => formato(Number(v))} cursor={{ fill: "#2c2c2e" }} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#8e8e93" }} />
        {series.map((s, i) => (
          <Bar key={s.clave} dataKey={s.clave} name={s.nombre} fill={s.color ?? COLORES[i % COLORES.length]} radius={[6, 6, 0, 0]} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Anillo por categorías. */
export function Dona({
  datos,
  formato = (v) => String(v),
  altura = 220,
}: {
  datos: { nombre: string; valor: number }[];
  formato?: (v: number) => string;
  altura?: number;
}) {
  if (datos.length === 0) return <p className="py-8 text-center text-xs text-tenue">Sin datos.</p>;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <PieChart>
        <Pie data={datos} dataKey="valor" nameKey="nombre" innerRadius="55%" outerRadius="85%" stroke="#1c1c1e" isAnimationActive={false}>
          {datos.map((_, i) => (
            <Cell key={i} fill={COLORES[i % COLORES.length]} />
          ))}
        </Pie>
        <Tooltip {...TOOLTIP} formatter={(v) => formato(Number(v))} />
        <Legend wrapperStyle={{ fontSize: 12, color: "#8e8e93" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
