/**
 * Mis finanzas, parte 2: ticket con foto (la IA lo lee), impuestos (calculadora
 * de IVA, ISR y RESICO + IVA de tus tickets). Pagos divididos está en PagosDivididos.tsx.
 */
import { ANIO_TARIFA_ISR, agregarIva, isrMensual, isrResico, quitarIva } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Camera, Check, Receipt } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Interruptor, Modal, Pestanas, Selector, Tarjeta, avisar, avisarError, cx } from "./ui";

const dinero = (n: number, moneda = "MXN") => `${moneda === "MXN" ? "$" : `${moneda} `}${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["finanzas-personales"] });
const hoyLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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

export { PagosDivididos } from "./PagosDivididos";
