/** Recordatorios con fecha, hora y repetición; avisos push a todos los dispositivos. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bell, Check, Pencil, Plus, Repeat, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Modal, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { aInputLocal, fmtFechaHora } from "../lib/formato";

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

const REPETICION: Record<Recordatorio["repeticion"], string> = {
  nunca: "Una vez",
  diario: "Cada día",
  semanal: "Cada semana",
  mensual: "Cada mes",
};

function Formulario({ inicial, alTerminar }: { inicial: Recordatorio | null; alTerminar: () => void }) {
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
  return (
    <form
      className="space-y-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <Campo etiqueta="Título">
        <Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={200} autoFocus />
      </Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo etiqueta="Fecha y hora">
          <Entrada type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </Campo>
        <Campo etiqueta="Repetir">
          <Selector value={repeticion} onChange={(e) => setRepeticion(e.target.value as Recordatorio["repeticion"])}>
            {Object.entries(REPETICION).map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </Selector>
        </Campo>
      </div>
      <Campo etiqueta="Notas (opcional)">
        <AreaTexto value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={2000} />
      </Campo>
      <ErrorCaja error={guardar.error} />
      <div className="flex justify-end gap-2">
        <Boton variante="fantasma" onClick={alTerminar}>
          Cancelar
        </Boton>
        <Boton type="submit" variante="primario" cargando={guardar.isPending}>
          Guardar
        </Boton>
      </div>
    </form>
  );
}

export default function Recordatorios() {
  const [params, setParams] = useSearchParams();
  const puedeEditar = usePuede("recordatorios", "escritura");
  const [editando, setEditando] = useState<Recordatorio | null | "nuevo">(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["recordatorios"], queryFn: () => api<Recordatorio[]>("/api/recordatorios") });

  useEffect(() => {
    if (params.get("nuevo") && puedeEditar) {
      setEditando("nuevo");
      setParams({}, { replace: true });
    }
  }, [params, puedeEditar, setParams]);

  const cambiar = async (r: Recordatorio, cuerpo: Partial<Recordatorio>) => {
    await api(`/api/recordatorios/${r.id}`, { metodo: "PATCH", cuerpo }).catch(avisarError);
    await queryClient.invalidateQueries({ queryKey: ["recordatorios"] });
  };

  const pendientes = data?.filter((r) => !r.completado) ?? [];
  const hechos = data?.filter((r) => r.completado) ?? [];
  const ahora = Date.now();

  const fila = (r: Recordatorio) => (
    <li key={r.id} className="flex items-start gap-3 rounded-xl bg-fondo p-3">
      {puedeEditar ? (
        <button
          type="button"
          aria-label={r.completado ? "Marcar pendiente" : "Completar"}
          onClick={() => void cambiar(r, { completado: !r.completado })}
          className={cx("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border", r.completado ? "border-ok bg-ok text-black" : "border-borde")}
        >
          {r.completado ? <Check className="h-3 w-3" /> : null}
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className={cx("text-sm font-medium", r.completado && "text-tenue line-through")}>{r.titulo}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-tenue">
          {fmtFechaHora(r.fecha)}
          {r.repeticion !== "nunca" ? (
            <span className="inline-flex items-center gap-1">
              <Repeat className="h-3 w-3" /> {REPETICION[r.repeticion]}
            </span>
          ) : null}
          {!r.completado && new Date(r.fecha).getTime() < ahora ? <Insignia tono="aviso">vencido</Insignia> : null}
          {r.creadoPor === "ia" ? (
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> IA
            </span>
          ) : null}
        </p>
        {r.notas ? <p className="mt-1 whitespace-pre-wrap text-xs text-tenue">{r.notas}</p> : null}
      </div>
      {puedeEditar ? (
        <div className="flex shrink-0">
          {r.completado ? (
            <Boton tamano="icono" variante="fantasma" icono={Undo2} onClick={() => void cambiar(r, { completado: false })} aria-label="Reabrir" />
          ) : (
            <Boton tamano="icono" variante="fantasma" icono={Pencil} onClick={() => setEditando(r)} aria-label="Editar" />
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

  return (
    <>
      <Encabezado
        titulo="Recordatorios"
        descripcion="Llegan como aviso push a todos tus dispositivos (ntfy)."
        acciones={puedeEditar ? <Boton variante="primario" icono={Plus} onClick={() => setEditando("nuevo")}>Nuevo</Boton> : null}
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo={`Pendientes (${pendientes.length})`} icono={Bell}>
          {pendientes.length ? <ul className="space-y-2">{pendientes.map(fila)}</ul> : <Vacio icono={Bell} texto="Nada pendiente." />}
        </Tarjeta>
        <Tarjeta titulo={`Completados (${hechos.length})`} icono={Check}>
          {hechos.length ? <ul className="space-y-2">{hechos.slice(0, 50).map(fila)}</ul> : <Vacio icono={Check} texto="Aún no completas ninguno." />}
        </Tarjeta>
      </div>
      <Modal abierto={editando !== null} titulo={editando === "nuevo" ? "Nuevo recordatorio" : "Editar recordatorio"} alCerrar={() => setEditando(null)}>
        {editando !== null ? <Formulario inicial={editando === "nuevo" ? null : editando} alTerminar={() => setEditando(null)} /> : null}
      </Modal>
    </>
  );
}
