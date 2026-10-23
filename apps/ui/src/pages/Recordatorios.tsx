import { useMutation, useQuery } from "@tanstack/react-query";
import { AlarmClock, ArrowLeft, Bell, CalendarDays, CalendarRange, Check, CheckCheck, Clock, Pencil, Plus, Repeat, Sparkles, Sun, Trash2, TriangleAlert, Undo2, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { usePaginado } from "../components/Paginas";
import { Boton, Cargando, Encabezado, ErrorCaja, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { aInputLocal, fmtFechaHora } from "../lib/formato";
import { useModoPagina } from "../lib/marco";

interface Recordatorio {
  id: string;
  titulo: string;
  notas: string;
  fecha: string;
  repeticion: "nunca" | "diario" | "semanal" | "mensual";
  completado: boolean;
  avisado: string | null;
  creadoPor: string;
}

type Lista = "hoy" | "programados" | "repiten" | "vencidos" | "ia" | "completados";

const REPETICION: Record<Recordatorio["repeticion"], string> = {
  nunca: "Una vez",
  diario: "Cada día",
  semanal: "Cada semana",
  mensual: "Cada mes",
};

const DIA = 86_400_000;
const finDeHoy = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

const LISTAS: { id: Lista; nombre: string; icono: LucideIcon; color: string; filtro: (r: Recordatorio, ahora: number) => boolean }[] = [
  { id: "hoy", nombre: "Hoy", icono: Sun, color: "var(--aviso)", filtro: (r, a) => !r.completado && new Date(r.fecha).getTime() >= a && new Date(r.fecha).getTime() <= finDeHoy() },
  { id: "programados", nombre: "Programados", icono: CalendarDays, color: "#7cb7ff", filtro: (r, a) => !r.completado && new Date(r.fecha).getTime() >= a },
  { id: "repiten", nombre: "Se repiten", icono: Repeat, color: "var(--acento)", filtro: (r) => !r.completado && r.repeticion !== "nunca" },
  { id: "vencidos", nombre: "Vencidos", icono: TriangleAlert, color: "var(--error)", filtro: (r, a) => !r.completado && new Date(r.fecha).getTime() < a },
  { id: "ia", nombre: "Hechos por la IA", icono: Sparkles, color: "#ec4899", filtro: (r) => r.creadoPor === "ia" },
  { id: "completados", nombre: "Completados", icono: CheckCheck, color: "var(--ok)", filtro: (r) => r.completado },
];

const HORAS_RAPIDAS: [string, number][] = [
  ["En la mañana", 9],
  ["Mediodía", 13],
  ["En la tarde", 17],
  ["En la noche", 21],
];

function conHora(base: string, hora: number): string {
  const d = new Date(base);
  d.setHours(hora, 0, 0, 0);
  return aInputLocal(d);
}

function conDia(base: string, dias: number): string {
  const actual = new Date(base);
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(actual.getHours(), actual.getMinutes(), 0, 0);
  return aInputLocal(d);
}

function Chip({ activo, children, onClick }: { activo?: boolean; children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-full border px-3 py-1.5 text-xs font-medium",
        activo ? "border-acento bg-[color-mix(in_srgb,var(--acento)_16%,transparent)] text-acento" : "border-borde bg-tarjeta text-tenue hover:text-texto",
      )}
    >
      {children}
    </button>
  );
}

