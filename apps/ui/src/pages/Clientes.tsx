/** Clientes y cobros: próximos cobros, vencidos, marcar como pagado. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Plus, Receipt, Trash2, UserPlus, Users } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Modal, Selector, Tarjeta, Vacio, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtDinero, fmtFecha } from "../lib/formato";

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

const FRECUENCIA = { mensual: "Mensual", trimestral: "Trimestral", anual: "Anual", unico: "Pago único" } as const;

function NuevoCliente({ alTerminar }: { alTerminar: () => void }) {
  const [d, setD] = useState({ nombre: "", contacto: "", notas: "" });
  const crear = useMutation({
    mutationFn: () => api("/api/clientes", { cuerpo: d }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
      alTerminar();
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
      <Boton type="submit" variante="primario" className="w-full" cargando={crear.isPending}>Guardar</Boton>
    </form>
  );
}

function NuevoCobro({ clientes, alTerminar }: { clientes: Cliente[]; alTerminar: () => void }) {
  const [d, setD] = useState({ clienteId: clientes[0]?.id ?? "", concepto: "", monto: "", moneda: "MXN", frecuencia: "mensual" as Cobro["frecuencia"], proximo: new Date().toISOString().slice(0, 10) });
  const crear = useMutation({
    mutationFn: () => api("/api/cobros", { cuerpo: { ...d, monto: Number(d.monto), proximo: new Date(`${d.proximo}T12:00:00`).toISOString() } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["clientes"] });
      alTerminar();
    },
  });
  return (
    <form className="space-y-3" onSubmit={(e: FormEvent) => (e.preventDefault(), crear.mutate())}>
      <Campo etiqueta="Cliente">
        <Selector value={d.clienteId} onChange={(e) => setD({ ...d, clienteId: e.target.value })} required>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </Selector>
      </Campo>
      <Campo etiqueta="Servidor o concepto">
        <Entrada value={d.concepto} onChange={(e) => setD({ ...d, concepto: e.target.value })} required placeholder="Servidor Survival 4 GB" />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Monto">
          <Entrada type="number" step="0.01" min="0.01" value={d.monto} onChange={(e) => setD({ ...d, monto: e.target.value })} required />
        </Campo>
        <Campo etiqueta="Moneda">
          <Entrada value={d.moneda} onChange={(e) => setD({ ...d, moneda: e.target.value.toUpperCase() })} maxLength={3} />
        </Campo>
        <Campo etiqueta="Frecuencia">
          <Selector value={d.frecuencia} onChange={(e) => setD({ ...d, frecuencia: e.target.value as Cobro["frecuencia"] })}>
            {Object.entries(FRECUENCIA).map(([v, t]) => (
              <option key={v} value={v}>{t}</option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Próximo cobro">
          <Entrada type="date" value={d.proximo} onChange={(e) => setD({ ...d, proximo: e.target.value })} required />
        </Campo>
      </div>
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" className="w-full" cargando={crear.isPending}>Guardar</Boton>
    </form>
  );
}

export default function Clientes() {
  const puede = usePuede("clientes", "escritura");
  const [modal, setModal] = useState<"cliente" | "cobro" | null>(null);
  const clientes = useQuery({ queryKey: ["clientes", "lista"], queryFn: () => api<Cliente[]>("/api/clientes") });
  const cobros = useQuery({ queryKey: ["clientes", "cobros"], queryFn: () => api<Cobro[]>("/api/cobros") });

  const pagar = async (c: Cobro) => {
    if (!(await confirmar({ titulo: "Marcar como pagado", mensaje: `${c.cliente} · ${c.concepto}: ${fmtDinero(c.monto, c.moneda)}. Se registrará el ingreso y el próximo cobro pasará a la siguiente fecha.`, boton: "Pagado" }))) return;
    try {
      await api(`/api/cobros/${c.id}/pagado`, { metodo: "POST" });
      avisar("Pago registrado");
      await queryClient.invalidateQueries({ queryKey: ["clientes"] });
      await queryClient.invalidateQueries({ queryKey: ["finanzas"] });
    } catch (err) {
      avisarError(err);
    }
  };

  const activos = cobros.data?.filter((c) => c.estado === "activo") ?? [];
  const pendiente = activos.filter((c) => c.vencido).reduce((s, c) => s + c.monto, 0);

  return (
    <>
      <Encabezado
        titulo="Clientes y cobros"
        descripcion="Recordatorio automático 3 días antes y cuando un cobro vence."
        acciones={
          puede ? (
            <>
              <Boton icono={UserPlus} onClick={() => setModal("cliente")}>Cliente</Boton>
              <Boton variante="primario" icono={Plus} onClick={() => setModal("cobro")} disabled={!clientes.data?.length}>Cobro</Boton>
            </>
          ) : null
        }
      />
      <ErrorCaja error={cobros.error ?? clientes.error} />
      {cobros.isLoading ? <Cargando /> : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <Tarjeta titulo={`Cobros activos (${activos.length})${pendiente ? ` · vencido ${fmtDinero(pendiente)}` : ""}`} icono={Receipt}>
          {cobros.data?.length === 0 ? <Vacio icono={Receipt} texto="Registra lo que te paga cada cliente." /> : null}
          <ul className="space-y-2">
            {cobros.data?.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-fondo p-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{c.cliente} · {c.concepto}</p>
                  <p className="text-xs text-tenue">
                    {fmtDinero(c.monto, c.moneda)} · {FRECUENCIA[c.frecuencia]} · próximo {fmtFecha(c.proximo)}
                  </p>
                </div>
                {c.vencido ? <Insignia tono="peligro">Vencido</Insignia> : <Insignia tono={c.estado === "activo" ? "ok" : "neutro"}>{c.estado}</Insignia>}
                {puede && c.estado === "activo" ? <Boton tamano="sm" icono={CheckCircle2} onClick={() => void pagar(c)}>Pagado</Boton> : null}
                {puede ? (
                  <Selector
                    value={c.estado}
                    className="h-8 w-32 text-xs"
                    onChange={(e) => void api(`/api/cobros/${c.id}`, { metodo: "PATCH", cuerpo: { estado: e.target.value } }).then(() => queryClient.invalidateQueries({ queryKey: ["clientes"] }), avisarError)}
                  >
                    <option value="activo">Activo</option>
                    <option value="pausado">Pausado</option>
                    <option value="completado">Completado</option>
                    <option value="cancelado">Cancelado</option>
                  </Selector>
                ) : null}
              </li>
            ))}
          </ul>
        </Tarjeta>
        <Tarjeta titulo="Clientes" icono={Users}>
          {clientes.data?.length === 0 ? <Vacio icono={Users} texto="Sin clientes todavía." /> : null}
          <ul className="space-y-1">
            {clientes.data?.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-tarjeta">
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
                        await queryClient.invalidateQueries({ queryKey: ["clientes"] });
                      }
                    }}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </Tarjeta>
      </div>
      <Modal abierto={modal === "cliente"} titulo="Nuevo cliente" alCerrar={() => setModal(null)}>
        <NuevoCliente alTerminar={() => setModal(null)} />
      </Modal>
      <Modal abierto={modal === "cobro"} titulo="Nuevo cobro" alCerrar={() => setModal(null)}>
        {clientes.data ? <NuevoCobro clientes={clientes.data} alTerminar={() => setModal(null)} /> : null}
      </Modal>
    </>
  );
}
