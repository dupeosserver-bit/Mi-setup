/** Gráfica pequeña de tendencia (sin ejes): verde si sube, roja si baja. */
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";

export function MiniGrafica({ serie, alto = 40 }: { serie: number[]; alto?: number }) {
  if (serie.length < 2) return <div style={{ height: alto }} />;
  const sube = (serie.at(-1) ?? 0) >= (serie[0] ?? 0);
  return (
    <div style={{ height: alto }} className="w-full">
      <ResponsiveContainer>
        <LineChart data={serie.map((v, i) => ({ i, v }))}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Line type="monotone" dataKey="v" stroke={sube ? "var(--ok)" : "var(--error)"} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Porcentaje con signo y color. */
export function Cambio({ valor, etiqueta }: { valor: number | null | undefined; etiqueta?: string }) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return <span className="text-xs text-tenue">—</span>;
  return (
    <span className={valor >= 0 ? "text-ok" : "text-peligro"}>
      {valor >= 0 ? "▲" : "▼"} {Math.abs(valor).toFixed(2)}%{etiqueta ? <span className="ml-1 text-xs text-tenue">{etiqueta}</span> : null}
    </span>
  );
}
