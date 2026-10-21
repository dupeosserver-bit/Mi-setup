/** Lista de cobros de una persona (enlace de Pagos divididos): se ve sin cuenta, solo lectura. */
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Cargando, ErrorCaja, Insignia } from "../components/ui";
import { api } from "../lib/api";
import { localeActual } from "../lib/idioma";

interface CobroPublico {
  nombre: string;
  de: string;
  hoy: string;
  debe: number;
  pendiente: number;
  cobros: { pago: string; moneda: string; fecha: string; monto: number; estado: "pagado" | "pendiente" | "debe" }[];
}

const dinero = (n: number) => `$${n.toLocaleString(localeActual(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fecha = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString(localeActual(), { day: "numeric", month: "long", year: "numeric" });
const TEXTO = { pagado: "Pagado", pendiente: "Por pagar", debe: "Vencido" } as const;
const TONO = { pagado: "ok", pendiente: "neutro", debe: "peligro" } as const;

export default function CobroPublicoPagina() {
  const { token = "" } = useParams();
  const q = useQuery({ queryKey: ["cobro-publico", token], queryFn: () => api<CobroPublico>(`/api/cobros-publicos/${token}`), retry: false });
  const d = q.data;
  return (
    <div className="min-h-full bg-fondo p-4 text-texto">
      <div className="mx-auto max-w-lg space-y-3">
        {q.isLoading ? <Cargando /> : null}
        {q.error ? (
          <div className="rounded-tarjeta border border-borde bg-superficie p-6 text-center">
            <ErrorCaja error={q.error} />
            <p className="mt-2 text-sm text-tenue">Pide a quien te lo mandó un enlace nuevo.</p>
          </div>
        ) : null}
        {d ? (
          <article className="rounded-tarjeta border border-borde bg-superficie p-4">
            <p className="text-sm text-tenue">Cuentas compartidas con {d.de}</p>
            <h1 className="font-titulo text-2xl font-semibold">Hola, {d.nombre}</h1>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-fondo p-3">
                <p className="text-xs text-tenue">Total</p>
                <p className="text-xl font-bold">{dinero(d.debe + d.pendiente)}</p>
              </div>
              <div className="rounded-xl bg-fondo p-3">
                <p className="text-xs text-tenue">Vencido</p>
                <p className={d.debe > 0 ? "text-xl font-bold text-peligro" : "text-xl font-bold"}>{dinero(d.debe)}</p>
              </div>
            </div>
            <ul className="mt-3 space-y-1">
              {d.cobros.map((c, i) => (
                <li key={i} className="flex items-center gap-2 rounded-xl bg-fondo px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.pago}</p>
                    <p className="text-xs text-tenue">{fecha(c.fecha)}</p>
                  </div>
                  <span className="shrink-0">{dinero(c.monto)}</span>
                  <Insignia tono={TONO[c.estado]}>{TEXTO[c.estado]}</Insignia>
                </li>
              ))}
            </ul>
            {!d.cobros.length ? <p className="mt-3 text-sm text-tenue">No tienes nada pendiente. ¡Gracias!</p> : null}
            <p className="mt-4 text-center text-xs text-tenue">Actualizado al {fecha(d.hoy)} · Mi Setup</p>
          </article>
        ) : null}
      </div>
    </div>
  );
}
