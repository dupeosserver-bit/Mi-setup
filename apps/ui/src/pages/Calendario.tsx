import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Boton, Cargando, Entrada, ErrorCaja, Vacio, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { localeActual } from "../lib/idioma";

interface Elemento {
  id: string;
  tipo: "evento" | "recordatorio" | "suscripcion" | "cobro" | "vencimiento";
  titulo: string;
  fecha: string;
  color: string;
  editable: boolean;
}

const TIPOS: Record<Elemento["tipo"], string> = { evento: "Evento", recordatorio: "Recordatorio", suscripcion: "Suscripción", cobro: "Cobro", vencimiento: "Vencimiento" };
const LEYENDA: [string, string][] = [
  ["#60a5fa", "Evento"],
  ["#f59e0b", "Recordatorio"],
  ["#a78bfa", "Suscripción"],
  ["#4ade80", "Cobro"],
  ["#f87171", "Vencimiento"],
];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const aClave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const horaDe = (fecha: string) => new Date(fecha).toLocaleTimeString(localeActual(), { hour: "numeric", minute: "2-digit" });

export default function Calendario() {
  const puede = usePuede("calendario", "escritura");
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dia, setDia] = useState(aClave(new Date()));
  const [titulo, setTitulo] = useState("");
  const [hora, setHora] = useState("");
  const [todoElDia, setTodoElDia] = useState(true);

  const celdas = useMemo(() => {
    const inicio = new Date(mes);
    inicio.setDate(1 - ((mes.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
  }, [mes]);
  const desde = aClave(celdas[0]!);
  const hasta = aClave(celdas[41]!);
  const q = useQuery({ queryKey: ["calendario", desde, hasta], queryFn: () => api<Elemento[]>(`/api/calendario?desde=${desde}&hasta=${hasta}`) });
  const porDia = useMemo(() => {
    const m = new Map<string, Elemento[]>();
    for (const e of q.data ?? []) {
      const k = aClave(new Date(e.fecha));
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    for (const lista of m.values()) lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return m;
  }, [q.data]);

  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["calendario"] });
  const crear = useMutation({
    mutationFn: () => {
      const [a, mm, d] = dia.split("-").map(Number) as [number, number, number];
      const sinHora = todoElDia || !hora;
      const [h, mi] = sinHora ? [12, 0] : (hora.split(":").map(Number) as [number, number]);
      return api("/api/calendario/eventos", { cuerpo: { titulo: titulo.trim(), fecha: new Date(a, mm - 1, d, h, mi).toISOString(), todoElDia: sinHora } });
    },
    onSuccess: () => {
      setTitulo("");
      setHora("");
      setTodoElDia(true);
      refrescar();
    },
    onError: avisarError,
  });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/calendario/eventos/${id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });

  const hoy = aClave(new Date());
  const delDia = porDia.get(dia) ?? [];
  const irHoy = () => {
    const d = new Date();
    setMes(new Date(d.getFullYear(), d.getMonth(), 1));
    setDia(aClave(d));
  };
  const nombreMes = mayuscula(mes.toLocaleDateString(localeActual(), { month: "long", year: "numeric" }));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <h1 className="font-titulo text-2xl font-bold">Calendario</h1>
          <p className="text-sm text-tenue">Eventos, recordatorios, suscripciones, cobros y vencimientos juntos.</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-borde bg-superficie p-1">
          <Boton tamano="icono" variante="fantasma" icono={ChevronLeft} aria-label="Mes anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} />
          <span className="min-w-36 text-center text-sm font-semibold">{nombreMes}</span>
          <Boton tamano="icono" variante="fantasma" icono={ChevronRight} aria-label="Mes siguiente" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} />
        </div>
        <Boton variante="secundario" onClick={irHoy}>
          Hoy
        </Boton>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 rounded-2xl border border-borde bg-superficie p-2 sm:p-3">
          {q.isLoading ? <Cargando /> : null}
          <ErrorCaja error={q.error} />
          <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wide text-tenue">
            {DIAS.map((d) => (
              <span key={d} className="py-2">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-borde">
            {celdas.map((c) => {
              const k = aClave(c);
              const items = porDia.get(k) ?? [];
              const fuera = c.getMonth() !== mes.getMonth();
              const elegido = k === dia;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDia(k)}
                  className={cx(
                    "flex aspect-square min-w-0 flex-col items-center gap-1 bg-superficie p-1 text-left lg:aspect-auto lg:min-h-[104px] lg:items-stretch lg:p-1.5",
                    elegido ? "bg-[color-mix(in_srgb,var(--acento)_12%,var(--superficie))] outline outline-2 -outline-offset-2 outline-acento" : "hover:bg-tarjeta",
                    fuera && "opacity-40",
                  )}
                >
                  <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold lg:self-start", k === hoy && "bg-acento text-black")}>{c.getDate()}</span>
                  <span className="flex flex-wrap justify-center gap-0.5 lg:hidden">
                    {items.slice(0, 4).map((e) => (
                      <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />
                    ))}
                  </span>
                  <span className="hidden min-w-0 flex-col gap-1 lg:flex">
                    {items.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className="truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium"
                        style={{ background: `color-mix(in srgb, ${e.color} 22%, transparent)`, color: `color-mix(in srgb, ${e.color} 70%, var(--texto))` }}
                        title={e.titulo}
                      >
                        {e.tipo === "evento" || e.tipo === "recordatorio" ? `${horaDe(e.fecha)} ` : ""}
                        {e.titulo}
                      </span>
                    ))}
                    {items.length > 3 ? <span className="px-1 text-[11px] text-tenue">+{items.length - 3} más</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 px-1 text-xs text-tenue">
            {LEYENDA.map(([c, t]) => (
              <span key={t} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {t}
              </span>
            ))}
          </div>
        </section>

        <aside className="min-w-0 rounded-2xl border border-borde bg-superficie p-4">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
            <CalendarDays className="h-4 w-4 text-tenue" />
            {mayuscula(new Date(`${dia}T12:00:00`).toLocaleDateString(localeActual(), { weekday: "long", day: "numeric", month: "long" }))}
          </h2>
          <div className="space-y-2">
            {!delDia.length ? <Vacio texto="Nada este día." /> : null}
            {delDia.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-xl bg-tarjeta p-2.5 text-sm">
                <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: e.color }} />
                <div className="min-w-0 flex-1">
                  <p className="break-words font-medium">{e.titulo}</p>
                  <p className="text-xs text-tenue">
                    {TIPOS[e.tipo]} · {horaDe(e.fecha)}
                  </p>
                </div>
                {e.editable && puede ? <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={() => borrar.mutate(e.id)} /> : null}
              </div>
            ))}
          </div>
          {puede ? (
            <form
              className="mt-4 space-y-2.5 rounded-xl border border-borde bg-fondo p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (titulo.trim()) crear.mutate();
              }}
            >
              <p className="text-xs font-semibold text-tenue">Agregar a este día</p>
              <Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Cumpleaños, cita, junta…" maxLength={200} />
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={todoElDia} onChange={(e) => setTodoElDia(e.target.checked)} className="h-4 w-4 accent-acento" />
                  Todo el día
                </label>
                {!todoElDia ? (
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-tenue" />
                    <Entrada type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="w-32" aria-label="Hora" />
                  </span>
                ) : null}
                <Boton type="submit" variante="primario" icono={Plus} cargando={crear.isPending} className="ml-auto">
                  Agregar
                </Boton>
              </div>
            </form>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
