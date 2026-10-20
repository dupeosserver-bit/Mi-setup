/**
 * Mis finanzas, parte 2: ticket con foto (la IA lo lee), impuestos (calculadora
 * de IVA, ISR y RESICO + IVA de tus tickets) y pagos divididos entre personas.
 */
import { ANIO_TARIFA_ISR, agregarIva, isrMensual, isrResico, quitarIva, repartir } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Check, Copy, HandCoins, Plus, Receipt, Share2, Sparkles, Trash2, UserPlus, Users, X } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { ResultadoNegociacion } from "./IaExtras";
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "./ui";

const dinero = (n: number, moneda = "MXN") => `${moneda === "MXN" ? "$" : `${moneda} `}${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["finanzas-personales"] });
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

// ---------------------------------------------------------------- ticket con foto

interface Propuesta {
  tienda: string;
  fecha: string | null;
  total: number;
  iva: number | null;
  moneda: string;
  categoria: string;
  conceptos: { nombre: string; monto: number }[];
}

/** Toma la foto del ticket (o elígela), la IA la lee y tú confirmas el gasto. */
export function TicketConFoto({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [f, setF] = useState({ monto: "", categoria: "Otros", descripcion: "", fecha: hoyLocal(), iva: "" });
  const [conceptos, setConceptos] = useState<Propuesta["conceptos"]>([]);

  const cerrar = () => {
    if (vista) URL.revokeObjectURL(vista);
    setVista(null);
    setArchivo(null);
    setConceptos([]);
    setF({ monto: "", categoria: "Otros", descripcion: "", fecha: hoyLocal(), iva: "" });
    alCerrar();
  };

  const leer = useMutation({
    mutationFn: (foto: File) => {
      const fd = new FormData();
      fd.append("archivo", foto);
      return api<{ archivo: string; propuesta: Propuesta }>("/api/finanzas-personales/ticket/leer", { formulario: fd });
    },
    onSuccess: (r) => {
      setArchivo(r.archivo);
      const p = r.propuesta;
      setConceptos(p.conceptos);
      setF({
        monto: p.total ? String(p.total) : "",
        categoria: p.categoria || "Otros",
        descripcion: p.tienda,
        fecha: p.fecha ?? hoyLocal(),
        iva: p.iva === null ? (p.total ? String(quitarIva(p.total).iva) : "") : String(p.iva),
      });
    },
    onError: avisarError,
  });

  const guardar = useMutation({
    mutationFn: () =>
      api("/api/finanzas-personales/ticket/guardar", {
        cuerpo: { archivo, monto: Number(f.monto), categoria: f.categoria.trim() || "Otros", descripcion: f.descripcion, fecha: f.fecha, iva: f.iva === "" ? null : Number(f.iva) },
      }),
    onSuccess: () => {
      avisar("Gasto guardado con su ticket");
      refrescar();
      cerrar();
    },
    onError: avisarError,
  });

  return (
    <Modal abierto={abierto} titulo="Gasto con ticket" alCerrar={cerrar}>
      <div className="space-y-3">
        <input
          ref={entrada}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const foto = e.target.files?.[0];
            e.target.value = "";
            if (!foto) return;
            if (vista) URL.revokeObjectURL(vista);
            setVista(URL.createObjectURL(foto));
            leer.mutate(foto);
          }}
        />
        {vista ? (
          <img src={vista} alt="Ticket" className="mx-auto max-h-64 rounded-xl border border-borde object-contain" />
        ) : (
          <button type="button" onClick={() => entrada.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-borde p-8 text-sm text-tenue hover:bg-tarjeta">
            <Camera className="h-8 w-8" />
            Toma la foto del ticket (o elígela de tu galería)
          </button>
        )}
        {leer.isPending ? <p className="text-center text-sm text-tenue">Leyendo el ticket…</p> : null}
        {vista && !leer.isPending ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              guardar.mutate();
            }}
          >
            <p className="rounded-xl bg-fondo p-2 text-xs text-tenue">Revisa lo que leyó la IA y corrige lo que haga falta antes de guardar.</p>
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Total pagado">
                <Entrada type="number" min={0} step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} required />
              </Campo>
              <Campo etiqueta="IVA (si viene)">
                <Entrada type="number" min={0} step="0.01" value={f.iva} onChange={(e) => setF({ ...f, iva: e.target.value })} />
              </Campo>
              <Campo etiqueta="Tienda o concepto">
                <Entrada value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} maxLength={300} />
              </Campo>
              <Campo etiqueta="Categoría">
                <Entrada value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })} maxLength={60} />
              </Campo>
              <Campo etiqueta="Fecha">
                <Entrada type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} required />
              </Campo>
            </div>
            {conceptos.length ? (
              <details className="rounded-xl border border-borde p-2 text-sm">
                <summary className="cursor-pointer text-tenue">Lo que viene en el ticket ({conceptos.length})</summary>
                <ul className="mt-2 space-y-1">
                  {conceptos.map((c, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span className="truncate">{c.nombre}</span>
                      <span className="shrink-0">{dinero(c.monto)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Boton type="submit" variante="primario" icono={Check} cargando={guardar.isPending} disabled={!(Number(f.monto) > 0)}>
                Guardar gasto
              </Boton>
              <Boton type="button" variante="secundario" icono={Camera} onClick={() => entrada.current?.click()}>
                Otra foto
              </Boton>
            </div>
          </form>
        ) : null}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- impuestos

function Fila({ texto, valor, fuerte }: { texto: string; valor: string; fuerte?: boolean }) {
  return (
    <div className={cx("flex justify-between gap-2 text-sm", fuerte && "font-semibold")}>
      <span className="text-tenue">{texto}</span>
      <span>{valor}</span>
    </div>
  );
}

export function Impuestos({ mes }: { mes: string }) {
  const [calc, setCalc] = useState<"iva" | "sueldo" | "resico">("iva");
  const [monto, setMonto] = useState("1000");
  const [tasa, setTasa] = useState("0.16");
  const [incluye, setIncluye] = useState(true);
  const q = useQuery({
    queryKey: ["finanzas-personales", "impuestos", mes],
    queryFn: () => api<{ ivaPagado: number; ivaCobrado: number; conTicket: number; ingresos: number; gastos: number }>(`/api/finanzas-personales/impuestos?mes=${mes}`),
  });
  const n = Number(monto) || 0;
  const iva = incluye ? quitarIva(n, Number(tasa)) : agregarIva(n, Number(tasa));
  const sueldo = isrMensual(n);
  const resico = isrResico(n);
  return (
    <div className="space-y-4">
      <Tarjeta titulo="Este mes según tus movimientos" icono={Receipt}>
        <ErrorCaja error={q.error} />
        {q.data ? (
          <div className="space-y-1">
            <Fila texto="IVA que pagaste (tickets)" valor={dinero(q.data.ivaPagado)} />
            <Fila texto="IVA que cobraste" valor={dinero(q.data.ivaCobrado)} />
            <Fila texto="Gastos con ticket" valor={String(q.data.conTicket)} />
            <Fila texto="Ingresos del mes" valor={dinero(q.data.ingresos)} />
            <Fila texto="ISR aproximado si fuera sueldo" valor={dinero(isrMensual(q.data.ingresos).isr)} />
            <p className="pt-2 text-xs text-tenue">Para que cuente el IVA, guarda tus gastos con «Gasto con ticket» o escribe el IVA al anotarlo.</p>
          </div>
        ) : (
          <Cargando />
        )}
      </Tarjeta>
      <Tarjeta titulo="Calculadora">
        <Pestanas
          valor={calc}
          alCambiar={setCalc}
          opciones={[
            { id: "iva", texto: "IVA" },
            { id: "sueldo", texto: "ISR de sueldo" },
            { id: "resico", texto: "RESICO" },
          ]}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo etiqueta={calc === "iva" ? "Cantidad" : "Ingreso del mes"}>
            <Entrada type="number" min={0} step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Campo>
          {calc === "iva" ? (
            <>
              <Campo etiqueta="Tasa">
                <Selector value={tasa} onChange={(e) => setTasa(e.target.value)}>
                  <option value="0.16">16 % (general)</option>
                  <option value="0.08">8 % (frontera)</option>
                  <option value="0">0 %</option>
                </Selector>
              </Campo>
              <div className="flex items-end pb-2">
                <Interruptor activo={incluye} alCambiar={setIncluye} etiqueta="La cantidad ya trae IVA" />
              </div>
            </>
          ) : null}
        </div>
        <div className="mt-3 space-y-1 rounded-xl bg-fondo p-3">
          {calc === "iva" ? (
            <>
              <Fila texto="Subtotal" valor={dinero(iva.subtotal)} />
              <Fila texto="IVA" valor={dinero(iva.iva)} />
              <Fila texto="Total" valor={dinero(iva.total)} fuerte />
            </>
          ) : null}
          {calc === "sueldo" ? (
            <>
              <Fila texto="ISR del mes" valor={dinero(sueldo.isr)} />
              <Fila texto="Tasa efectiva" valor={`${sueldo.tasaEfectiva} %`} />
              <Fila texto="Te queda" valor={dinero(sueldo.neto)} fuerte />
              <p className="pt-2 text-xs text-tenue">Tarifa mensual del art. 96 de la LISR ({ANIO_TARIFA_ISR}). No incluye subsidio al empleo, IMSS ni otras deducciones.</p>
            </>
          ) : null}
          {calc === "resico" ? (
            resico ? (
              <>
                <Fila texto="Tasa" valor={`${resico.tasa} %`} />
                <Fila texto="ISR del mes" valor={dinero(resico.isr)} fuerte />
                <p className="pt-2 text-xs text-tenue">RESICO personas físicas: la tasa va de 1 % a 2.5 % según lo que ganes al mes.</p>
              </>
            ) : (
              <p className="text-sm text-aviso">Con más de 3.5 millones al año ya no se puede estar en RESICO.</p>
            )
          ) : null}
        </div>
        <p className="mt-3 text-xs text-tenue">Es una guía rápida; para declarar, confirma con el SAT o con tu contador.</p>
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------- pagos divididos

interface Cobro {
  id: string;
  pago: string;
  fecha: string;
  monto: number;
  estado: "pagado" | "pendiente" | "debe";
}
interface Persona {
  id: string;
  nombre: string;
  contacto: string;
  debe: number;
  pendiente: number;
  cobros: Cobro[];
}
interface PagoDividido {
  id: string;
  nombre: string;
  total: number;
  moneda: string;
  ciclo: "unico" | "semanal" | "mensual" | "anual";
  proximo: string | null;
  notas: string;
  activo: boolean;
  miembros: { personaId: string; nombre: string; monto: number }[];
}

const CICLOS: Record<PagoDividido["ciclo"], string> = { unico: "Una vez", semanal: "Cada semana", mensual: "Cada mes", anual: "Cada año" };
const TONO_ESTADO = { pagado: "ok", pendiente: "neutro", debe: "peligro" } as const;
const TEXTO_ESTADO = { pagado: "Pagado", pendiente: "Por pagar", debe: "Debe" } as const;

/** Texto para mandarle a la persona su lista (WhatsApp, mensaje…). */
function textoDePersona(p: Persona): string {
  const pendientes = p.cobros.filter((c) => c.estado !== "pagado");
  if (!pendientes.length) return `Hola ${p.nombre}, estás al corriente. ¡Gracias!`;
  const lineas = pendientes.map((c) => `• ${c.pago} (${fechaCorta(c.fecha)}): ${dinero(c.monto)}${c.estado === "debe" ? " — vencido" : ""}`);
  return `Hola ${p.nombre}, esto es lo que va:\n${lineas.join("\n")}\nTotal: ${dinero(p.debe + p.pendiente)}`;
}

async function compartirTexto(texto: string): Promise<void> {
  if (navigator.share) {
    try {
      await navigator.share({ text: texto });
      return;
    } catch {
      /* canceló o no se pudo: se copia */
    }
  }
  await navigator.clipboard.writeText(texto);
  avisar("Copiado: pégalo en WhatsApp o donde quieras");
}

function NuevoPagoDividido({ alCerrar }: { alCerrar: () => void }) {
  const [f, setF] = useState({ nombre: "", total: "", ciclo: "mensual" as PagoDividido["ciclo"], primerCobro: hoyLocal(), incluirme: true, notas: "" });
  const [personas, setPersonas] = useState<{ nombre: string; contacto: string; monto: string }[]>([{ nombre: "", contacto: "", monto: "" }]);
  const validas = personas.filter((p) => p.nombre.trim());
  const partes = repartir(Number(f.total) || 0, validas.length + (f.incluirme ? 1 : 0));
  const sugerido = (i: number) => partes[i + (f.incluirme ? 1 : 0)] ?? 0;
  const crear = useMutation({
    mutationFn: () =>
      api("/api/finanzas-personales/divididos", {
        cuerpo: {
          ...f,
          total: Number(f.total),
          personas: validas.map((p) => ({ nombre: p.nombre.trim(), contacto: p.contacto.trim(), ...(p.monto ? { monto: Number(p.monto) } : {}) })),
        },
      }),
    onSuccess: () => {
      avisar("Pago dividido creado");
      refrescar();
      alCerrar();
    },
    onError: avisarError,
  });
  return (
    <Modal abierto titulo="Dividir un pago" alCerrar={alCerrar}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="¿Qué se paga?">
            <Entrada value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Netflix, renta, internet…" maxLength={80} required />
          </Campo>
          <Campo etiqueta="Total">
            <Entrada type="number" min={0} step="0.01" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Se cobra">
            <Selector value={f.ciclo} onChange={(e) => setF({ ...f, ciclo: e.target.value as PagoDividido["ciclo"] })}>
              {Object.entries(CICLOS).map(([id, texto]) => (
                <option key={id} value={id}>
                  {texto}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Primera fecha de pago">
            <Entrada type="date" value={f.primerCobro} onChange={(e) => setF({ ...f, primerCobro: e.target.value })} required />
          </Campo>
        </div>
        <Interruptor activo={f.incluirme} alCambiar={(v) => setF({ ...f, incluirme: v })} etiqueta="Yo también pago una parte" />
        <div className="space-y-2">
          <p className="text-sm font-medium">Personas</p>
          {personas.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_6rem_auto] gap-1">
              <Entrada value={p.nombre} onChange={(e) => setPersonas(personas.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} placeholder="Nombre" maxLength={60} />
              <Entrada value={p.contacto} onChange={(e) => setPersonas(personas.map((x, j) => (j === i ? { ...x, contacto: e.target.value } : x)))} placeholder="Teléfono (opcional)" maxLength={120} />
              <Entrada
                type="number"
                min={0}
                step="0.01"
                value={p.monto}
                onChange={(e) => setPersonas(personas.map((x, j) => (j === i ? { ...x, monto: e.target.value } : x)))}
                placeholder={p.nombre.trim() ? String(sugerido(validas.indexOf(p))) : "Monto"}
                aria-label="Monto (vacío = partes iguales)"
              />
              <Boton type="button" tamano="icono" variante="fantasma" icono={X} aria-label="Quitar" onClick={() => setPersonas(personas.filter((_, j) => j !== i))} disabled={personas.length === 1} />
            </div>
          ))}
          <Boton type="button" tamano="sm" variante="secundario" icono={UserPlus} onClick={() => setPersonas([...personas, { nombre: "", contacto: "", monto: "" }])}>
            Agregar persona
          </Boton>
          <p className="text-xs text-tenue">Si dejas el monto vacío, se reparte en partes iguales{f.incluirme ? " contándote a ti" : ""}.</p>
        </div>
        <Boton type="submit" variante="primario" cargando={crear.isPending} disabled={!f.nombre.trim() || !(Number(f.total) > 0) || !validas.length}>
          Crear
        </Boton>
      </form>
    </Modal>
  );
}

export function PagosDivididos() {
  const puede = usePuede("finanzas_personales", "escritura");
  const q = useQuery({ queryKey: ["finanzas-personales", "divididos"], queryFn: () => api<{ hoy: string; pagos: PagoDividido[]; personas: Persona[] }>("/api/finanzas-personales/divididos") });
  const [nuevo, setNuevo] = useState(false);
  const [vista, setVista] = useState<"personas" | "pagos">("personas");
  const marcar = useMutation({
    mutationFn: ({ id, pagado }: { id: string; pagado: boolean }) => api(`/api/finanzas-personales/divididos/cobros/${id}`, { cuerpo: { pagado } }),
    onSuccess: refrescar,
    onError: avisarError,
  });
  const saldar = useMutation({
    mutationFn: (id: string) => api<{ marcados: number }>(`/api/finanzas-personales/divididos/personas/${id}/saldar`, { metodo: "POST" }),
    onSuccess: (r) => {
      avisar(r.marcados ? `Marcados ${r.marcados} como pagados` : "No había nada vencido");
      refrescar();
    },
    onError: avisarError,
  });
  const puedeIa = usePuede("ia", "escritura");
  const cobrar = useMutation({
    mutationFn: (p: Persona) =>
      api<Parameters<typeof ResultadoNegociacion>[0]["r"]>("/api/ia/negociar", {
        cuerpo: {
          tipo: "me_deben",
          situacion: `${p.nombre} me debe ${dinero(p.debe)} de pagos compartidos: ${p.cobros
            .filter((c) => c.estado === "debe")
            .map((c) => `${c.pago} (${fechaCorta(c.fecha)}, ${dinero(c.monto)})`)
            .join(", ")}. Quiero recordárselo sin pelear.`,
          con: p.nombre,
          monto: dinero(p.debe),
          tono: "amable",
          medio: "whatsapp",
        },
      }),
    onError: avisarError,
  });
  const pausar = useMutation({
    mutationFn: (p: PagoDividido) => api(`/api/finanzas-personales/divididos/${p.id}`, { metodo: "PATCH", cuerpo: { activo: !p.activo } }),
    onSuccess: refrescar,
    onError: avisarError,
  });
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/api/finanzas-personales/divididos/${id}`, { metodo: "DELETE" }),
    onSuccess: refrescar,
    onError: avisarError,
  });

  if (q.isLoading) return <Cargando />;
  if (q.error) return <ErrorCaja error={q.error} />;
  const d = q.data!;
  const totalDeben = d.personas.reduce((a, p) => a + p.debe, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {puede ? (
          <Boton variante="primario" icono={Plus} onClick={() => setNuevo(true)}>
            Dividir un pago
          </Boton>
        ) : null}
        <Pestanas
          valor={vista}
          alCambiar={setVista}
          opciones={[
            { id: "personas", texto: "Por persona" },
            { id: "pagos", texto: "Pagos" },
          ]}
        />
        {totalDeben > 0 ? <Insignia tono="peligro">Te deben {dinero(totalDeben)}</Insignia> : null}
      </div>
      {!d.pagos.length ? <Vacio icono={Users} texto="Divide Netflix, la renta o lo que compartas: cada persona tiene su lista y ves quién te debe." /> : null}

      {vista === "personas" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {d.personas.map((p) => (
            <Tarjeta
              key={p.id}
              titulo={p.nombre}
              acciones={
                <div className="flex gap-1">
                  <Boton tamano="icono" variante="fantasma" icono={Share2} aria-label="Mandarle su lista" onClick={() => void compartirTexto(textoDePersona(p))} />
                  <Boton tamano="icono" variante="fantasma" icono={Copy} aria-label="Copiar su lista" onClick={() => void navigator.clipboard.writeText(textoDePersona(p)).then(() => avisar("Copiado"))} />
                </div>
              }
            >
              <div className="mb-2 flex flex-wrap gap-2">
                {p.debe > 0 ? <Insignia tono="peligro">Debe {dinero(p.debe)}</Insignia> : <Insignia tono="ok">Al corriente</Insignia>}
                {p.pendiente > 0 ? <Insignia>Por pagar {dinero(p.pendiente)}</Insignia> : null}
                {p.contacto ? <span className="text-xs text-tenue">{p.contacto}</span> : null}
              </div>
              <div className="space-y-1">
                {[...p.cobros].reverse().slice(0, 12).map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-xl bg-fondo px-2 py-1.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{c.pago}</p>
                      <p className="text-xs text-tenue">{fechaCorta(c.fecha)}</p>
                    </div>
                    <span className="shrink-0">{dinero(c.monto)}</span>
                    <Insignia tono={TONO_ESTADO[c.estado]}>{TEXTO_ESTADO[c.estado]}</Insignia>
                    {puede ? (
                      <Boton
                        tamano="icono"
                        variante="fantasma"
                        icono={c.estado === "pagado" ? X : Check}
                        aria-label={c.estado === "pagado" ? "Marcar como no pagado" : "Marcar como pagado"}
                        onClick={() => marcar.mutate({ id: c.id, pagado: c.estado !== "pagado" })}
                      />
                    ) : null}
                  </div>
                ))}
              </div>
              {puede && p.debe > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Boton tamano="sm" variante="secundario" icono={HandCoins} onClick={() => saldar.mutate(p.id)}>
                    Me pagó todo lo vencido
                  </Boton>
                  {puedeIa ? (
                    <Boton tamano="sm" variante="fantasma" icono={Sparkles} cargando={cobrar.isPending && cobrar.variables?.id === p.id} onClick={() => cobrar.mutate(p)}>
                      Mensaje para cobrar
                    </Boton>
                  ) : null}
                </div>
              ) : null}
            </Tarjeta>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {d.pagos.map((p) => (
            <Tarjeta
              key={p.id}
              titulo={p.nombre}
              acciones={
                puede ? (
                  <div className="flex items-center gap-2">
                    <Interruptor activo={p.activo} alCambiar={() => pausar.mutate(p)} etiqueta={p.activo ? "Activo" : "Pausado"} />
                    <Boton
                      tamano="icono"
                      variante="fantasma"
                      icono={Trash2}
                      aria-label="Borrar"
                      onClick={() => void confirmar({ titulo: `¿Borrar ${p.nombre}?`, mensaje: "Se borran también sus cobros.", peligroso: true }).then((ok) => ok && borrar.mutate(p.id))}
                    />
                  </div>
                ) : null
              }
            >
              <p className="text-sm">
                {dinero(p.total, p.moneda)} · {CICLOS[p.ciclo]}
                {p.proximo ? ` · próximo ${fechaCorta(p.proximo)}` : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.miembros.map((m) => (
                  <Insignia key={m.personaId}>
                    {m.nombre}: {dinero(m.monto, p.moneda)}
                  </Insignia>
                ))}
              </div>
            </Tarjeta>
          ))}
        </div>
      )}
      {nuevo ? <NuevoPagoDividido alCerrar={() => setNuevo(false)} /> : null}
      <Modal abierto={Boolean(cobrar.data)} titulo="Mensaje para cobrar" alCerrar={() => cobrar.reset()}>
        {cobrar.data ? <ResultadoNegociacion r={cobrar.data} /> : null}
      </Modal>
    </div>
  );
}
