/** Calendario: tus eventos, recordatorios, suscripciones, cobros y vencimientos en un solo lugar. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Tarjeta, Vacio, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";

interface Elemento {
  id: string;
  tipo: "evento" | "recordatorio" | "suscripcion" | "cobro" | "vencimiento";
  titulo: string;
  fecha: string;
  color: string;
  editable: boolean;
}

const TIPOS: Record<Elemento["tipo"], string> = { evento: "Evento", recordatorio: "Recordatorio", suscripcion: "Suscripción", cobro: "Cobro", vencimiento: "Vencimiento" };
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const aClave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function Calendario() {
  const puede = usePuede("calendario", "escritura");
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dia, setDia] = useState(aClave(new Date()));
  const [titulo, setTitulo] = useState("");
  const [hora, setHora] = useState("");

  // Cuadrícula de 6 semanas que empieza en lunes.
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
    return m;
  }, [q.data]);

  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["calendario"] });
  const crear = useMutation({
    mutationFn: () => {
      const [a, mm, d] = dia.split("-").map(Number) as [number, number, number];
      const [h, mi] = hora ? (hora.split(":").map(Number) as [number, number]) : [12, 0];
      return api("/api/calendario/eventos", { cuerpo: { titulo: titulo.trim(), fecha: new Date(a, mm - 1, d, h, mi).toISOString(), todoElDia: !hora } });
    },
    onSuccess: () => {
      setTitulo("");
      setHora("");
      refrescar();
    },
    onError: avisarError,
  });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/calendario/eventos/${id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });

  const hoy = aClave(new Date());
  const delDia = porDia.get(dia) ?? [];

  return (
    <div className="space-y-4">
      <Encabezado titulo="Calendario" descripcion="Eventos, recordatorios, suscripciones, cobros y vencimientos juntos." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
        <Tarjeta
          titulo={mes.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}
          icono={CalendarDays}
          acciones={
            <div className="flex gap-1">
              <Boton tamano="icono" variante="fantasma" icono={ChevronLeft} aria-label="Mes anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} />
              <Boton
                tamano="sm"
                variante="fantasma"
                onClick={() => {
                  const d = new Date();
                  setMes(new Date(d.getFullYear(), d.getMonth(), 1));
                  setDia(aClave(d));
                }}
              >
                Hoy
              </Boton>
              <Boton tamano="icono" variante="fantasma" icono={ChevronRight} aria-label="Mes siguiente" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} />
            </div>
          }
        >
          {q.isLoading ? <Cargando /> : null}
          <ErrorCaja error={q.error} />
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-tenue">
            {DIAS.map((d) => (
              <span key={d} className="py-1">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {celdas.map((c) => {
              const k = aClave(c);
              const items = porDia.get(k) ?? [];
              const fuera = c.getMonth() !== mes.getMonth();
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDia(k)}
                  className={cx(
                    "flex aspect-square min-w-0 flex-col items-center justify-start rounded-xl p-1 text-sm",
                    k === dia ? "bg-acento/20 ring-2 ring-acento" : "hover:bg-tarjeta",
                    fuera && "opacity-40",
                  )}
                >
                  <span className={cx("flex h-6 w-6 items-center justify-center rounded-full", k === hoy && "bg-acento font-bold text-black")}>{c.getDate()}</span>
                  <span className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {items.slice(0, 4).map((e) => (
                      <span key={e.id} className="h-1.5 w-1.5 rounded-full" style={{ background: e.color }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-tenue">
            {[
              ["#60a5fa", "Evento"],
              ["#f59e0b", "Recordatorio"],
              ["#a78bfa", "Suscripción"],
              ["#4ade80", "Cobro"],
              ["#f87171", "Vencimiento"],
            ].map(([c, t]) => (
              <span key={t} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {t}
              </span>
            ))}
          </div>
        </Tarjeta>

        <Tarjeta titulo={new Date(`${dia}T12:00:00`).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}>
          <div className="space-y-2">
            {!delDia.length ? <Vacio texto="Nada este día." /> : null}
            {delDia.map((e) => (
              <div key={e.id} className="flex items-center gap-2 rounded-xl bg-fondo p-2 text-sm">
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: e.color }} />
                <div className="min-w-0 flex-1">
                  <p className="break-words">{e.titulo}</p>
                  <p className="text-xs text-tenue">
                    {TIPOS[e.tipo]} · {new Date(e.fecha).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                {e.editable && puede ? <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={() => borrar.mutate(e.id)} /> : null}
              </div>
            ))}
            {puede ? (
              <form
                className="space-y-2 border-t border-borde pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (titulo.trim()) crear.mutate();
                }}
              >
                <Campo etiqueta="Nuevo evento">
                  <Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Cumpleaños, cita, junta…" maxLength={200} />
                </Campo>
                <div className="flex gap-2">
                  <Entrada type="time" value={hora} onChange={(e) => setHora(e.target.value)} title="Hora (vacío = todo el día)" />
                  <Boton type="submit" variante="primario" icono={Plus} cargando={crear.isPending}>
                    Agregar
                  </Boton>
                </div>
              </form>
            ) : null}
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
