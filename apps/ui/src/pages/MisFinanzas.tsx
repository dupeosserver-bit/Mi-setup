/**
 * Mis finanzas: gastos e ingresos con categoría, presupuestos, suscripciones con
 * aviso antes del cobro, y tu Excel (importar y exportar).
 */
import { usePaginado } from "../components/Paginas";
import { Rendimientos } from "../components/Rendimientos";
import { COLOR_GASTOS, COLOR_INGRESOS, GastosSemana, TendenciaFinanzas } from "../components/FinanzasGraficas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, CalendarClock, Camera, Check, ChevronLeft, ChevronRight, Download, FileSpreadsheet, GitFork, History, Pencil, PiggyBank, Plus, Trash2, Upload, Wallet } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api, urlServidor } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { interpretarFilas, type FilaImportada } from "../lib/finanzas";
import { Impuestos, PagosDivididos, TicketConFoto } from "../components/FinanzasExtra";
import { localeActual } from "../lib/idioma";

interface Movimiento {
  id: string;
  tipo: "gasto" | "ingreso";
  monto: number;
  categoria: string;
  descripcion: string;
  fecha: string;
  iva: number | null;
  ticket: string | null;
}
interface Resumen {
  ingresos: number;
  gastos: number;
  balance: number;
  porCategoria: { categoria: string; gastado: number; presupuesto: number | null }[];
  ultimosMeses: { mes: string; ingresos: number; gastos: number }[];
}
interface Suscripcion {
  id: string;
  nombre: string;
  monto: number;
  moneda: string;
  ciclo: "semanal" | "mensual" | "trimestral" | "anual";
  proximoCobro: string;
  categoria: string;
  avisarDias: number;
  activa: boolean;
}

interface CobroMes {
  id: string;
  pagoId: string;
  pago: string;
  persona: string;
  fecha: string;
  monto: number;
  moneda: string;
  pagado: boolean;
  vieneDe: string | null;
}
interface PagosMes {
  mes: string;
  cobros: CobroMes[];
  total: number;
  cobrado: number;
  falta: number;
  deAntes: number;
  totalPagos: number;
  totalPagosMes: number;
  pagosActivos: number;
}

interface CategoriaUsada {
  categoria: string;
  tipo: "gasto" | "ingreso";
  veces: number;
}

/** Sugerencias para escribir el concepto: las tuyas primero (ej. «Préstamo Coppel») y luego las de siempre. */
function useCategorias(tipo?: "gasto" | "ingreso"): string[] {
  const q = useQuery({ queryKey: ["finanzas-personales", "categorias"], queryFn: () => api<CategoriaUsada[]>("/api/finanzas-personales/categorias"), staleTime: 60_000 });
  return useMemo(() => {
    const propias = (q.data ?? []).filter((c) => !tipo || c.tipo === tipo).map((c) => c.categoria);
    return [...new Set([...propias, ...CATEGORIAS])];
  }, [q.data, tipo]);
}

