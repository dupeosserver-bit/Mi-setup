/**
 * Mis finanzas: gastos e ingresos con categoría, presupuestos, suscripciones con
 * aviso antes del cobro, y tu Excel (importar y exportar).
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarClock, CreditCard, Download, FileSpreadsheet, FlaskConical, PiggyBank, Plus, ShieldAlert, Trash2, Upload, Wallet } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { copiarSeguro } from "../lib/boveda/utilidades";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { interpretarFilas, type FilaImportada } from "../lib/finanzas";

interface Movimiento {
  id: string;
  tipo: "gasto" | "ingreso";
  monto: number;
  categoria: string;
  descripcion: string;
  fecha: string;
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
                <Bar dataKey="ingresos" name="Ingresos" fill="#4ade80" radius={[6, 6, 0, 0]} />
                <Bar dataKey="gastos" name="Gastos" fill="#f87171" radius={[6, 6, 0, 0]} />
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

  return (
    <div className="space-y-4">
      {puede ? (
        <Tarjeta titulo="Anotar" icono={Plus}>
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
              <p className="text-xs text-tenue">{m.categoria}</p>
            </div>
            <span className={cx("shrink-0 font-semibold", m.tipo === "ingreso" ? "text-ok" : "text-texto")}>
              {m.tipo === "ingreso" ? "+" : "-"}
              {dinero(m.monto)}
            </span>
            {puede ? <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={() => borrar.mutate(m.id)} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tarjetas (billetera)

interface TarjetaBilletera {
  id: string;
  apodo: string;
  marca: string;
  ultimos4: string;
  tipo: "real" | "prueba";
  color: string;
  banco: string;
  numeroPrueba: string | null;
  vence: string | null;
  cvv: string | null;
  gastadoMes: number;
}
const MARCAS_REALES = [
  ["visa", "Visa"],
  ["mastercard", "Mastercard"],
  ["amex", "American Express"],
  ["otra", "Otra"],
] as const;
const MARCAS_PRUEBA = [
  ["visa", "Visa"],
  ["mastercard", "Mastercard"],
  ["amex", "American Express"],
  ["discover", "Discover"],
  ["jcb", "JCB"],
  ["diners", "Diners Club"],
] as const;
const COLORES_TARJETA = ["#6d28d9", "#0ea5e9", "#16a34a", "#e11d48", "#f59e0b", "#334155"];
const espaciado = (n: string) => n.replace(/(\d{4})(?=\d)/g, "$1 ");

function Plastico({ t }: { t: TarjetaBilletera }) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-4 text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${t.color}, #0f172a)` }}>
      <div className="flex items-start justify-between">
        <span className="text-xs uppercase tracking-wider opacity-80">{t.banco || t.marca}</span>
        {t.tipo === "prueba" ? <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-black">SOLO PRUEBAS</span> : <CreditCard className="h-5 w-5 opacity-80" />}
      </div>
      <p className="mt-5 font-mono text-lg tracking-widest">{t.tipo === "prueba" && t.numeroPrueba ? espaciado(t.numeroPrueba) : `•••• •••• •••• ${t.ultimos4}`}</p>
      <div className="mt-3 flex items-end justify-between text-xs">
        <span className="font-medium">{t.apodo}</span>
        {t.vence ? <span className="font-mono opacity-80">{t.vence}{t.cvv ? ` · CVV ${t.cvv}` : ""}</span> : <span className="opacity-70">Este mes: {dinero(t.gastadoMes)}</span>}
      </div>
    </div>
  );
}

function Tarjetas() {
  const puede = usePuede("finanzas_personales", "escritura");
  const q = useQuery({ queryKey: ["finanzas-personales", "tarjetas"], queryFn: () => api<{ aviso: string; tarjetas: TarjetaBilletera[] }>("/api/finanzas-personales/tarjetas") });
  const [nueva, setNueva] = useState(false);
  const [prueba, setPrueba] = useState(false);
  const [paga, setPaga] = useState<TarjetaBilletera | null>(null);
  const [f, setF] = useState({ apodo: "", marca: "visa", ultimos4: "", banco: "", color: COLORES_TARJETA[0]! });
  const [p, setP] = useState({ apodo: "", marca: "visa" });
  const [pago, setPago] = useState({ monto: "", concepto: "", categoria: "Otros", entiendo: false });
  const sugerencias = useCategorias("gasto");
  const refrescarTarjetas = () => {
    void queryClient.invalidateQueries({ queryKey: ["finanzas-personales", "tarjetas"] });
    refrescar();
  };
  const crear = useMutation({
    mutationFn: () => api("/api/finanzas-personales/tarjetas", { cuerpo: f }),
    onSuccess: () => {
      setNueva(false);
      setF({ apodo: "", marca: "visa", ultimos4: "", banco: "", color: COLORES_TARJETA[0]! });
      refrescarTarjetas();
    },
    onError: avisarError,
  });
  const crearPrueba = useMutation({
    mutationFn: () => api("/api/finanzas-personales/tarjetas/prueba", { cuerpo: p }),
    onSuccess: () => {
      setPrueba(false);
      refrescarTarjetas();
    },
    onError: avisarError,
  });
  const pagar = useMutation({
    mutationFn: () => api(`/api/finanzas-personales/tarjetas/${paga!.id}/pagar`, { cuerpo: { monto: Number(pago.monto), concepto: pago.concepto, categoria: pago.categoria.trim() || "Otros", confirmo: true } }),
    onSuccess: () => {
      avisar("Pago anotado en tus gastos");
      setPaga(null);
      setPago({ monto: "", concepto: "", categoria: "Otros", entiendo: false });
      refrescarTarjetas();
      void queryClient.invalidateQueries({ queryKey: ["finanzas-personales", "categorias"] });
    },
    onError: avisarError,
  });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/finanzas-personales/tarjetas/${id}`, { metodo: "DELETE" }), onSuccess: refrescarTarjetas, onError: avisarError });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3 rounded-tarjeta border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
        <p className="min-w-0 flex-1">
          <b>Billetera de registro:</b> aquí no se cobra dinero real. De tus tarjetas solo se guarda el apodo y los <b>últimos 4 dígitos</b>, y «Pagar» anota el gasto en tus finanzas para que veas cuánto gastas con cada una. Las tarjetas de prueba usan números públicos de prueba y sirven para probar tus páginas.
        </p>
      </div>
      {puede ? (
        <div className="flex flex-wrap gap-2">
          <Boton variante="primario" icono={CreditCard} onClick={() => setNueva(true)}>
            Agregar mi tarjeta
          </Boton>
          <Boton icono={FlaskConical} onClick={() => setPrueba(true)}>
            Crear tarjeta de prueba
          </Boton>
        </div>
      ) : null}
      {q.isLoading ? <Cargando /> : null}
      <ErrorCaja error={q.error} />
      {q.data?.tarjetas.length === 0 ? <Vacio icono={CreditCard} texto="Todavía no tienes tarjetas." /> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {q.data?.tarjetas.map((t) => (
          <div key={t.id} className="space-y-2">
            <Plastico t={t} />
            <div className="flex flex-wrap items-center gap-2 text-xs text-tenue">
              <span className="flex-1">Este mes: {dinero(t.gastadoMes)}</span>
              {t.tipo === "prueba" && t.numeroPrueba ? (
                <Boton tamano="sm" variante="fantasma" onClick={() => void copiarSeguro(t.numeroPrueba!, "Número de prueba copiado")}>
                  Copiar número
                </Boton>
              ) : null}
              {puede ? (
                <>
                  <Boton tamano="sm" variante="primario" onClick={() => setPaga(t)}>
                    Pagar
                  </Boton>
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label="Borrar tarjeta"
                    onClick={async () => {
                      if (await confirmar({ titulo: "Quitar tarjeta", mensaje: `${t.apodo} se quita de la billetera (tus gastos anotados se quedan).`, boton: "Quitar" })) borrar.mutate(t.id);
                    }}
                  />
                </>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <Modal abierto={nueva} titulo="Agregar mi tarjeta" alCerrar={() => setNueva(false)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <p className="rounded-xl bg-fondo p-2 text-xs text-tenue">Por tu seguridad, Mi Setup nunca pide ni guarda el número completo, el vencimiento ni el CVV de una tarjeta real.</p>
          <Campo etiqueta="Apodo">
            <Entrada value={f.apodo} onChange={(e) => setF({ ...f, apodo: e.target.value })} placeholder="Débito BBVA" maxLength={40} required />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Marca">
              <Selector value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })}>
                {MARCAS_REALES.map(([v, n]) => (
                  <option key={v} value={v}>
                    {n}
                  </option>
                ))}
              </Selector>
            </Campo>
            <Campo etiqueta="Últimos 4 dígitos">
              <Entrada inputMode="numeric" value={f.ultimos4} onChange={(e) => setF({ ...f, ultimos4: e.target.value.replace(/\D/g, "").slice(0, 4) })} placeholder="1234" required />
            </Campo>
          </div>
          <Campo etiqueta="Banco (opcional)">
            <Entrada value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} maxLength={40} />
          </Campo>
          <div className="flex gap-2">
            {COLORES_TARJETA.map((c) => (
              <button key={c} type="button" aria-label={`Color ${c}`} onClick={() => setF({ ...f, color: c })} className={cx("h-7 w-7 rounded-full border-2", f.color === c ? "border-white" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
          <Boton type="submit" variante="primario" cargando={crear.isPending} disabled={f.ultimos4.length !== 4 || !f.apodo.trim()}>
            Guardar tarjeta
          </Boton>
        </form>
      </Modal>

      <Modal abierto={prueba} titulo="Crear tarjeta de prueba" alCerrar={() => setPrueba(false)}>
        <div className="space-y-3">
          <p className="rounded-xl bg-amber-500/10 p-2 text-xs">
            Es una tarjeta <b>falsa</b> con un número público de pruebas de los procesadores de pago. Sirve para probar el pago de tus propias páginas y <b>no funciona para compras reales</b>.
          </p>
          <Campo etiqueta="Marca">
            <Selector value={p.marca} onChange={(e) => setP({ ...p, marca: e.target.value })}>
              {MARCAS_PRUEBA.map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Apodo (opcional)">
            <Entrada value={p.apodo} onChange={(e) => setP({ ...p, apodo: e.target.value })} placeholder="Prueba de mi tienda" maxLength={40} />
          </Campo>
          <Boton variante="primario" icono={FlaskConical} cargando={crearPrueba.isPending} onClick={() => crearPrueba.mutate()}>
            Crear
          </Boton>
        </div>
      </Modal>

      <Modal abierto={Boolean(paga)} titulo={paga ? `Pagar con ${paga.apodo}` : "Pagar"} alCerrar={() => setPaga(null)}>
        {paga ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (pago.entiendo && Number(pago.monto) > 0) pagar.mutate();
            }}
          >
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold">
                <ShieldAlert className="h-4 w-4 text-amber-400" /> Antes de confirmar
              </p>
              <p className="mt-1 text-xs">{q.data?.aviso}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Campo etiqueta="Monto">
                <Entrada type="number" min={0} step="0.01" value={pago.monto} onChange={(e) => setPago({ ...pago, monto: e.target.value })} required />
              </Campo>
              <Campo etiqueta="Concepto o categoría">
                <Entrada list="sugerencias-pago" value={pago.categoria} onChange={(e) => setPago({ ...pago, categoria: e.target.value })} maxLength={60} />
                <datalist id="sugerencias-pago">
                  {sugerencias.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Campo>
            </div>
            <Campo etiqueta="¿En qué es el pago?">
              <Entrada value={pago.concepto} onChange={(e) => setPago({ ...pago, concepto: e.target.value })} placeholder="Pago del plan de hosting" maxLength={200} required />
            </Campo>
            <p className="rounded-xl bg-fondo p-2 text-sm">
              Se anotará un <b>gasto de {dinero(Number(pago.monto) || 0)}</b> con {paga.apodo} (••{paga.ultimos4}) hoy.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={pago.entiendo} onChange={(e) => setPago({ ...pago, entiendo: e.target.checked })} />
              <span>Entiendo que no se cobra dinero real, solo se registra el gasto.</span>
            </label>
            <Boton type="submit" variante="primario" cargando={pagar.isPending} disabled={!pago.entiendo || !(Number(pago.monto) > 0) || !pago.concepto.trim()}>
              Registrar pago
            </Boton>
          </form>
        ) : null}
      </Modal>
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
  const [pestana, setPestana] = useState<"resumen" | "movimientos" | "tarjetas" | "suscripciones" | "excel">("resumen");
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
          pestana === "resumen" || pestana === "movimientos" ? (
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
          { id: "tarjetas", texto: "Tarjetas" },
          { id: "suscripciones", texto: "Suscripciones" },
          { id: "excel", texto: "Excel" },
        ]}
      />
      {pestana === "resumen" ? <ResumenMes mes={mes} /> : null}
      {pestana === "movimientos" ? <Movimientos mes={mes} /> : null}
      {pestana === "tarjetas" ? <Tarjetas /> : null}
      {pestana === "suscripciones" ? <Suscripciones /> : null}
      {pestana === "excel" ? <ExcelImportarExportar /> : null}
    </div>
  );
}
