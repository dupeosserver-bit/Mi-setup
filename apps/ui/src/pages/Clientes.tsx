import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, BarChart3, Bell, CheckCircle2, CircleCheckBig, HandCoins, Plus, Save, Trash2, UserPlus, Users } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Modal, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { Iniciales } from "../components/boveda/comun";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtDinero, fmtFecha } from "../lib/formato";
import { localeActual } from "../lib/idioma";
import { useModoPagina } from "../lib/marco";

interface Cliente {
  id: string;
  nombre: string;
  contacto: string;
  notas: string;
}

interface Cobro {
  id: string;
  clienteId: string;
  cliente: string;
  concepto: string;
  monto: number;
  moneda: string;
  frecuencia: "mensual" | "trimestral" | "anual" | "unico";
  proximo: string;
  estado: "activo" | "pausado" | "completado" | "cancelado";
  vencido: boolean;
  ultimoPago: string | null;
}

interface Resumen {
  moneda: string;
  porMes: { mes: string; cobrado: number }[];
  cobradoMes: number;
  cobradoMesAnterior: number;
  porCobrar: { total: number; cobros: number };
  vencido: { total: number; clientes: number };
  clientesActivos: number;
  pausados: number;
}

const FRECUENCIA = { mensual: "Mensual", trimestral: "Trimestral", anual: "Anual", unico: "Pago único" } as const;
const MESES_FRECUENCIA = { mensual: 1, trimestral: 3, anual: 12, unico: 0 } as const;
const ESTADO = { activo: "Activo", pausado: "Pausado", completado: "Completado", cancelado: "Cancelado" } as const;
const suave = (variable: string, pct = 14) => `color-mix(in srgb, var(${variable}) ${pct}%, transparent)`;

function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha);
  const dia = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + meses);
  d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

function invalidar() {
  void queryClient.invalidateQueries({ queryKey: ["clientes"] });
  void queryClient.invalidateQueries({ queryKey: ["finanzas"] });
}

function NuevoCliente({ alTerminar }: { alTerminar: (id?: string) => void }) {
  const [d, setD] = useState({ nombre: "", contacto: "", notas: "" });
  const crear = useMutation({
    mutationFn: () => api<{ id?: string }>("/api/clientes", { cuerpo: d }),
    onSuccess: (r) => {
      invalidar();
      alTerminar(r.id);
    },
  });
  return (
    <form className="space-y-3" onSubmit={(e: FormEvent) => (e.preventDefault(), crear.mutate())}>
      <Campo etiqueta="Nombre">
        <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required />
      </Campo>
      <Campo etiqueta="Contacto (Discord, correo, teléfono)">
        <Entrada value={d.contacto} onChange={(e) => setD({ ...d, contacto: e.target.value })} />
      </Campo>
      <Campo etiqueta="Notas">
        <AreaTexto value={d.notas} onChange={(e) => setD({ ...d, notas: e.target.value })} />
      </Campo>
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" className="w-full" cargando={crear.isPending}>
        Guardar
      </Boton>
    </form>
  );
}

