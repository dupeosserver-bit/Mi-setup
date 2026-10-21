/**
 * Pagos divididos: un pago o suscripción entre varias personas (ej. el
 * internet de 590 entre 3). Se reparte en partes iguales, por monto o por
 * porcentaje; cada persona tiene su lista de lo que debe y se le puede mandar
 * un enlace o una imagen con su lista para cobrarle.
 */
import { repartir, repartirPorPorcentaje } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Copy, HandCoins, ImageIcon, Link2, MessageSquareText, Pencil, Plus, Sparkles, Trash2, UserPlus, Users, X } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { compartirConApps } from "../lib/compartir";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { guardarBlob } from "../lib/guardar";
import { imagenDeCobro } from "../lib/imagenCobro";
import { ResultadoNegociacion } from "./IaExtras";
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "./ui";

const dinero = (n: number, moneda = "MXN") => `${moneda === "MXN" ? "$" : `${moneda} `}${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["finanzas-personales"] });
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fechaCorta = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });

interface Cobro {
  id: string;
  pago: string;
  fecha: string;
  monto: number;
  estado: "pagado" | "pendiente" | "debe";
}
type Ciclo = "unico" | "semanal" | "mensual" | "anual";
type Modo = "igual" | "monto" | "porcentaje";
interface Persona {
  id: string;
  nombre: string;
  contacto: string;
  debe: number;
  pendiente: number;
  cobros: Cobro[];
  comparte?: { pagoId: string; pago: string; monto: number; porcentaje: number | null; ciclo: Ciclo; moneda: string; activo: boolean }[];
  enlace?: boolean;
}
interface PagoDividido {
  id: string;
  nombre: string;
  total: number;
  moneda: string;
  ciclo: Ciclo;
  proximo: string | null;
  notas: string;
  activo: boolean;
  modo?: Modo;
  miembros: { personaId: string; nombre: string; monto: number; porcentaje?: number | null }[];
}

const CICLOS: Record<Ciclo, string> = { unico: "Una vez", semanal: "Cada semana", mensual: "Cada mes", anual: "Cada año" };
const CICLO_CORTO: Record<Ciclo, string> = { unico: "una vez", semanal: "/semana", mensual: "/mes", anual: "/año" };
const TONO_ESTADO = { pagado: "ok", pendiente: "neutro", debe: "peligro" } as const;
const TEXTO_ESTADO = { pagado: "Pagado", pendiente: "Por pagar", debe: "Debe" } as const;

/** Texto para mandarle a la persona su lista (WhatsApp, mensaje…). */
function textoDePersona(p: Persona, enlace?: string): string {
  const pendientes = p.cobros.filter((c) => c.estado !== "pagado");
  if (!pendientes.length) return `Hola ${p.nombre}, estás al corriente. ¡Gracias!`;
  const lineas = pendientes.map((c) => `• ${c.pago} (${fechaCorta(c.fecha)}): ${dinero(c.monto)}${c.estado === "debe" ? " — vencido" : ""}`);
  return `Hola ${p.nombre}, esto es lo que va:\n${lineas.join("\n")}\nTotal: ${dinero(p.debe + p.pendiente)}${enlace ? `\n\nTu lista: ${enlace}` : ""}`;
}

async function compartirTexto(texto: string): Promise<void> {
  // Hoja de compartir del sistema (también en la app del celular); si no hay, se copia.
  const r = await compartirConApps({ titulo: "Pagos", texto }).catch(async () => {
    await navigator.clipboard.writeText(texto);
    return "copiado" as const;
  });
  if (r === "copiado") avisar("Copiado: pégalo en WhatsApp o donde quieras");
}

/** Imagen con su lista: se comparte (WhatsApp…) o, si no se puede, se guarda. */
async function compartirImagen(p: Persona): Promise<void> {
  const blob = await imagenDeCobro({ nombre: p.nombre, lineas: p.cobros, debe: p.debe, pendiente: p.pendiente });
  const nombre = `cuentas-${p.nombre.replace(/[^\p{L}\p{N}]+/gu, "-").toLowerCase()}.png`;
  const url = URL.createObjectURL(blob);
  try {
    const r = await compartirConApps({ titulo: `Cuentas de ${p.nombre}`, texto: textoDePersona(p), archivos: [{ url, nombre }] }).catch(() => "copiado" as const);
    if (r === "copiado") await guardarBlob(blob, nombre);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

interface MovimientoBase {
  id: string;
  tipo: "gasto" | "ingreso";
  monto: number;
  categoria: string;
  descripcion: string;
  fecha: string;
}
interface SuscripcionBase {
  id: string;
  nombre: string;
  monto: number;
  ciclo: "semanal" | "mensual" | "trimestral" | "anual";
  proximoCobro: string;
  activa: boolean;
}

/** Tomar los datos de un gasto que ya anotaste o de una suscripción que ya tienes. */
function TomarDe({ alElegir }: { alElegir: (d: { nombre: string; total: number; ciclo: Ciclo; primerCobro: string; notas: string }) => void }) {
  const [origen, setOrigen] = useState<"" | "movimiento" | "suscripcion">("");
  const movimientos = useQuery({
    queryKey: ["finanzas-personales", "movimientos", "para-dividir"],
    queryFn: () => api<MovimientoBase[]>("/api/finanzas-personales/movimientos"),
    enabled: origen === "movimiento",
    select: (l) => l.filter((m) => m.tipo === "gasto").slice(0, 60),
  });
  const suscripciones = useQuery({
    queryKey: ["finanzas-personales", "suscripciones"],
    queryFn: () => api<{ suscripciones: SuscripcionBase[] }>("/api/finanzas-personales/suscripciones"),
    enabled: origen === "suscripcion",
  });
  return (
    <div className="rounded-xl bg-fondo p-3">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <span className="mr-1 text-tenue">Tomar de:</span>
        {(
          [
            ["", "Escribirlo"],
            ["movimiento", "Un gasto que hice"],
            ["suscripcion", "Una suscripción"],
          ] as const
        ).map(([id, texto]) => (
          <button key={id} type="button" onClick={() => setOrigen(id)} className={cx("rounded-full border px-3 py-1", origen === id ? "border-acento bg-acento text-black" : "border-borde")}>
            {texto}
          </button>
        ))}
      </div>
      {origen === "movimiento" ? (
        <Selector
          className="mt-2"
          value=""
          onChange={(e) => {
            const m = movimientos.data?.find((x) => x.id === e.target.value);
            if (m) alElegir({ nombre: (m.descripcion || m.categoria).slice(0, 80), total: m.monto, ciclo: "unico", primerCobro: hoyLocal(), notas: `De tu gasto del ${fechaCorta(m.fecha)}` });
          }}
        >
          <option value="">{movimientos.isLoading ? "Cargando…" : movimientos.data?.length ? "Elige el gasto…" : "No tienes gastos anotados"}</option>
          {movimientos.data?.map((m) => (
            <option key={m.id} value={m.id}>
              {fechaCorta(m.fecha)} · {m.descripcion || m.categoria} · {dinero(m.monto)}
            </option>
          ))}
        </Selector>
      ) : null}
      {origen === "suscripcion" ? (
        <Selector
          className="mt-2"
          value=""
          onChange={(e) => {
            const s = suscripciones.data?.suscripciones.find((x) => x.id === e.target.value);
            if (!s) return;
            // Pagos divididos no tiene ciclo trimestral: se reparte cada mes la tercera parte.
            const trimestral = s.ciclo === "trimestral";
            alElegir({
              nombre: s.nombre.slice(0, 80),
              total: trimestral ? Math.round((s.monto / 3) * 100) / 100 : s.monto,
              ciclo: s.ciclo === "trimestral" ? "mensual" : s.ciclo,
              primerCobro: s.proximoCobro,
              notas: trimestral ? "Suscripción trimestral: se cobra la tercera parte cada mes" : "De tu suscripción",
            });
          }}
        >
          <option value="">{suscripciones.isLoading ? "Cargando…" : suscripciones.data?.suscripciones.length ? "Elige la suscripción…" : "No tienes suscripciones"}</option>
          {suscripciones.data?.suscripciones
            .filter((s) => s.activa)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre} · {dinero(s.monto)} {s.ciclo}
              </option>
            ))}
        </Selector>
      ) : null}
    </div>
  );
}

const MODOS: { id: Modo; texto: string }[] = [
  { id: "igual", texto: "Partes iguales" },
  { id: "monto", texto: "Por monto" },
  { id: "porcentaje", texto: "Por porcentaje" },
];

interface FilaPersona {
  nombre: string;
  contacto: string;
  monto: string;
  porcentaje: string;
}

/** Vista previa de cuánto le toca a cada quien (la misma regla que el servidor). */
export function vistaPreviaReparto(total: number, modo: Modo, incluirme: boolean, filas: { monto?: number; porcentaje?: number }[]): { montos: (number | null)[]; mia: number; error: string | null } {
  const n = filas.length;
  if (!n || !(total > 0)) return { montos: filas.map(() => null), mia: 0, error: null };
  const iguales = repartir(total, n + (incluirme ? 1 : 0));
  const suyas = iguales.slice(incluirme ? 1 : 0);
  if (modo === "igual") return { montos: suyas, mia: incluirme ? iguales[0]! : 0, error: null };
  if (modo === "monto") {
    const montos = filas.map((f, i) => f.monto ?? suyas[i]!);
    const suma = montos.reduce((a, b) => a + b, 0);
    const mia = Math.round((total - suma) * 100) / 100;
    return { montos, mia, error: mia < -0.005 ? `Las partes suman ${dinero(suma)}: más que el total` : null };
  }
  if (filas.some((f) => f.porcentaje === undefined)) return { montos: filas.map(() => null), mia: 0, error: "Pon el % de cada persona" };
  const pcts = filas.map((f) => f.porcentaje!);
  const suma = pcts.reduce((a, b) => a + b, 0);
  if (suma > 100.001) return { montos: filas.map(() => null), mia: 0, error: `Suman ${Math.round(suma * 100) / 100} %: no pueden pasar de 100 %` };
  if (!incluirme && Math.abs(suma - 100) > 0.001) return { montos: filas.map(() => null), mia: 0, error: `Suman ${Math.round(suma * 100) / 100} %: si tú no pagas deben sumar 100 %` };
  const partes = incluirme ? repartirPorPorcentaje(total, [100 - suma, ...pcts]) : [0, ...repartirPorPorcentaje(total, pcts)];
  return { montos: partes.slice(1), mia: partes[0]!, error: null };
}

function NuevoPagoDividido({ alCerrar, editar, contactos }: { alCerrar: () => void; editar?: PagoDividido; contactos?: Map<string, string> }) {
  const [f, setF] = useState(() =>
    editar
      ? { nombre: editar.nombre, total: String(editar.total), ciclo: editar.ciclo, primerCobro: editar.proximo ?? hoyLocal(), incluirme: editar.miembros.reduce((a, m) => a + m.monto, 0) < editar.total - 0.01, notas: editar.notas }
      : { nombre: "", total: "", ciclo: "mensual" as Ciclo, primerCobro: hoyLocal(), incluirme: true, notas: "" },
  );
  const [modo, setModo] = useState<Modo>(editar?.modo ?? "igual");
  const [personas, setPersonas] = useState<FilaPersona[]>(() =>
    editar
      ? editar.miembros.map((m) => ({ nombre: m.nombre, contacto: contactos?.get(m.personaId) ?? "", monto: String(m.monto), porcentaje: m.porcentaje ? String(m.porcentaje) : "" }))
      : [{ nombre: "", contacto: "", monto: "", porcentaje: "" }],
  );
  const validas = personas.filter((p) => p.nombre.trim());
  const numero = (t: string) => (t.trim() && Number(t) > 0 ? Number(t) : undefined);
  const previa = vistaPreviaReparto(
    Number(f.total) || 0,
    modo,
    f.incluirme,
    validas.map((p) => ({ monto: numero(p.monto), porcentaje: numero(p.porcentaje) })),
  );
  const cambiar = (i: number, cambio: Partial<FilaPersona>) => setPersonas(personas.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
  const crear = useMutation({
    mutationFn: () =>
      api(editar ? `/api/finanzas-personales/divididos/${editar.id}` : "/api/finanzas-personales/divididos", {
        metodo: editar ? "PUT" : "POST",
        cuerpo: {
          ...(editar ? { nombre: f.nombre, notas: f.notas, incluirme: f.incluirme } : f),
          modo,
          total: Number(f.total),
          personas: validas.map((p) => ({
            nombre: p.nombre.trim(),
            contacto: p.contacto.trim(),
            ...(modo === "monto" && numero(p.monto) ? { monto: numero(p.monto) } : {}),
            ...(modo === "porcentaje" && numero(p.porcentaje) ? { porcentaje: numero(p.porcentaje) } : {}),
          })),
        },
      }),
    onSuccess: () => {
      avisar(editar ? "Cambios guardados" : "Pago dividido creado");
      refrescar();
      alCerrar();
    },
    onError: avisarError,
  });
  return (
    <Modal abierto titulo={editar ? `Editar ${editar.nombre}` : "Dividir un pago"} alCerrar={alCerrar}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
      >
        {editar ? null : <TomarDe alElegir={(d) => setF((x) => ({ ...x, ...d, total: String(d.total) }))} />}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Campo etiqueta="¿Qué se paga?">
            <Entrada value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="Internet, Netflix, renta…" maxLength={80} required />
          </Campo>
          <Campo etiqueta="Total">
            <Entrada type="number" inputMode="decimal" min={0} step="0.01" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Se cobra">
            <Selector disabled={Boolean(editar)} value={f.ciclo} onChange={(e) => setF({ ...f, ciclo: e.target.value as Ciclo })}>
              {Object.entries(CICLOS).map(([id, texto]) => (
                <option key={id} value={id}>
                  {texto}
                </option>
              ))}
            </Selector>
          </Campo>
          <Campo etiqueta="Primera fecha de pago">
            <Entrada type="date" disabled={Boolean(editar)} value={f.primerCobro} onChange={(e) => setF({ ...f, primerCobro: e.target.value })} required />
          </Campo>
        </div>
        <Interruptor activo={f.incluirme} alCambiar={(v) => setF({ ...f, incluirme: v })} etiqueta="Yo también pago una parte" />
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">¿Cómo se reparte?</p>
            <Pestanas valor={modo} alCambiar={setModo} opciones={MODOS} />
          </div>
          {personas.map((p, i) => {
            const k = validas.indexOf(p);
            const toca = k >= 0 ? previa.montos[k] : null;
            return (
              <div key={i} className="space-y-1 rounded-xl border border-borde p-2">
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  <Entrada value={p.nombre} onChange={(e) => cambiar(i, { nombre: e.target.value })} placeholder="Nombre (ej. mi hermana)" maxLength={60} aria-label="Nombre" />
                  <Entrada value={p.contacto} onChange={(e) => cambiar(i, { contacto: e.target.value })} placeholder="Teléfono (opcional)" maxLength={120} aria-label="Teléfono" />
                </div>
                <div className="flex items-center gap-2">
                  {modo === "monto" ? (
                    <Entrada
                      className="w-32"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={p.monto}
                      onChange={(e) => cambiar(i, { monto: e.target.value })}
                      placeholder={toca !== null && toca !== undefined ? String(toca) : "Monto"}
                      aria-label="Monto (vacío = parte igual)"
                    />
                  ) : null}
                  {modo === "porcentaje" ? (
                    <div className="flex items-center gap-1">
                      <Entrada className="w-24" type="number" inputMode="decimal" min={0} max={100} step="0.01" value={p.porcentaje} onChange={(e) => cambiar(i, { porcentaje: e.target.value })} placeholder="%" aria-label="Porcentaje" />
                      <span className="text-sm text-tenue">%</span>
                    </div>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate text-sm text-tenue">{toca !== null && toca !== undefined ? `Le toca ${dinero(toca)}` : ""}</span>
                  <Boton type="button" tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar persona" onClick={() => setPersonas(personas.filter((_, j) => j !== i))} disabled={personas.length === 1} />
                </div>
              </div>
            );
          })}
          <Boton type="button" tamano="sm" variante="secundario" icono={UserPlus} onClick={() => setPersonas([...personas, { nombre: "", contacto: "", monto: "", porcentaje: "" }])}>
            Agregar persona
          </Boton>
          <div className="rounded-xl bg-fondo p-2 text-sm">
            {previa.error ? <p className="text-peligro">{previa.error}</p> : f.incluirme ? <p>Tu parte: <b>{dinero(previa.mia)}</b></p> : <p className="text-tenue">Tú no pagas: se reparte todo entre ellos.</p>}
            {modo === "monto" ? <p className="text-xs text-tenue">Si dejas un monto vacío, a esa persona le toca la parte igual.</p> : null}
            {modo === "porcentaje" ? <p className="text-xs text-tenue">Ej. 40 % tu hermana mayor y 30 % la chica: el 30 % que falta es tuyo.</p> : null}
          </div>
        </div>
        <Boton type="submit" variante="primario" cargando={crear.isPending} disabled={!f.nombre.trim() || !(Number(f.total) > 0) || !validas.length || Boolean(previa.error)}>
          {editar ? "Guardar cambios" : "Crear"}
        </Boton>
        {editar ? <p className="text-xs text-tenue">Si quitas a alguien se borran sus cobros sin pagar de este pago; lo que ya pagó se queda en su historial.</p> : null}
      </form>
    </Modal>
  );
}

/** Enlace de solo lectura para que la persona vea su lista sin cuenta. */
function EnlaceCobro({ p, alCerrar }: { p: Persona; alCerrar: () => void }) {
  const q = useQuery({ queryKey: ["finanzas-personales", "enlace", p.id], queryFn: () => api<{ activo: boolean; url?: string }>(`/api/finanzas-personales/divididos/personas/${p.id}/enlace`) });
  const crear = useMutation({
    mutationFn: (nuevo: boolean) => api<{ activo: boolean; url: string }>(`/api/finanzas-personales/divididos/personas/${p.id}/enlace`, { cuerpo: { nuevo } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["finanzas-personales"] }),
    onError: avisarError,
  });
  const quitar = useMutation({
    mutationFn: () => api(`/api/finanzas-personales/divididos/personas/${p.id}/enlace`, { metodo: "DELETE" }),
    onSuccess: () => {
      avisar("El enlace ya no sirve");
      void queryClient.invalidateQueries({ queryKey: ["finanzas-personales"] });
    },
    onError: avisarError,
  });
  const url = crear.data?.url ?? q.data?.url;
  return (
    <Modal abierto titulo={`Enlace para ${p.nombre}`} alCerrar={alCerrar} ancho="max-w-md">
      <div className="space-y-3 text-sm">
        <p className="text-tenue">Con este enlace {p.nombre} ve solo su lista de lo que debe (sin entrar a Mi Setup). No ve nada más de tus finanzas.</p>
        {q.isLoading ? <Cargando /> : null}
        {url ? (
          <>
            <Entrada readOnly value={url} onFocus={(e) => e.target.select()} />
            <div className="flex flex-wrap gap-2">
              <Boton variante="primario" icono={MessageSquareText} onClick={() => void compartirTexto(textoDePersona(p, url))}>
                Mandar
              </Boton>
              <Boton icono={Copy} onClick={() => void navigator.clipboard.writeText(url).then(() => avisar("Enlace copiado"))}>
                Copiar
              </Boton>
              <Boton variante="fantasma" onClick={() => crear.mutate(true)} cargando={crear.isPending}>
                Hacer uno nuevo
              </Boton>
              <Boton variante="peligro" icono={X} onClick={() => quitar.mutate()} cargando={quitar.isPending}>
                Desactivar
              </Boton>
            </div>
          </>
        ) : q.data ? (
          <Boton variante="primario" icono={Link2} cargando={crear.isPending} onClick={() => crear.mutate(false)}>
            Crear enlace
          </Boton>
        ) : null}
      </div>
    </Modal>
  );
}

/** Cambiar el nombre o el teléfono de una persona, o quitarla de todo. */
function EditarPersona({ p, alCerrar }: { p: Persona; alCerrar: () => void }) {
  const [f, setF] = useState({ nombre: p.nombre, contacto: p.contacto });
  const guardar = useMutation({
    mutationFn: () => api(`/api/finanzas-personales/divididos/personas/${p.id}`, { metodo: "PATCH", cuerpo: { nombre: f.nombre.trim(), contacto: f.contacto.trim() } }),
    onSuccess: () => {
      avisar("Guardado");
      refrescar();
      alCerrar();
    },
    onError: avisarError,
  });
  const quitar = useMutation({
    mutationFn: () => api(`/api/finanzas-personales/divididos/personas/${p.id}`, { metodo: "DELETE" }),
    onSuccess: () => {
      avisar(`${p.nombre} ya no está en tus pagos divididos`);
      refrescar();
      alCerrar();
    },
    onError: avisarError,
  });
  return (
    <Modal abierto titulo={`Editar a ${p.nombre}`} alCerrar={alCerrar} ancho="max-w-sm">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <Campo etiqueta="Nombre">
          <Entrada value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} maxLength={60} required />
        </Campo>
        <Campo etiqueta="Teléfono o contacto">
          <Entrada value={f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.value })} maxLength={120} />
        </Campo>
        <div className="flex flex-wrap justify-between gap-2">
          <Boton
            type="button"
            variante="peligro"
            icono={Trash2}
            cargando={quitar.isPending}
            onClick={() =>
              void confirmar({ titulo: `¿Quitar a ${p.nombre}?`, mensaje: "Sale de todos los pagos que comparte y se borra su lista de cobros.", boton: "Quitar" }).then((ok) => ok && quitar.mutate())
            }
          >
            Quitar persona
          </Boton>
          <Boton type="submit" variante="primario" cargando={guardar.isPending} disabled={!f.nombre.trim()}>
            Guardar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}

export function PagosDivididos() {
  const puede = usePuede("finanzas_personales", "escritura");
  const q = useQuery({ queryKey: ["finanzas-personales", "divididos"], queryFn: () => api<{ hoy: string; pagos: PagoDividido[]; personas: Persona[] }>("/api/finanzas-personales/divididos") });
  const [nuevo, setNuevo] = useState(false);
  const [editarPago, setEditarPago] = useState<PagoDividido | null>(null);
  const [editarPersona, setEditarPersona] = useState<Persona | null>(null);
  const [enlaceDe, setEnlaceDe] = useState<Persona | null>(null);
  const [vista, setVista] = useState<"personas" | "pagos">("personas");
  const [abierta, setAbierta] = useState<string | null>(null);
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
  const totalPorCobrar = d.personas.reduce((a, p) => a + p.pendiente, 0);
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
      </div>
      {d.personas.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-borde bg-superficie p-3">
            <p className="text-xs text-tenue">Te deben (vencido)</p>
            <p className={cx("text-lg font-bold", totalDeben > 0 ? "text-peligro" : "")}>{dinero(totalDeben)}</p>
          </div>
          <div className="rounded-xl border border-borde bg-superficie p-3">
            <p className="text-xs text-tenue">Por cobrar pronto</p>
            <p className="text-lg font-bold">{dinero(totalPorCobrar)}</p>
          </div>
          <div className="col-span-2 rounded-xl border border-borde bg-superficie p-3 sm:col-span-1">
            <p className="text-xs text-tenue">Pagos compartidos</p>
            <p className="text-lg font-bold">{d.pagos.filter((p) => p.activo).length}</p>
          </div>
        </div>
      ) : null}
      {!d.pagos.length ? <Vacio icono={Users} texto="Divide el internet, Netflix o la renta: cada persona tiene su lista y ves quién te debe." /> : null}

      {vista === "personas" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {d.personas.map((p) => (
            <Tarjeta
              key={p.id}
              titulo={p.nombre}
              acciones={
                <div className="flex gap-1">
                  {puede ? <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Editar o quitar persona" onClick={() => setEditarPersona(p)} /> : null}
                  {puede ? <Boton tamano="icono" variante="fantasma" icono={Link2} aria-label="Enlace para cobrarle" onClick={() => setEnlaceDe(p)} /> : null}
                  <Boton tamano="icono" variante="fantasma" icono={ImageIcon} aria-label="Mandarle una imagen con su lista" onClick={() => void compartirImagen(p).catch(avisarError)} />
                  <Boton tamano="icono" variante="fantasma" icono={MessageSquareText} aria-label="Mandarle su lista en texto" onClick={() => void compartirTexto(textoDePersona(p))} />
                </div>
              }
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {p.debe > 0 ? <Insignia tono="peligro">Debe {dinero(p.debe)}</Insignia> : <Insignia tono="ok">Al corriente</Insignia>}
                {p.pendiente > 0 ? <Insignia>Por pagar {dinero(p.pendiente)}</Insignia> : null}
                {p.enlace ? <Insignia>Con enlace</Insignia> : null}
                {p.contacto ? <span className="text-xs text-tenue">{p.contacto}</span> : null}
              </div>
              {p.comparte?.length ? (
                <div className="mb-2 rounded-xl bg-fondo p-2">
                  <p className="mb-1 text-xs text-tenue">Comparte</p>
                  <ul className="space-y-0.5 text-sm">
                    {p.comparte.map((c) => (
                      <li key={c.pagoId} className={cx("flex items-center justify-between gap-2", !c.activo && "opacity-50")}>
                        <span className="min-w-0 truncate">{c.pago}</span>
                        <span className="shrink-0 text-tenue">
                          {dinero(c.monto, c.moneda)} {CICLO_CORTO[c.ciclo]}
                          {c.porcentaje ? ` · ${c.porcentaje} %` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="space-y-1">
                {[...p.cobros]
                  .reverse()
                  .slice(0, abierta === p.id ? 36 : 5)
                  .map((c) => (
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
                {p.cobros.length > 5 ? (
                  <button type="button" className="w-full py-1 text-center text-xs text-tenue hover:text-texto" onClick={() => setAbierta(abierta === p.id ? null : p.id)}>
                    {abierta === p.id ? "Ver menos" : `Ver todo (${p.cobros.length})`}
                  </button>
                ) : null}
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
                    <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Editar pago y personas" onClick={() => setEditarPago(p)} />
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
                {p.modo === "porcentaje" ? " · por porcentaje" : p.modo === "igual" ? " · partes iguales" : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-1">
                {p.miembros.map((m) => (
                  <Insignia key={m.personaId}>
                    {m.nombre}: {dinero(m.monto, p.moneda)}
                    {m.porcentaje ? ` (${m.porcentaje} %)` : ""}
                  </Insignia>
                ))}
                {(() => {
                  const mia = Math.round((p.total - p.miembros.reduce((a, m) => a + m.monto, 0)) * 100) / 100;
                  return mia > 0 ? <Insignia tono="ok">Tú: {dinero(mia, p.moneda)}</Insignia> : null;
                })()}
              </div>
            </Tarjeta>
          ))}
        </div>
      )}
      {nuevo ? <NuevoPagoDividido alCerrar={() => setNuevo(false)} /> : null}
      {editarPago ? <NuevoPagoDividido editar={editarPago} contactos={new Map(d.personas.map((p) => [p.id, p.contacto]))} alCerrar={() => setEditarPago(null)} /> : null}
      {editarPersona ? <EditarPersona p={editarPersona} alCerrar={() => setEditarPersona(null)} /> : null}
      {enlaceDe ? <EnlaceCobro p={enlaceDe} alCerrar={() => setEnlaceDe(null)} /> : null}
      <Modal abierto={Boolean(cobrar.data)} titulo="Mensaje para cobrar" alCerrar={() => cobrar.reset()}>
        {cobrar.data ? <ResultadoNegociacion r={cobrar.data} /> : null}
      </Modal>
    </div>
  );
}