function Editor({ inicial, alTerminar }: { inicial: Recordatorio | null; alTerminar: () => void }) {
  useModoPagina("completa");
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [notas, setNotas] = useState(inicial?.notas ?? "");
  const [fecha, setFecha] = useState(aInputLocal(inicial?.fecha ?? new Date(Date.now() + 3_600_000)));
  const [repeticion, setRepeticion] = useState<Recordatorio["repeticion"]>(inicial?.repeticion ?? "nunca");
  const guardar = useMutation({
    mutationFn: () => {
      const cuerpo = { titulo, notas, fecha: new Date(fecha).toISOString(), repeticion };
      return inicial ? api(`/api/recordatorios/${inicial.id}`, { metodo: "PATCH", cuerpo }) : api("/api/recordatorios", { cuerpo });
    },
    onSuccess: () => {
      avisar(inicial ? "Recordatorio actualizado" : "Recordatorio creado");
      void queryClient.invalidateQueries({ queryKey: ["recordatorios"] });
      alTerminar();
    },
  });
  const hora = new Date(fecha).getHours();
  const diaDe = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return new Date(fecha).toDateString() === d.toDateString();
  };

  return (
    <form
      className="flex min-h-0 flex-1 flex-col bg-fondo"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-borde px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Boton variante="fantasma" icono={ArrowLeft} onClick={alTerminar}>
          <span className="hidden sm:inline">Cancelar</span>
        </Boton>
        <b className="min-w-0 flex-1 truncate text-center text-sm">{inicial ? "Editar recordatorio" : "Nuevo recordatorio"}</b>
        <Boton type="submit" variante="primario" icono={Check} cargando={guardar.isPending}>
          Guardar
        </Boton>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden">
        <div className="flex min-h-[50vh] flex-col p-5 lg:min-h-0 lg:p-8">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            maxLength={200}
            autoFocus
            placeholder="¿Qué te recordamos?"
            aria-label="Título"
            className="w-full bg-transparent font-titulo text-2xl font-bold outline-none placeholder:text-tenue sm:text-3xl"
          />
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={2000}
            placeholder="Notas (opcional)…"
            aria-label="Notas"
            className="mt-4 min-h-40 w-full flex-1 resize-none bg-transparent text-base leading-relaxed outline-none placeholder:text-tenue"
          />
          <small className="mt-2 text-right text-xs text-tenue">{notas.length} / 2000</small>
          <ErrorCaja error={guardar.error} />
        </div>
        <aside className="space-y-3 border-t border-borde bg-superficie p-4 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <section className="rounded-2xl bg-tarjeta p-3.5">
            <h4 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
              <CalendarDays className="h-4 w-4 text-tenue" />
              Día
            </h4>
            <div className="flex flex-wrap gap-1.5">
              <Chip activo={diaDe(0)} onClick={() => setFecha(conDia(fecha, 0))}>Hoy</Chip>
              <Chip activo={diaDe(1)} onClick={() => setFecha(conDia(fecha, 1))}>Mañana</Chip>
              <Chip activo={diaDe(7)} onClick={() => setFecha(conDia(fecha, 7))}>En una semana</Chip>
            </div>
            <input type="date" value={fecha.slice(0, 10)} onChange={(e) => e.target.value && setFecha(`${e.target.value}${fecha.slice(10)}`)} aria-label="Elegir fecha" className="mt-2.5 w-full rounded-xl border border-borde bg-fondo px-3 py-2 text-sm" />
          </section>
          <section className="rounded-2xl bg-tarjeta p-3.5">
            <h4 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
              <AlarmClock className="h-4 w-4 text-tenue" />
              Hora
            </h4>
            <input type="time" value={fecha.slice(11, 16)} onChange={(e) => e.target.value && setFecha(`${fecha.slice(0, 11)}${e.target.value}`)} aria-label="Hora" className="mb-2.5 w-full rounded-xl border border-borde bg-fondo px-3 py-2 text-lg font-semibold" />
            <div className="flex flex-wrap gap-1.5">
              {HORAS_RAPIDAS.map(([t, h]) => (
                <Chip key={t} activo={hora === h} onClick={() => setFecha(conHora(fecha, h))}>
                  {t}
                </Chip>
              ))}
            </div>
          </section>
          <section className="rounded-2xl bg-tarjeta p-3.5">
            <h4 className="mb-2.5 flex items-center gap-2 text-sm font-semibold">
              <Repeat className="h-4 w-4 text-tenue" />
              Repetir
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(REPETICION) as Recordatorio["repeticion"][]).map((r) => (
                <Chip key={r} activo={repeticion === r} onClick={() => setRepeticion(r)}>
                  {REPETICION[r]}
                </Chip>
              ))}
            </div>
          </section>
          <p className="flex items-start gap-2 px-1 text-xs text-tenue">
            <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Llega como aviso a todos tus equipos.
          </p>
        </aside>
      </div>
    </form>
  );
}