const CATEGORIAS = ["Comida", "Transporte", "Casa", "Servicios", "Suscripciones", "Salud", "Diversión", "Ropa", "Educación", "Trabajo", "Sueldo", "Ventas", "Otros"];
const dinero = (n: number) => `$${n.toLocaleString(localeActual(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mesActual = () => new Date().toISOString().slice(0, 7);
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const nombreMes = (m: string) => {
  const t = new Date(`${m}-15T12:00:00`).toLocaleDateString(localeActual(), { month: "long", year: "numeric" });
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const mesCorto = (m: string) => {
  const t = new Date(`${m}-15T12:00:00`).toLocaleDateString(localeActual(), { month: "short" }).replace(".", "");
  return t.charAt(0).toUpperCase() + t.slice(1);
};
const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["finanzas-personales"] });

// ---------------------------------------------------------------- resumen

function ResumenMes({ mes }: { mes: string }) {
  const q = useQuery({ queryKey: ["finanzas-personales", "resumen", mes], queryFn: () => api<Resumen>(`/api/finanzas-personales/resumen?mes=${mes}`) });
  const puede = usePuede("finanzas_personales", "escritura");
  const [presupuesto, setPresupuesto] = useState<{ categoria: string; limite: string } | null>(null);
  const guardarPresupuesto = useMutation({
    mutationFn: (p: { categoria: string; limite: number }) => api("/api/finanzas-personales/presupuestos", { metodo: "PUT", cuerpo: p }),
    onSuccess: () => {
      setPresupuesto(null);
      refrescar();
    },
    onError: avisarError,
  });
  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCaja error={q.error} />;
  const r = q.data;
  if (!r) return null;
  const meses = r.ultimosMeses.slice(-6);
  const maxCategoria = Math.max(1, ...r.porCategoria.map((c) => c.presupuesto ?? c.gastado));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Cuadro icono={ArrowUpRight} titulo="Ingresos" valor={dinero(r.ingresos)} tono="text-ok" />
        <Cuadro icono={ArrowDownRight} titulo="Gastos" valor={dinero(r.gastos)} tono="text-peligro" />
        <Cuadro
          icono={PiggyBank}
          titulo="Te queda"
          valor={dinero(r.balance)}
          tono={r.balance >= 0 ? "text-ok" : "text-peligro"}
          detalle={r.ingresos > 0 ? `${Math.max(0, Math.round((r.balance / r.ingresos) * 100))} % de lo que entró` : undefined}
          resaltado
        />
        <CuadroDivididos mes={mes} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Tarjeta titulo="Últimos meses">
          {meses.length ? (
            <div className="h-72 w-full">
              <ResponsiveContainer>
                <BarChart data={meses} barGap={4}>
                  <CartesianGrid stroke="var(--borde)" vertical={false} />
                  <XAxis dataKey="mes" tickFormatter={mesCorto} tick={{ fontSize: 11, fill: "var(--texto-2)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "var(--texto-2)" }} width={56} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v: number) => dinero(v)} labelFormatter={(m: string) => nombreMes(m)} cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "var(--superficie)", border: "1px solid var(--borde)", borderRadius: 12, color: "var(--texto)" }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "var(--texto-2)" }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill={COLOR_INGRESOS} radius={[4, 4, 0, 0]} maxBarSize={36} />
                  <Bar dataKey="gastos" name="Gastos" fill={COLOR_GASTOS} radius={[4, 4, 0, 0]} maxBarSize={36} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Vacio texto="Aquí verás tus ingresos y gastos de los últimos 6 meses." />
          )}
        </Tarjeta>
        <Tarjeta titulo="¿En qué se va?" acciones={<span className="text-xs text-tenue">{nombreMes(mes)}</span>}>
          {!r.porCategoria.length ? <Vacio texto="Sin gastos este mes." /> : null}
          <div className="space-y-2.5">
            {r.porCategoria.map((c) => {
              const tope = c.presupuesto ?? null;
              const pct = Math.min(100, (c.gastado / (tope ?? maxCategoria)) * 100);
              return (
                <div key={c.categoria}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">{c.categoria}</span>
                    <span className="shrink-0 font-medium">
                      {dinero(c.gastado)}
                      {tope ? <span className="font-normal text-tenue">{` de ${dinero(tope)}`}</span> : null}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-tarjeta">
                    <div className={cx("h-full rounded-full", tope && pct >= 100 ? "bg-peligro" : tope && pct >= 80 ? "bg-aviso" : "")} style={{ width: `${pct}%`, background: tope && pct >= 80 ? undefined : COLOR_INGRESOS }} />
                  </div>
                  {puede ? (
                    <button type="button" className="mt-0.5 text-xs text-tenue underline-offset-2 hover:underline" onClick={() => setPresupuesto({ categoria: c.categoria, limite: tope ? String(tope) : "" })}>
                      {tope ? "cambiar límite" : "poner límite"}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {presupuesto ? (
            <form
              className="mt-4 flex flex-wrap items-end gap-2 rounded-xl bg-fondo p-3"
              onSubmit={(e) => {
                e.preventDefault();
                guardarPresupuesto.mutate({ categoria: presupuesto.categoria, limite: Number(presupuesto.limite) || 0 });
              }}
            >
              <Campo etiqueta={`Límite al mes para ${presupuesto.categoria}`}>
                <Entrada type="number" min={0} step="0.01" value={presupuesto.limite} onChange={(e) => setPresupuesto({ ...presupuesto, limite: e.target.value })} placeholder="0 = sin límite" autoFocus />
              </Campo>
              <Boton type="submit" variante="primario" cargando={guardarPresupuesto.isPending}>
                Guardar
              </Boton>
              <Boton variante="fantasma" onClick={() => setPresupuesto(null)}>
                Cancelar
              </Boton>
            </form>
          ) : null}
        </Tarjeta>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <PagosDelMes mes={mes} />
        <SuscripcionesCorto />
      </div>
      <GastosSemana />
      <TendenciaFinanzas />
    </div>
  );
}

function Cuadro({ icono: Icono, titulo, valor, tono, detalle, resaltado }: { icono: typeof Wallet; titulo: string; valor: string; tono?: string; detalle?: string | undefined; resaltado?: boolean }) {
  return (
    <div className={cx("min-w-0 rounded-tarjeta border p-4", resaltado ? "border-[color-mix(in_srgb,var(--acento)_40%,transparent)] bg-[color-mix(in_srgb,var(--acento)_8%,var(--superficie))]" : "border-borde bg-superficie")}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-tarjeta">
        <Icono className={cx("h-4 w-4", tono ?? "text-tenue")} />
      </span>
      <p className="mt-3 text-xs text-tenue">{titulo}</p>
      <p className={cx("truncate text-2xl font-bold", tono)}>{valor}</p>
      {detalle ? <p className="mt-0.5 truncate text-xs text-tenue">{detalle}</p> : null}
    </div>
  );
}

const usePagosMes = (mes: string) =>
  useQuery({ queryKey: ["finanzas-personales", "divididos", "mes", mes], queryFn: () => api<PagosMes>(`/api/finanzas-personales/divididos/mes?mes=${mes}`) });

function CuadroDivididos({ mes }: { mes: string }) {
  const q = usePagosMes(mes);
  return <Cuadro icono={GitFork} titulo="Pagos divididos" valor={dinero(q.data?.totalPagosMes ?? 0)} detalle={q.data ? (q.data.falta > 0 ? `Te deben ${dinero(q.data.falta)}` : "Todos al corriente") : undefined} />;
}

function PagosDelMes({ mes }: { mes: string }) {
  const puede = usePuede("finanzas_personales", "escritura");
  const q = usePagosMes(mes);
  const lista = useMemo(() => [...(q.data?.cobros ?? [])].sort((a, b) => Number(a.pagado) - Number(b.pagado) || a.fecha.localeCompare(b.fecha)), [q.data]);
  const { visibles, paginas, total } = usePaginado(lista, 8);
  const marcar = useMutation({
    mutationFn: ({ id, pagado }: { id: string; pagado: boolean }) => api(`/api/finanzas-personales/divididos/cobros/${id}`, { cuerpo: { pagado } }),
    onSuccess: refrescar,
    onError: avisarError,
  });
  const pagados = lista.filter((c) => c.pagado).length;
  return (
    <Tarjeta titulo="Pagos de este mes" acciones={lista.length ? <span className="text-xs text-tenue">{`${pagados} de ${lista.length} pagados`}</span> : null}>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data && !lista.length ? <Vacio icono={GitFork} texto="Cuando dividas un pago (internet, Netflix, renta…) aquí marcas quién ya te pagó." /> : null}
      <ul className="divide-y divide-borde">
        {visibles.map((c) => (
          <li key={c.id} className="flex items-center gap-3 py-2.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={c.pagado}
              aria-label={c.pagado ? "Marcar como no pagado" : "Marcar como pagado"}
              disabled={!puede || marcar.isPending}
              onClick={() => marcar.mutate({ id: c.id, pagado: !c.pagado })}
              className={cx(
                "grid h-7 w-7 shrink-0 place-items-center rounded-lg border transition",
                c.pagado ? "border-transparent bg-ok text-black" : "border-borde bg-fondo hover:border-[color-mix(in_srgb,var(--ok)_60%,transparent)]",
              )}
            >
              {c.pagado ? <Check className="h-4 w-4" /> : null}
            </button>
            <div className="min-w-0 flex-1">
              <p className={cx("truncate text-sm font-medium", c.pagado && "text-tenue")}>{`${c.pago} · ${c.persona}`}</p>
              {c.vieneDe && !c.pagado ? (
                <p className="flex items-center gap-1 text-xs text-aviso">
                  <History className="h-3 w-3" />
                  {`Viene de ${nombreMes(c.vieneDe)}`}
                </p>
              ) : (
                <p className="text-xs text-tenue">{new Date(`${c.fecha}T12:00:00`).toLocaleDateString(localeActual(), { day: "numeric", month: "short" })}</p>
              )}
            </div>
            <span className={cx("shrink-0 text-sm font-semibold", c.pagado && "text-tenue line-through")}>{dinero(c.monto)}</span>
          </li>
        ))}
      </ul>
      {total > 1 ? <div className="mt-2">{paginas}</div> : null}
      {q.data && lista.length ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-fondo px-3 py-2 text-xs">
          <span className="text-tenue">Lo que no marques como pagado pasa solo al mes siguiente.</span>
          <span className="font-medium">{`Falta ${dinero(q.data.falta)} de ${dinero(q.data.total)}`}</span>
        </div>
      ) : null}
    </Tarjeta>
  );
}

function SuscripcionesCorto() {
  const puede = usePuede("finanzas_personales", "escritura");
  const q = useSuscripciones();
  const [editar, setEditar] = useState<Suscripcion | null>(null);
  const activas = q.data?.suscripciones.filter((s) => s.activa) ?? [];
  const { visibles, paginas, total } = usePaginado(activas, 5);
  return (
    <Tarjeta titulo="Suscripciones" icono={CalendarClock}>
      <ErrorCaja error={q.error} />
      {q.data ? (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-fondo p-3">
            <p className="text-xs text-tenue">Pagas al mes</p>
            <p className="text-lg font-bold">{dinero(q.data.totalMensual)}</p>
          </div>
          <div className="rounded-xl bg-fondo p-3">
            <p className="text-xs text-tenue">Al año</p>
            <p className="text-lg font-bold">{dinero(q.data.totalAnual)}</p>
          </div>
        </div>
      ) : null}
      {q.data && !activas.length ? <Vacio icono={CalendarClock} texto="Agrega Netflix, Spotify, tu VPS… en la pestaña Suscripciones." /> : null}
      <ul className="space-y-1">
        {visibles.map((s) => (
          <li key={s.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tarjeta text-sm font-bold">{s.nombre.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{s.nombre}</p>
              <p className="truncate text-xs text-tenue">{`${CICLO_TEXTO[s.ciclo]} · próximo ${new Date(`${s.proximoCobro}T12:00:00`).toLocaleDateString(localeActual(), { day: "numeric", month: "short" })}`}</p>
            </div>
            <span className="shrink-0 text-sm font-semibold">{dinero(s.monto)}</span>
            {puede ? <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Editar suscripción" onClick={() => setEditar(s)} /> : null}
          </li>
        ))}
      </ul>
      {total > 1 ? <div className="mt-2">{paginas}</div> : null}
      <EditarSuscripcion suscripcion={editar} alCerrar={() => setEditar(null)} />
    </Tarjeta>
  );
}

const CICLO_TEXTO: Record<Suscripcion["ciclo"], string> = { semanal: "Semanal", mensual: "Mensual", trimestral: "Trimestral", anual: "Anual" };

const useSuscripciones = () =>
  useQuery({
    queryKey: ["finanzas-personales", "suscripciones"],
    queryFn: () => api<{ suscripciones: Suscripcion[]; totalMensual: number; totalAnual: number }>("/api/finanzas-personales/suscripciones"),
  });

function EditarSuscripcion({ suscripcion, alCerrar }: { suscripcion: Suscripcion | null; alCerrar: () => void }) {
  const [d, setD] = useState<{ nombre: string; monto: string; ciclo: Suscripcion["ciclo"]; proximoCobro: string; avisarDias: string; activa: boolean } | null>(null);
  const [de, setDe] = useState<string | null>(null);
  if (suscripcion && de !== suscripcion.id) {
    setDe(suscripcion.id);
    setD({ nombre: suscripcion.nombre, monto: String(suscripcion.monto), ciclo: suscripcion.ciclo, proximoCobro: suscripcion.proximoCobro, avisarDias: String(suscripcion.avisarDias), activa: suscripcion.activa });
  }
  if (!suscripcion && de !== null) setDe(null);
  const cerrar = () => {
    setDe(null);
    alCerrar();
  };
  const guardar = useMutation({
    mutationFn: () =>
      api(`/api/finanzas-personales/suscripciones/${suscripcion!.id}`, {
        metodo: "PATCH",
        cuerpo: { nombre: d!.nombre, monto: Number(d!.monto), ciclo: d!.ciclo, proximoCobro: d!.proximoCobro, avisarDias: Number(d!.avisarDias), activa: d!.activa },
      }),
    onSuccess: () => {
      avisar("Suscripción guardada");
      refrescar();
      cerrar();
    },
    onError: avisarError,
  });
  const borrar = useMutation({
    mutationFn: () => api(`/api/finanzas-personales/suscripciones/${suscripcion!.id}`, { metodo: "DELETE" }),
    onSuccess: () => {
      avisar("Suscripción borrada");
      refrescar();
      cerrar();
    },
    onError: avisarError,
  });
  return (
    <Modal abierto={Boolean(suscripcion && d)} titulo="Editar suscripción" alCerrar={cerrar}>
      {d ? (
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate();
          }}
        >
          <div className="col-span-2">
            <Campo etiqueta="Nombre">
              <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required maxLength={80} />
            </Campo>
          </div>
          <Campo etiqueta="Monto">
            <Entrada type="number" min={0} step="0.01" value={d.monto} onChange={(e) => setD({ ...d, monto: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Cada cuánto">
            <Selector value={d.ciclo} onChange={(e) => setD({ ...d, ciclo: e.target.value as Suscripcion["ciclo"] })}>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </Selector>
          </Campo>
          <Campo etiqueta="Próximo cobro">
            <Entrada type="date" value={d.proximoCobro} onChange={(e) => setD({ ...d, proximoCobro: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Avisarme días antes">
            <Entrada type="number" min={0} max={30} value={d.avisarDias} onChange={(e) => setD({ ...d, avisarDias: e.target.value })} />
          </Campo>
          <div className="col-span-2">
            <Interruptor activo={!d.activa} alCambiar={(v) => setD({ ...d, activa: !v })} etiqueta="Pausada (no se cobra ni avisa)" />
          </div>
          <div className="col-span-2 flex flex-wrap justify-between gap-2 pt-1">
            <Boton
              variante="peligro"
              icono={Trash2}
              cargando={borrar.isPending}
              onClick={async () => {
                if (await confirmar({ titulo: "Borrar suscripción", mensaje: d.nombre, boton: "Borrar" })) borrar.mutate();
              }}
            >
              Borrar
            </Boton>
            <Boton type="submit" variante="primario" cargando={guardar.isPending}>
              Guardar
            </Boton>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}

// ---------------------------------------------------------------- movimientos

function Movimientos({ mes }: { mes: string }) {
  const puede = usePuede("finanzas_personales", "escritura");
  const q = useQuery({ queryKey: ["finanzas-personales", "movimientos", mes], queryFn: () => api<Movimiento[]>(`/api/finanzas-personales/movimientos?mes=${mes}`) });
  const [d, setD] = useState({ tipo: "gasto" as Movimiento["tipo"], monto: "", categoria: "Comida", descripcion: "", fecha: hoyLocal() });
  const sugerencias = useCategorias(d.tipo);
  const crear = useMutation({
    mutationFn: () => api("/api/finanzas-personales/movimientos", { cuerpo: { ...d, categoria: d.categoria.trim() || "Otros", monto: Number(d.monto) } }),
    onSuccess: () => {
      setD({ ...d, monto: "", descripcion: "" });
      void queryClient.invalidateQueries({ queryKey: ["finanzas-personales", "categorias"] });
      refrescar();
    },
    onError: avisarError,
  });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/finanzas-personales/movimientos/${id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });
  const [ticket, setTicket] = useState(false);

  const pgMov = usePaginado(q.data, 12);
  return (
    <div className="space-y-4">
      {puede ? (
        <Tarjeta
          titulo="Anotar"
          icono={Plus}
          acciones={
            <Boton tamano="sm" variante="primario" icono={Camera} onClick={() => setTicket(true)}>
              Gasto con ticket
            </Boton>
          }
        >
          <form
            className="grid grid-cols-2 gap-2 md:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (Number(d.monto) > 0) crear.mutate();
            }}
          >
            <Selector value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as Movimiento["tipo"] })}>
              <option value="gasto">Gasto</option>
              <option value="ingreso">Ingreso</option>
            </Selector>
            <Entrada type="number" min={0} step="0.01" value={d.monto} onChange={(e) => setD({ ...d, monto: e.target.value })} placeholder="Monto" required />
            <div>
              <Entrada list="sugerencias-concepto" value={d.categoria} onChange={(e) => setD({ ...d, categoria: e.target.value })} placeholder="Escribe: Préstamo Coppel, Venta…" maxLength={60} aria-label="Concepto o categoría" />
              <datalist id="sugerencias-concepto">
                {sugerencias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <Entrada className="col-span-2 md:col-span-1" value={d.descripcion} onChange={(e) => setD({ ...d, descripcion: e.target.value })} placeholder="Concepto (opcional)" maxLength={300} />
            <Entrada type="date" value={d.fecha} onChange={(e) => setD({ ...d, fecha: e.target.value })} />
            <Boton type="submit" variante="primario" icono={Plus} cargando={crear.isPending}>
              Anotar
            </Boton>
          </form>
        </Tarjeta>
      ) : null}
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data?.length === 0 ? <Vacio icono={Wallet} texto="Sin movimientos este mes." /> : null}
      <div className="space-y-1">
        {pgMov.visibles.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-borde bg-superficie px-3 py-2 text-sm">
            <span className="w-20 shrink-0 text-xs text-tenue">{new Date(`${m.fecha}T12:00:00`).toLocaleDateString(localeActual(), { day: "numeric", month: "short" })}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate">{m.descripcion || m.categoria}</p>
              <p className="text-xs text-tenue">
                {m.categoria}
                {m.iva !== null ? ` · IVA ${dinero(m.iva)}` : ""}
                {m.ticket ? (
                  <>
                    {" · "}
                    <a href={urlServidor(m.ticket)} target="_blank" rel="noreferrer" className="text-acento underline">
                      ver ticket
                    </a>
                  </>
                ) : null}
              </p>
            </div>
            <span className={cx("shrink-0 font-semibold", m.tipo === "ingreso" ? "text-ok" : "text-texto")}>
              {m.tipo === "ingreso" ? "+" : "-"}
              {dinero(m.monto)}
            </span>
            {puede ? <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={() => borrar.mutate(m.id)} /> : null}
          </div>
        ))}
      </div>
      {pgMov.paginas}
      <TicketConFoto abierto={ticket} alCerrar={() => setTicket(false)} />
    </div>
  );
}

// ---------------------------------------------------------------- suscripciones

function Suscripciones() {
  const puede = usePuede("finanzas_personales", "escritura");
  const q = useSuscripciones();
  const [editar, setEditar] = useState<Suscripcion | null>(null);
  const [d, setD] = useState({ nombre: "", monto: "", ciclo: "mensual" as Suscripcion["ciclo"], proximoCobro: hoyLocal(), avisarDias: "2" });
  const crear = useMutation({
    mutationFn: () => api("/api/finanzas-personales/suscripciones", { cuerpo: { ...d, monto: Number(d.monto), avisarDias: Number(d.avisarDias) } }),
    onSuccess: () => {
      setD({ ...d, nombre: "", monto: "" });
      refrescar();
    },
    onError: avisarError,
  });
  const cambiar = useMutation({
    mutationFn: ({ id, activa }: { id: string; activa: boolean }) => api(`/api/finanzas-personales/suscripciones/${id}`, { metodo: "PATCH", cuerpo: { activa } }),
    onSuccess: refrescar,
    onError: avisarError,
  });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/finanzas-personales/suscripciones/${id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });
  const dias = (f: string) => Math.round((Date.parse(`${f}T12:00:00`) - Date.now()) / 86_400_000);

  return (
    <div className="space-y-4">
      {q.data ? (
        <div className="grid grid-cols-2 gap-3">
          <Tarjeta>
            <p className="text-xs text-tenue">Pagas al mes</p>
            <p className="text-2xl font-bold">{dinero(q.data.totalMensual)}</p>
          </Tarjeta>
          <Tarjeta>
            <p className="text-xs text-tenue">Al año</p>
            <p className="text-2xl font-bold">{dinero(q.data.totalAnual)}</p>
          </Tarjeta>
        </div>
      ) : null}
      {puede ? (
        <Tarjeta titulo="Nueva suscripción" icono={Plus}>
          <form
            className="grid grid-cols-2 gap-2 md:grid-cols-6"
            onSubmit={(e) => {
              e.preventDefault();
              crear.mutate();
            }}
          >
            <Entrada className="col-span-2" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="Netflix, Spotify, VPS…" required maxLength={80} />
            <Entrada type="number" min={0} step="0.01" value={d.monto} onChange={(e) => setD({ ...d, monto: e.target.value })} placeholder="Monto" required />
            <Selector value={d.ciclo} onChange={(e) => setD({ ...d, ciclo: e.target.value as Suscripcion["ciclo"] })}>
              <option value="semanal">Semanal</option>
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </Selector>
            <Entrada type="date" value={d.proximoCobro} onChange={(e) => setD({ ...d, proximoCobro: e.target.value })} title="Próximo cobro" />
            <Boton type="submit" variante="primario" icono={Plus} cargando={crear.isPending}>
              Agregar
            </Boton>
          </form>
          <p className="mt-2 text-xs text-tenue">Te avisa {d.avisarDias} días antes y, el día del cobro, la anota sola como gasto.</p>
        </Tarjeta>
      ) : null}
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data?.suscripciones.length === 0 ? <Vacio icono={CalendarClock} texto="Agrega Netflix, Spotify, tu VPS… y sabrás cuánto pagas al mes." /> : null}
      <div className="space-y-2">
        {q.data?.suscripciones.map((s) => {
          const faltan = dias(s.proximoCobro);
          return (
            <div key={s.id} className={cx("flex flex-wrap items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-3", !s.activa && "opacity-60")}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.nombre}</p>
                <p className="text-xs text-tenue">
                  {dinero(s.monto)} {s.moneda} · {s.ciclo} · próximo cobro {new Date(`${s.proximoCobro}T12:00:00`).toLocaleDateString(localeActual(), { day: "numeric", month: "long" })}
                </p>
              </div>
              {s.activa ? <Insignia tono={faltan <= s.avisarDias ? "aviso" : "neutro"}>{faltan <= 0 ? "Hoy" : `En ${faltan} día${faltan === 1 ? "" : "s"}`}</Insignia> : <Insignia>Pausada</Insignia>}
              {puede ? (
                <>
                  <Interruptor activo={s.activa} alCambiar={(v) => cambiar.mutate({ id: s.id, activa: v })} etiqueta="" />
                  <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Editar suscripción" onClick={() => setEditar(s)} />
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label="Borrar"
                    onClick={async () => {
                      if (await confirmar({ titulo: "Borrar suscripción", mensaje: s.nombre, boton: "Borrar" })) borrar.mutate(s.id);
                    }}
                  />
                </>
              ) : null}
            </div>
          );
        })}
      </div>
      <EditarSuscripcion suscripcion={editar} alCerrar={() => setEditar(null)} />
    </div>
  );
}

// ---------------------------------------------------------------- Excel

function ExcelImportarExportar() {
  const puede = usePuede("finanzas_personales", "escritura");
  const input = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<FilaImportada[] | null>(null);
  const [omitidas, setOmitidas] = useState(0);
  const [leyendo, setLeyendo] = useState(false);
  const importar = useMutation({
    mutationFn: () => api<{ importados: number }>("/api/finanzas-personales/importar", { cuerpo: { filas } }),
    onSuccess: (r) => {
      avisar(`Listo: ${r.importados} movimientos importados`);
      setFilas(null);
      refrescar();
    },
    onError: avisarError,
  });

  const leer = async (archivo: File | undefined) => {
    if (!archivo) return;
    setLeyendo(true);
    try {
      const XLSX = await import("xlsx");
      const libro = XLSX.read(await archivo.arrayBuffer(), { cellDates: true });
      const hoja = libro.Sheets[libro.SheetNames[0]!]!;
      const crudas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "", raw: true });
      const r = interpretarFilas(crudas);
      setFilas(r.filas);
      setOmitidas(r.omitidas);
      if (!r.filas.length) avisar("No encontré columnas de fecha y monto. Revisa que la primera fila tenga los títulos.", "error");
    } catch (err) {
      avisarError(err);
    } finally {
      setLeyendo(false);
    }
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const todos = await api<Movimiento[]>("/api/finanzas-personales/movimientos");
    const hoja = XLSX.utils.json_to_sheet(todos.map((m) => ({ Fecha: m.fecha, Tipo: m.tipo, Monto: m.monto, Categoría: m.categoria, Concepto: m.descripcion })));
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Movimientos");
    XLSX.writeFile(libro, `mis-finanzas-${hoyLocal()}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Tarjeta titulo="Exportar a Excel" icono={Download}>
        <p className="mb-3 text-sm text-tenue">Baja todos tus movimientos en un archivo .xlsx que abre Excel.</p>
        <Boton icono={Download} onClick={() => void exportar().catch(avisarError)}>
          Exportar
        </Boton>
      </Tarjeta>
      {puede ? (
        <Tarjeta titulo="Importar tu Excel" icono={FileSpreadsheet}>
          <div className="space-y-3 text-sm">
            <p className="text-tenue">
              Sube tu .xlsx o .csv. La primera fila debe tener títulos como <b>Fecha</b>, <b>Monto</b> (o Importe, Cantidad), <b>Categoría</b>, <b>Concepto</b> y, si
              tienes, <b>Tipo</b> (gasto/ingreso). Si no hay tipo, los montos negativos cuentan como gastos; también sirven columnas separadas de <b>Gasto</b> e <b>Ingreso</b>.
            </p>
            <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => void leer(e.target.files?.[0]).finally(() => (e.target.value = ""))} />
            <Boton icono={Upload} cargando={leyendo} onClick={() => input.current?.click()}>
              Elegir archivo
            </Boton>
            {filas?.length ? (
              <>
                <p>
                  Encontré <b>{filas.length}</b> movimientos{omitidas ? ` (${omitidas} filas sin fecha o monto se saltaron)` : ""}. Así se ven los primeros:
                </p>
                <div className="overflow-x-auto rounded-xl border border-borde">
                  <table className="w-full text-xs">
                    <thead className="bg-tarjeta text-left">
                      <tr>
                        <th className="p-2">Fecha</th>
                        <th className="p-2">Tipo</th>
                        <th className="p-2">Monto</th>
                        <th className="p-2">Categoría</th>
                        <th className="p-2">Concepto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.slice(0, 8).map((f, i) => (
                        <tr key={i} className="border-t border-borde">
                          <td className="p-2">{f.fecha}</td>
                          <td className="p-2">{f.tipo}</td>
                          <td className="p-2">{dinero(f.monto)}</td>
                          <td className="p-2">{f.categoria}</td>
                          <td className="p-2">{f.descripcion}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <Boton variante="primario" icono={Upload} cargando={importar.isPending} onClick={() => importar.mutate()}>
                    Importar {filas.length}
                  </Boton>
                  <Boton variante="fantasma" onClick={() => setFilas(null)}>
                    Cancelar
                  </Boton>
                </div>
              </>
            ) : null}
          </div>
        </Tarjeta>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- página

export default function MisFinanzas() {
  const [pestana, setPestana] = useState<"resumen" | "movimientos" | "divididos" | "rendimientos" | "impuestos" | "suscripciones" | "excel">("resumen");
  const [mes, setMes] = useState(mesActual());
  const meses = useMemo(() => {
    const lista: string[] = [];
    const d = new Date();
    for (let i = 0; i < 24; i++) lista.push(new Date(d.getFullYear(), d.getMonth() - i, 15).toISOString().slice(0, 7));
    return lista;
  }, []);
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Mis finanzas"
        descripcion="Tus gastos, ingresos, presupuestos y suscripciones (es tuyo: cada cuenta ve solo lo suyo)."
        acciones={
          pestana === "resumen" || pestana === "movimientos" || pestana === "impuestos" ? (
            <div className="flex items-center gap-1">
              <Boton tamano="icono" variante="fantasma" icono={ChevronLeft} aria-label="Mes anterior" disabled={meses.indexOf(mes) >= meses.length - 1} onClick={() => setMes(meses[meses.indexOf(mes) + 1] ?? mes)} />
              <Selector className="max-w-[12rem]" value={mes} onChange={(e) => setMes(e.target.value)}>
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {nombreMes(m)}
                  </option>
                ))}
              </Selector>
              <Boton tamano="icono" variante="fantasma" icono={ChevronRight} aria-label="Mes siguiente" disabled={meses.indexOf(mes) <= 0} onClick={() => setMes(meses[meses.indexOf(mes) - 1] ?? mes)} />
            </div>
          ) : null
        }
      />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "resumen", texto: "Resumen" },
          { id: "movimientos", texto: "Movimientos" },
          { id: "divididos", texto: "Pagos divididos" },
          { id: "rendimientos", texto: "Rendimientos" },
          { id: "impuestos", texto: "Impuestos" },
          { id: "suscripciones", texto: "Suscripciones" },
          { id: "excel", texto: "Excel" },
        ]}
      />
      {pestana === "resumen" ? <ResumenMes mes={mes} /> : null}
      {pestana === "movimientos" ? <Movimientos mes={mes} /> : null}
      {pestana === "divididos" ? <PagosDivididos /> : null}
      {pestana === "rendimientos" ? <Rendimientos /> : null}
      {pestana === "impuestos" ? <Impuestos mes={mes} /> : null}
      {pestana === "suscripciones" ? <Suscripciones /> : null}
      {pestana === "excel" ? <ExcelImportarExportar /> : null}
    </div>
  );
}