function Paso({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-tarjeta border border-borde bg-superficie p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-6 w-6 place-items-center rounded-full text-xs text-acento" style={{ background: suave("--acento", 18) }}>
          {n}
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function NuevoCobro({ clientes, alCerrar }: { clientes: Cliente[]; alCerrar: () => void }) {
  useModoPagina("completa");
  const [d, setD] = useState({ clienteId: clientes[0]?.id ?? "", concepto: "", monto: "", moneda: "MXN", frecuencia: "mensual" as Cobro["frecuencia"], proximo: new Date().toISOString().slice(0, 10), estado: "activo" as Cobro["estado"] });
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const crear = useMutation({
    mutationFn: () => api("/api/cobros", { cuerpo: { ...d, monto: Number(d.monto), proximo: new Date(`${d.proximo}T12:00:00`).toISOString() } }),
    onSuccess: () => {
      avisar("Cobro guardado");
      invalidar();
      alCerrar();
    },
  });
  const cliente = clientes.find((c) => c.id === d.clienteId);
  const fechas = useMemo(() => {
    const base = new Date(`${d.proximo}T12:00:00`);
    if (Number.isNaN(base.getTime())) return [];
    const salto = MESES_FRECUENCIA[d.frecuencia];
    return salto ? [0, 1, 2].map((i) => sumarMeses(base, salto * i)) : [base];
  }, [d.proximo, d.frecuencia]);
  const monto = Number(d.monto) || 0;
  const valido = Boolean(d.clienteId && d.concepto.trim() && monto > 0 && d.moneda.length === 3);

  return (
    <form className="flex min-h-0 flex-1 flex-col bg-fondo" onSubmit={(e: FormEvent) => (e.preventDefault(), valido && crear.mutate())}>
      <header className="flex items-center gap-2 border-b border-borde bg-superficie px-3 py-2">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} aria-label="Volver" onClick={alCerrar} />
        <div className="min-w-0 flex-1">
          <b className="block text-sm">Nuevo cobro</b>
          <small className="text-xs text-tenue">Negocio y cobros</small>
        </div>
        <Boton variante="fantasma" className="hidden sm:inline-flex" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante="primario" icono={Save} disabled={!valido} cargando={crear.isPending}>
          Guardar
        </Boton>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <Paso n={1} titulo="Cliente">
              <div className="flex flex-wrap gap-2">
                {clientes.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setD({ ...d, clienteId: c.id })}
                    className={cx("flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-sm", d.clienteId === c.id ? "border-acento text-texto" : "border-borde text-tenue hover:text-texto")}
                    style={d.clienteId === c.id ? { background: suave("--acento", 14) } : undefined}
                  >
                    <Iniciales texto={c.nombre} tam={26} />
                    <span className="max-w-[10rem] truncate">{c.nombre}</span>
                  </button>
                ))}
                <button type="button" onClick={() => setNuevoCliente(true)} className="flex items-center gap-2 rounded-xl border border-dashed border-borde px-3 py-1.5 text-sm text-tenue hover:text-texto">
                  <UserPlus className="h-4 w-4" />
                  Nuevo
                </button>
              </div>
            </Paso>
            <Paso n={2} titulo="Qué le cobras">
              <Campo etiqueta="Servidor o concepto">
                <Entrada value={d.concepto} onChange={(e) => setD({ ...d, concepto: e.target.value })} required placeholder="Servidor Survival 4 GB" />
              </Campo>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
                <Campo etiqueta="Monto">
                  <Entrada type="number" step="0.01" min="0.01" value={d.monto} onChange={(e) => setD({ ...d, monto: e.target.value })} required className="h-12 text-lg font-semibold" />
                </Campo>
                <Campo etiqueta="Moneda">
                  <Entrada value={d.moneda} onChange={(e) => setD({ ...d, moneda: e.target.value.toUpperCase() })} maxLength={3} className="h-12" />
                </Campo>
              </div>
            </Paso>
            <Paso n={3} titulo="Cada cuándo">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-tarjeta p-1 sm:grid-cols-4" role="radiogroup" aria-label="Frecuencia">
                {(Object.keys(FRECUENCIA) as Cobro["frecuencia"][]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={d.frecuencia === f}
                    onClick={() => setD({ ...d, frecuencia: f })}
                    className={cx("h-9 rounded-lg text-sm font-medium", d.frecuencia === f ? "bg-superficie text-texto" : "text-tenue hover:text-texto")}
                  >
                    {FRECUENCIA[f]}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Campo etiqueta="Próximo cobro">
                  <Entrada type="date" value={d.proximo} onChange={(e) => setD({ ...d, proximo: e.target.value })} required />
                </Campo>
                <Campo etiqueta="Estado">
                  <Selector value={d.estado} onChange={(e) => setD({ ...d, estado: e.target.value as Cobro["estado"] })}>
                    <option value="activo">Activo</option>
                    <option value="pausado">Pausado</option>
                  </Selector>
                </Campo>
              </div>
            </Paso>
            <Paso n={4} titulo="Avisos">
              <p className="flex items-start gap-2 text-sm text-tenue">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-acento" />
                Te avisamos 3 días antes y el día que vence. Al marcarlo como pagado se anota el ingreso y pasa a la siguiente fecha.
              </p>
            </Paso>
            <ErrorCaja error={crear.error} />
          </div>
          <aside className="min-w-0 space-y-3 lg:sticky lg:top-4 lg:self-start">
            <p className="text-xs text-tenue">Así queda en tu lista</p>
            <div className="space-y-3 rounded-tarjeta border border-borde bg-superficie p-4">
              <div className="flex items-center gap-3">
                <Iniciales texto={cliente?.nombre ?? "?"} tam={40} />
                <div className="min-w-0">
                  <b className="block truncate text-sm">{cliente?.nombre ?? "Elige un cliente"}</b>
                  <small className="block truncate text-xs text-tenue">{d.concepto || "Concepto"}</small>
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: suave("--acento", 10) }}>
                <small className="text-xs text-tenue">{FRECUENCIA[d.frecuencia]}</small>
                <b className="block text-2xl font-semibold tabular-nums">{d.moneda.length === 3 ? fmtDinero(monto, d.moneda) : monto.toLocaleString(localeActual())}</b>
              </div>
              <div className="space-y-1.5">
                <small className="text-xs text-tenue">{fechas.length > 1 ? "Próximos cobros" : "Fecha del cobro"}</small>
                {fechas.map((f, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-fondo px-3 py-2 text-sm">
                    <span>{f.toLocaleDateString(localeActual(), { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span className="text-xs text-tenue">{i === 0 ? (d.estado === "pausado" ? "Pausado" : "Por cobrar") : "Después"}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
      <Modal abierto={nuevoCliente} titulo="Nuevo cliente" alCerrar={() => setNuevoCliente(false)}>
        <NuevoCliente
          alTerminar={(id) => {
            setNuevoCliente(false);
            if (id) setD((x) => ({ ...x, clienteId: id }));
          }}
        />
      </Modal>
    </form>
  );
}

function Numero({ icono: Icono, titulo, valor, detalle, color }: { icono: typeof HandCoins; titulo: string; valor: string; detalle: string; color: string }) {
  return (
    <div className="min-w-0 rounded-tarjeta border border-borde bg-superficie p-4">
      <span className="mb-2 grid h-9 w-9 place-items-center rounded-xl" style={{ background: suave(color, 16), color: `var(${color})` }}>
        <Icono className="h-4 w-4" />
      </span>
      <small className="block truncate text-xs text-tenue">{titulo}</small>
      <b className="block truncate text-2xl font-semibold tabular-nums">{valor}</b>
      <small className="block truncate text-xs text-tenue">{detalle}</small>
    </div>
  );
}

function CobradoPorMes({ datos, moneda }: { datos: Resumen["porMes"]; moneda: string }) {
  const max = Math.max(1, ...datos.map((d) => d.cobrado));
  const nombre = (mes: string) => new Date(`${mes}-15T12:00:00`).toLocaleDateString(localeActual(), { month: "short" });
  return (
    <div className="flex h-44 items-end gap-2" role="img" aria-label="Cobrado por mes">
      {datos.map((d, i) => (
        <div key={d.mes} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${nombre(d.mes)} · ${fmtDinero(d.cobrado, moneda)}`}>
          {i === datos.length - 1 && d.cobrado ? <small className="whitespace-nowrap text-[10px] text-tenue">{fmtDinero(d.cobrado, moneda)}</small> : null}
          <div className="w-full max-w-10 rounded-t-[4px]" style={{ height: `${d.cobrado ? Math.max(3, (d.cobrado / max) * 100) : 0}%`, background: i === datos.length - 1 ? "var(--acento)" : suave("--acento", 45) }} />
          <small className="text-[10px] capitalize text-tenue">{nombre(d.mes)}</small>
        </div>
      ))}
    </div>
  );
}

export default function Clientes() {
  const puede = usePuede("clientes", "escritura");
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState<"cliente" | null>(null);
  const clientes = useQuery({ queryKey: ["clientes", "lista"], queryFn: () => api<Cliente[]>("/api/clientes") });
  const cobros = useQuery({ queryKey: ["clientes", "cobros"], queryFn: () => api<Cobro[]>("/api/cobros") });
  const resumen = useQuery({ queryKey: ["clientes", "resumen"], queryFn: () => api<Resumen>("/api/cobros/resumen?meses=6") });
  const pgCob = usePaginado(cobros.data, 10);
  const pgCli = usePaginado(clientes.data, 8);
  const abierto = params.get("nuevo") === "cobro";

  const ponerAbierto = (v: boolean) => {
    const p = new URLSearchParams(params);
    if (v) p.set("nuevo", "cobro");
    else p.delete("nuevo");
    setParams(p);
  };

  const pagar = async (c: Cobro) => {
    if (!(await confirmar({ titulo: "Marcar como pagado", mensaje: `${c.cliente} · ${c.concepto}: ${fmtDinero(c.monto, c.moneda)}. Se registrará el ingreso y el próximo cobro pasará a la siguiente fecha.`, boton: "Pagado" }))) return;
    try {
      await api(`/api/cobros/${c.id}/pagado`, { metodo: "POST" });
      avisar("Pago registrado");
      invalidar();
    } catch (err) {
      avisarError(err);
    }
  };

  if (abierto && puede && clientes.data) return <NuevoCobro clientes={clientes.data} alCerrar={() => ponerAbierto(false)} />;

  const r = resumen.data;
  const moneda = r?.moneda ?? "MXN";
  const cambio = r && r.cobradoMesAnterior ? Math.round(((r.cobradoMes - r.cobradoMesAnterior) / r.cobradoMesAnterior) * 100) : null;
  const mesActual = new Date().toLocaleDateString(localeActual(), { month: "long" });

  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Clientes y cobros"
        descripcion="Lo que te pagan tus clientes y lo que vence. Aviso automático 3 días antes y cuando vence."
        acciones={
          puede ? (
            <>
              <Boton icono={UserPlus} onClick={() => setModal("cliente")}>
                Nuevo cliente
              </Boton>
              <Boton variante="primario" icono={Plus} onClick={() => ponerAbierto(true)} disabled={!clientes.data?.length} title={clientes.data?.length ? undefined : "Primero agrega un cliente"}>
                Nuevo cobro
              </Boton>
            </>
          ) : null
        }
      />
      <ErrorCaja error={cobros.error ?? clientes.error ?? resumen.error} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero icono={CircleCheckBig} titulo={`Cobrado en ${mesActual}`} valor={fmtDinero(r?.cobradoMes ?? 0, moneda)} detalle={cambio === null ? "Este mes" : `${cambio >= 0 ? "+" : ""}${cambio} % contra el mes pasado`} color="--ok" />
        <Numero icono={HandCoins} titulo="Por cobrar" valor={fmtDinero(r?.porCobrar.total ?? 0, moneda)} detalle={`${r?.porCobrar.cobros ?? 0} cobros en 10 días`} color="--aviso" />
        <Numero icono={AlertCircle} titulo="Vencido" valor={fmtDinero(r?.vencido.total ?? 0, moneda)} detalle={`${r?.vencido.clientes ?? 0} cliente(s)`} color="--error" />
        <Numero icono={Users} titulo="Clientes activos" valor={String(r?.clientesActivos ?? 0)} detalle={`${r?.pausados ?? 0} pausado(s)`} color="--acento" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Tarjeta titulo="Próximos cobros" icono={HandCoins}>
          {cobros.isLoading ? <Cargando /> : null}
          {cobros.data?.length === 0 ? <Vacio icono={HandCoins} texto="Registra lo que te paga cada cliente." /> : null}
          <ul className="divide-y divide-borde">
            {pgCob.visibles.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                <Iniciales texto={c.cliente} tam={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {c.cliente} · <span className="font-normal text-tenue">{c.concepto}</span>
                  </p>
                  <p className="truncate text-xs text-tenue">
                    {FRECUENCIA[c.frecuencia]} · próximo {fmtFecha(c.proximo)}
                    {c.ultimoPago ? ` · último pago ${fmtFecha(c.ultimoPago)}` : ""}
                  </p>
                </div>
                <b className="tabular-nums">{fmtDinero(c.monto, c.moneda)}</b>
                {c.vencido ? <Insignia tono="peligro">Vencido</Insignia> : <Insignia tono={c.estado === "activo" ? "ok" : "neutro"}>{ESTADO[c.estado]}</Insignia>}
                {puede ? (
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    {c.estado === "activo" ? (
                      <Boton tamano="sm" icono={CheckCircle2} onClick={() => void pagar(c)}>
                        Pagado
                      </Boton>
                    ) : null}
                    <Selector
                      value={c.estado}
                      className="h-8 w-32 text-xs"
                      aria-label="Estado del cobro"
                      onChange={(e) => void api(`/api/cobros/${c.id}`, { metodo: "PATCH", cuerpo: { estado: e.target.value } }).then(invalidar, avisarError)}
                    >
                      <option value="activo">Activo</option>
                      <option value="pausado">Pausado</option>
                      <option value="completado">Completado</option>
                      <option value="cancelado">Cancelado</option>
                    </Selector>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {pgCob.paginas}
        </Tarjeta>
        <div className="min-w-0 space-y-4">
          <Tarjeta titulo="Cobrado por mes" icono={BarChart3}>
            {r ? <CobradoPorMes datos={r.porMes} moneda={moneda} /> : <Cargando />}
          </Tarjeta>
          <Tarjeta titulo="Clientes" icono={Users}>
            {clientes.data?.length === 0 ? <Vacio icono={Users} texto="Sin clientes todavía." /> : null}
            <ul className="space-y-1">
              {pgCli.visibles.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-tarjeta">
                  <Iniciales texto={c.nombre} tam={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{c.nombre}</p>
                    {c.contacto ? <p className="truncate text-xs text-tenue">{c.contacto}</p> : null}
                  </div>
                  {puede ? (
                    <Boton
                      tamano="icono"
                      variante="fantasma"
                      icono={Trash2}
                      aria-label="Borrar"
                      onClick={async () => {
                        if (await confirmar({ titulo: "Borrar cliente", mensaje: `¿Borrar a ${c.nombre} y sus cobros?`, boton: "Borrar" })) {
                          await api(`/api/clientes/${c.id}`, { metodo: "DELETE" }).catch(avisarError);
                          invalidar();
                        }
                      }}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            {pgCli.paginas}
          </Tarjeta>
        </div>
      </div>
      <Modal abierto={modal === "cliente"} titulo="Nuevo cliente" alCerrar={() => setModal(null)}>
        <NuevoCliente alTerminar={() => setModal(null)} />
      </Modal>
    </div>
  );
}