export default function Recordatorios() {
  const [params, setParams] = useSearchParams();
  const puedeEditar = usePuede("recordatorios", "escritura");
  const [lista, setLista] = useState<Lista>("programados");
  const { data, isLoading, error } = useQuery({ queryKey: ["recordatorios"], queryFn: () => api<Recordatorio[]>("/api/recordatorios") });
  const editarId = params.get("editar");
  const abrirEditor = (id: string) => setParams({ editar: id });
  const cerrarEditor = () => setParams({}, { replace: true });

  useEffect(() => {
    if (params.get("nuevo") && puedeEditar) setParams({ editar: "nuevo" }, { replace: true });
  }, [params, puedeEditar, setParams]);

  const ahora = Date.now();
  const cuentas = useMemo(() => Object.fromEntries(LISTAS.map((l) => [l.id, (data ?? []).filter((r) => l.filtro(r, ahora)).length])) as Record<Lista, number>, [data, ahora]);
  const actual = LISTAS.find((l) => l.id === lista) ?? LISTAS[1]!;
  const filtrados = useMemo(
    () => (data ?? []).filter((r) => actual.filtro(r, ahora)).sort((a, b) => (lista === "completados" ? b.fecha.localeCompare(a.fecha) : a.fecha.localeCompare(b.fecha))),
    [data, actual, ahora, lista],
  );
  const { visibles, paginas } = usePaginado(filtrados, 8);
  const semana = useMemo(() => (data ?? []).filter((r) => !r.completado && new Date(r.fecha).getTime() >= ahora && new Date(r.fecha).getTime() <= ahora + 7 * DIA).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 6), [data, ahora]);

  if (editarId && puedeEditar) {
    const inicial = editarId === "nuevo" ? null : (data?.find((r) => r.id === editarId) ?? null);
    if (editarId !== "nuevo" && !inicial) return isLoading ? <Cargando /> : <Vacio icono={Bell} texto="Ese recordatorio ya no existe." />;
    return <Editor key={editarId} inicial={inicial} alTerminar={cerrarEditor} />;
  }

  const cambiar = async (r: Recordatorio, cuerpo: Partial<Recordatorio>) => {
    await api(`/api/recordatorios/${r.id}`, { metodo: "PATCH", cuerpo }).catch(avisarError);
    await queryClient.invalidateQueries({ queryKey: ["recordatorios"] });
  };

  const fila = (r: Recordatorio) => {
    const vencido = !r.completado && new Date(r.fecha).getTime() < ahora;
    return (
      <li key={r.id} className="flex items-start gap-3 border-b border-borde py-3 last:border-0">
        {puedeEditar ? (
          <button
            type="button"
            aria-label={r.completado ? "Marcar pendiente" : "Completar"}
            onClick={() => void cambiar(r, { completado: !r.completado })}
            className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", r.completado ? "border-ok bg-ok text-black" : "border-borde hover:border-acento")}
          >
            {r.completado ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className={cx("truncate text-sm font-medium", r.completado && "text-tenue line-through")}>{r.titulo}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-tenue">
            <span className={cx("inline-flex items-center gap-1", vencido && "text-peligro")}>
              <Clock className="h-3 w-3" />
              {fmtFechaHora(r.fecha)}
              {vencido ? " · vencido" : ""}
            </span>
            {r.repeticion !== "nunca" ? (
              <span className="inline-flex items-center gap-1">
                <Repeat className="h-3 w-3" /> {REPETICION[r.repeticion]}
              </span>
            ) : null}
            {r.creadoPor === "ia" ? (
              <span className="inline-flex items-center gap-1 text-acento">
                <Sparkles className="h-3 w-3" /> IA
              </span>
            ) : null}
          </p>
          {r.notas ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-tenue">{r.notas}</p> : null}
        </div>
        {puedeEditar ? (
          <div className="flex shrink-0">
            {r.completado ? (
              <Boton tamano="icono" variante="fantasma" icono={Undo2} onClick={() => void cambiar(r, { completado: false })} aria-label="Reabrir" />
            ) : (
              <Boton tamano="icono" variante="fantasma" icono={Pencil} onClick={() => abrirEditor(r.id)} aria-label="Editar" />
            )}
            <Boton
              tamano="icono"
              variante="fantasma"
              icono={Trash2}
              aria-label="Borrar"
              onClick={async () => {
                if (!(await confirmar({ titulo: "Borrar recordatorio", mensaje: `¿Borrar "${r.titulo}"?`, boton: "Borrar" }))) return;
                await api(`/api/recordatorios/${r.id}`, { metodo: "DELETE" }).catch(avisarError);
                await queryClient.invalidateQueries({ queryKey: ["recordatorios"] });
              }}
            />
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <>
      <Encabezado
        titulo="Recordatorios"
        descripcion="Llegan como aviso a todos tus equipos."
        acciones={puedeEditar ? <Boton variante="primario" icono={Plus} onClick={() => abrirEditor("nuevo")}>Nuevo</Boton> : null}
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {LISTAS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLista(l.id)}
                className={cx("flex min-w-0 flex-col items-start gap-1.5 rounded-2xl border p-3.5 text-left transition-colors", lista === l.id ? "border-transparent" : "border-borde bg-superficie hover:bg-tarjeta")}
                style={lista === l.id ? { background: `color-mix(in srgb, ${l.color} 16%, var(--superficie))`, borderColor: `color-mix(in srgb, ${l.color} 45%, transparent)` } : undefined}
              >
                <span className="grid h-8 w-8 place-items-center rounded-full text-black" style={{ background: l.color }}>
                  <l.icono className="h-4 w-4" />
                </span>
                <b className="text-2xl leading-none">{cuentas[l.id]}</b>
                <span className="w-full truncate text-xs text-tenue">{l.nombre}</span>
              </button>
            ))}
          </div>
          <section className="rounded-2xl border border-borde bg-superficie p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <CalendarRange className="h-4 w-4 text-tenue" />
              Próximos 7 días
            </h3>
            {semana.length ? (
              <ul>
                {semana.map((r) => (
                  <li key={r.id} className="flex min-w-0 items-center gap-2.5 border-b border-borde py-2 text-sm last:border-0">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-acento" />
                    <span className="min-w-0 flex-1 truncate">{r.titulo}</span>
                    <small className="shrink-0 text-xs text-tenue">{fmtFechaHora(r.fecha)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-2 text-sm text-tenue">Nada en los próximos 7 días.</p>
            )}
          </section>
        </div>
        <section className="min-w-0 rounded-2xl border border-borde bg-superficie p-4">
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-full text-black" style={{ background: actual.color }}>
              <actual.icono className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-base font-semibold">{actual.nombre}</h3>
            <span className="text-sm text-tenue">· {filtrados.length}</span>
            {puedeEditar && lista !== "completados" ? (
              <Boton tamano="sm" variante="secundario" icono={Plus} className="ml-auto" onClick={() => abrirEditor("nuevo")}>
                <span className="hidden sm:inline">Agregar recordatorio</span>
              </Boton>
            ) : null}
          </div>
          {visibles.length ? <ul>{visibles.map(fila)}</ul> : <Vacio icono={actual.icono} texto={lista === "completados" ? "Aún no completas ninguno." : "Nada aquí por ahora."} />}
          {paginas}
        </section>
      </div>
    </>
  );
}
