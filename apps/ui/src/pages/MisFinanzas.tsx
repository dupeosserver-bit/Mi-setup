/**
 * Mis finanzas: gastos e ingresos con categoría, presupuestos, suscripciones con
 * aviso antes del cobro, y tu Excel (importar y exportar).
 */
import { Rendimientos } from "../components/Rendimientos";
import { COLOR_GASTOS, COLOR_INGRESOS, GastosSemana, TendenciaFinanzas } from "../components/FinanzasGraficas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, Camera, Download, FileSpreadsheet, PiggyBank, Plus, Trash2, Upload, Wallet } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api, urlServidor } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { interpretarFilas, type FilaImportada } from "../lib/finanzas";
import { Impuestos, PagosDivididos, TicketConFoto } from "../components/FinanzasExtra";

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
const dinero = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const mesActual = () => new Date().toISOString().slice(0, 7);
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const nombreMes = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("es-MX", { month: "long", year: "numeric" });
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
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tarjeta>
          <p className="text-xs text-tenue">Ingresos</p>
          <p className="text-2xl font-bold text-ok">{dinero(r.ingresos)}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-xs text-tenue">Gastos</p>
          <p className="text-2xl font-bold text-peligro">{dinero(r.gastos)}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="text-xs text-tenue">Te queda</p>
          <p className={cx("text-2xl font-bold", r.balance >= 0 ? "text-ok" : "text-peligro")}>{dinero(r.balance)}</p>
        </Tarjeta>
      </div>
      <GastosSemana />
      <TendenciaFinanzas />
      <Tarjeta titulo="¿En qué se va?" icono={PiggyBank}>
        {!r.porCategoria.length ? <Vacio texto="Sin gastos este mes." /> : null}
        <div className="space-y-3">
          {r.porCategoria.map((c) => {
            const pct = c.presupuesto ? Math.min(100, (c.gastado / c.presupuesto) * 100) : null;
            return (
              <div key={c.categoria}>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{c.categoria}</span>
                  <span className="text-tenue">
                    {dinero(c.gastado)}
                    {c.presupuesto ? ` de ${dinero(c.presupuesto)}` : ""}
                    {puede ? (
                      <button type="button" className="ml-2 text-xs underline" onClick={() => setPresupuesto({ categoria: c.categoria, limite: c.presupuesto ? String(c.presupuesto) : "" })}>
                        {c.presupuesto ? "cambiar límite" : "poner límite"}
                      </button>
                    ) : null}
                  </span>
                </div>
                {pct !== null ? (
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-tarjeta">
                    <div className={cx("h-full", pct >= 100 ? "bg-peligro" : pct >= 80 ? "bg-aviso" : "bg-ok")} style={{ width: `${pct}%` }} />
                  </div>
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
      {r.ultimosMeses.length > 1 ? (
        <Tarjeta titulo="Últimos meses">
          <div className="h-56 w-full">
            <ResponsiveContainer>
              <BarChart data={r.ultimosMeses}>
                <CartesianGrid strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={60} />
                <Tooltip formatter={(v: number) => dinero(v)} contentStyle={{ background: "#1e1e1e", border: "1px solid #333", borderRadius: 12 }} />
                <Legend />
                <Bar dataKey="ingresos" name="Ingresos" fill={COLOR_INGRESOS} radius={[4, 4, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill={COLOR_GASTOS} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Tarjeta>
      ) : null}
    </div>
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
        {q.data?.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-xl border border-borde bg-superficie px-3 py-2 text-sm">
            <span className="w-20 shrink-0 text-xs text-tenue">{new Date(`${m.fecha}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</span>
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
      <TicketConFoto abierto={ticket} alCerrar={() => setTicket(false)} />
    </div>
  );
}

// ---------------------------------------------------------------- suscripciones

function Suscripciones() {
  const puede = usePuede("finanzas_personales", "escritura");
  const q = useQuery({
    queryKey: ["finanzas-personales", "suscripciones"],
    queryFn: () => api<{ suscripciones: Suscripcion[]; totalMensual: number; totalAnual: number }>("/api/finanzas-personales/suscripciones"),
  });
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
                  {dinero(s.monto)} {s.moneda} · {s.ciclo} · próximo cobro {new Date(`${s.proximoCobro}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long" })}
                </p>
              </div>
              {s.activa ? <Insignia tono={faltan <= s.avisarDias ? "aviso" : "neutro"}>{faltan <= 0 ? "Hoy" : `En ${faltan} día${faltan === 1 ? "" : "s"}`}</Insignia> : <Insignia>Pausada</Insignia>}
              {puede ? (
                <>
                  <Interruptor activo={s.activa} alCambiar={(v) => cambiar.mutate({ id: s.id, activa: v })} etiqueta="" />
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
            <Selector className="max-w-[12rem]" value={mes} onChange={(e) => setMes(e.target.value)}>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {nombreMes(m)}
                </option>
              ))}
            </Selector>
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
