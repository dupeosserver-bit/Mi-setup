import { SquareTerminal, type LucideIcon } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useServidores } from "../../lib/vps";
import { cx } from "../ui";

export const SUAVE = {
  acento: "bg-[color-mix(in_srgb,var(--acento)_14%,transparent)] text-acento",
  ok: "bg-[color-mix(in_srgb,var(--ok)_14%,transparent)] text-ok",
  aviso: "bg-[color-mix(in_srgb,var(--aviso)_14%,transparent)] text-aviso",
  peligro: "bg-[color-mix(in_srgb,var(--error)_14%,transparent)] text-peligro",
  neutro: "bg-tarjeta text-tenue",
} as const;

export type TonoSuave = keyof typeof SUAVE;

export function Chispa({ valores, color = "var(--acento)", maximo, alto = 36 }: { valores: number[]; color?: string; maximo?: number; alto?: number }) {
  if (valores.length < 2) return <div style={{ height: alto }} />;
  const tope = maximo ?? Math.max(...valores, 1);
  const ancho = 120;
  const puntos = valores.map((v, i) => `${(i / (valores.length - 1)) * ancho},${alto - 2 - (Math.min(v, tope) / tope) * (alto - 6)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" className="block w-full" style={{ height: alto }} aria-hidden="true">
      <polygon points={`0,${alto} ${puntos} ${ancho},${alto}`} fill={color} opacity="0.16" />
      <polyline points={puntos} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function Cuadro({
  icono: Icono,
  titulo,
  valor,
  detalle,
  pie,
  tono = "acento",
  className,
}: {
  icono: LucideIcon;
  titulo: string;
  valor: ReactNode;
  detalle?: ReactNode;
  pie?: ReactNode;
  tono?: TonoSuave;
  className?: string;
}) {
  return (
    <section className={cx("flex min-w-0 flex-col overflow-hidden rounded-tarjeta border border-borde bg-superficie", className)}>
      <div className="p-4 pb-2">
        <p className="flex items-center gap-2 text-xs font-medium text-tenue">
          <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-lg", SUAVE[tono])}>
            <Icono className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">{titulo}</span>
        </p>
        <p className="mt-2 truncate text-2xl font-bold tabular-nums">{valor}</p>
        {detalle ? <p className="mt-0.5 truncate text-xs text-tenue">{detalle}</p> : null}
      </div>
      {pie ? <div className="mt-auto">{pie}</div> : null}
    </section>
  );
}

export function PildorasServidor({ valor, alCambiar }: { valor: string | null; alCambiar: (id: string) => void }) {
  const { data } = useServidores();
  useEffect(() => {
    if (!valor && data?.[0]) alCambiar(data[0].id);
  }, [valor, data, alCambiar]);
  if (!data?.length) return null;
  return (
    <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-borde bg-superficie p-1" role="tablist" aria-label="Servidor">
      {data.map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={valor === s.id}
          onClick={() => alCambiar(s.id)}
          title={`${s.usuario}@${s.host}`}
          className={cx(
            "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
            valor === s.id ? "bg-tarjeta text-texto" : "text-tenue hover:text-texto",
          )}
        >
          <span className={cx("h-2 w-2 rounded-full", s.estado === "arriba" ? "bg-ok" : s.estado === "caido" ? "bg-peligro" : "bg-aviso")} />
          {s.nombre}
        </button>
      ))}
    </div>
  );
}

export function BotonTerminal({ servidor, carpeta, texto = "Abrir terminal" }: { servidor: string | null; carpeta?: string; texto?: string }) {
  if (!servidor) return null;
  const q = new URLSearchParams({ servidor });
  if (carpeta) q.set("cd", carpeta);
  return (
    <Link
      to={`/vps/terminal?${q.toString()}`}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-borde bg-superficie px-3 text-sm font-medium transition-colors hover:bg-tarjeta"
    >
      <SquareTerminal className="h-4 w-4" />
      {texto}
    </Link>
  );
}

export function EnVivo({ texto }: { texto: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ok opacity-60 motion-reduce:hidden" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-ok" />
      </span>
      {texto}
    </span>
  );
}

export function Leyenda({ series }: { series: { nombre: string; color: string }[] }) {
  return (
    <div className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tenue">
      {series.map((s) => (
        <span key={s.nombre} className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
          {s.nombre}
        </span>
      ))}
    </div>
  );
}
