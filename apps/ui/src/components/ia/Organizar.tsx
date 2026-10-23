import { useMutation } from "@tanstack/react-query";
import { Download, FolderOpen, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../lib/api";
import { confirmar } from "../../lib/confirmar";
import { guardarBlob } from "../../lib/guardar";
import { refrescarIa, type Conversacion, type Proyecto } from "../../lib/iaProyectos";
import { AreaTexto, Boton, Entrada, Interruptor, Modal, Selector, avisar, avisarError, cx } from "../ui";

export async function bajarJson(datos: unknown, nombre: string) {
  await guardarBlob(new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" }), nombre);
}

export async function importarChats(f: File, proyectoId: string | null) {
  try {
    const datos = JSON.parse(await f.text()) as unknown;
    const r = await api<{ chats: number; mensajes: number }>("/api/ia/importar", { cuerpo: { datos, proyectoId } });
    avisar(`Importados ${r.chats} chat(s) con ${r.mensajes} mensajes`);
    refrescarIa();
  } catch (err) {
    avisarError(err instanceof SyntaxError ? new Error("El archivo no es un JSON válido") : err);
  }
}

export async function borrarChat(c: Conversacion): Promise<boolean> {
  if (!(await confirmar({ titulo: "Eliminar chat", mensaje: `Se borra «${c.titulo}». Las propuestas quedan en la cola.`, boton: "Eliminar" }))) return false;
  try {
    await api(`/api/ia/conversaciones/${c.id}`, { metodo: "DELETE" });
    refrescarIa();
    return true;
  } catch (err) {
    avisarError(err);
    return false;
  }
}

export function MenuChat({ c, proyectos, alBorrar, claro = false }: { c: Conversacion; proyectos: Proyecto[]; alBorrar: () => void; claro?: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"renombrar" | "mover" | null>(null);
  const [titulo, setTitulo] = useState(c.titulo);
  const [destino, setDestino] = useState(c.proyectoId ?? "");
  const cambiar = useMutation({
    mutationFn: (cuerpo: { titulo?: string; proyectoId?: string | null }) => api(`/api/ia/conversaciones/${c.id}`, { metodo: "PATCH", cuerpo }),
    onSuccess: () => {
      setModo(null);
      refrescarIa();
    },
    onError: avisarError,
  });
  const boton = useRef<HTMLButtonElement>(null);
  const r = boton.current?.getBoundingClientRect();
  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-label={`Opciones de ${c.titulo}`}
        className={cx("grid h-8 w-8 shrink-0 place-items-center rounded-lg text-tenue hover:bg-tarjeta hover:text-texto", !claro && "opacity-60 hover:opacity-100")}
        onClick={(e) => {
          e.stopPropagation();
          setAbierto(!abierto);
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {abierto && r
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[70]" onClick={() => setAbierto(false)} />
              <div className="fixed z-[71] w-52 overflow-hidden rounded-xl border border-borde bg-superficie py-1 text-sm shadow-2xl" style={{ top: Math.min(r.bottom + 4, window.innerHeight - 200), left: Math.max(8, Math.min(r.left - 170, window.innerWidth - 216)) }}>
                {[
                  { icono: Pencil, texto: "Renombrar", fn: () => setModo("renombrar") },
                  { icono: FolderOpen, texto: "Mover a un proyecto", fn: () => setModo("mover") },
                  { icono: Download, texto: "Exportar", fn: () => void api(`/api/ia/conversaciones/${c.id}/exportar`).then((d) => bajarJson(d, `chat-${c.titulo.slice(0, 40)}.json`), avisarError) },
                  { icono: Trash2, texto: "Eliminar", fn: alBorrar, peligro: true },
                ].map((o) => (
                  <button
                    key={o.texto}
                    type="button"
                    className={cx("flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-tarjeta", o.peligro && "text-peligro")}
                    onClick={() => {
                      setAbierto(false);
                      o.fn();
                    }}
                  >
                    <o.icono className="h-4 w-4" /> {o.texto}
                  </button>
                ))}
              </div>
            </>,
            document.body,
          )
        : null}
      <Modal abierto={modo !== null} titulo={modo === "renombrar" ? "Renombrar chat" : "Mover a un proyecto"} alCerrar={() => setModo(null)} ancho="max-w-sm">
        {modo === "renombrar" ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              cambiar.mutate({ titulo: titulo.trim() });
            }}
          >
            <Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={120} autoFocus />
            <Boton type="submit" variante="primario" cargando={cambiar.isPending} disabled={!titulo.trim()}>
              Guardar
            </Boton>
          </form>
        ) : (
          <div className="space-y-3">
            <Selector value={destino} onChange={(e) => setDestino(e.target.value)}>
              <option value="">Sin proyecto</option>
              {proyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Selector>
            <Boton variante="primario" cargando={cambiar.isPending} onClick={() => cambiar.mutate({ proyectoId: destino || null })}>
              Mover
            </Boton>
          </div>
        )}
      </Modal>
    </>
  );
}

export function EditarProyecto({ p, alCerrar, alCreado }: { p: Proyecto | null; alCerrar: () => void; alCreado?: (id: string) => void }) {
  const [nombre, setNombre] = useState(p?.nombre ?? "");
  const [instrucciones, setInstrucciones] = useState(p?.instrucciones ?? "");
  const [compartida, setCompartida] = useState(p?.memoriaCompartida ?? true);
  const guardar = useMutation({
    mutationFn: () =>
      api<{ id?: string }>(p ? `/api/ia/proyectos/${p.id}` : "/api/ia/proyectos", {
        metodo: p ? "PATCH" : "POST",
        cuerpo: { nombre: nombre.trim(), instrucciones, memoriaCompartida: compartida },
      }),
    onSuccess: (r) => {
      refrescarIa();
      if (!p && r?.id) alCreado?.(r.id);
      alCerrar();
    },
    onError: avisarError,
  });
  const borrar = async (conChats: boolean) => {
    if (!p) return;
    if (!(await confirmar({ titulo: `Borrar ${p.nombre}`, mensaje: conChats ? "Se borran el proyecto, sus archivos y todos sus chats." : "Se borran el proyecto y sus archivos; sus chats quedan sueltos.", peligroso: conChats, boton: "Borrar" }))) return;
    await api(`/api/ia/proyectos/${p.id}?conChats=${conChats}`, { metodo: "DELETE" }).catch(avisarError);
    refrescarIa();
    alCerrar();
  };
  return (
    <Modal abierto titulo={p ? "Editar proyecto" : "Nuevo proyecto"} alCerrar={alCerrar} ancho="max-w-lg">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          guardar.mutate();
        }}
      >
        <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre (ej. MexicanLand, Tareas de la escuela)" maxLength={80} autoFocus />
        <div>
          <p className="mb-1 text-xs font-semibold text-tenue">Instrucciones personalizadas</p>
          <AreaTexto
            value={instrucciones}
            onChange={(e) => setInstrucciones(e.target.value)}
            maxLength={8000}
            rows={5}
            placeholder="Cómo quieres que se comporte y responda la IA en este proyecto (ej. «Responde como parte del staff de mi servidor, con pasos cortos»)"
          />
          <p className="mt-1 text-xs text-tenue">Se usan después de las reglas generales, solo dentro de este proyecto.</p>
        </div>
        <div className="rounded-xl border border-borde p-3">
          <Interruptor activo={compartida} alCambiar={setCompartida} etiqueta="Usar la memoria de mi cuenta" />
          <p className="mt-1 text-xs text-tenue">Encendida: lo que la IA recuerda de ti sirve aquí y lo que guardes aquí sirve en tus otros chats. Apagada: este proyecto tiene su propia memoria.</p>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          {p ? (
            <div className="flex flex-wrap gap-2">
              <Boton variante="fantasma" onClick={() => void borrar(false)}>
                Borrar proyecto
              </Boton>
              <Boton variante="peligro" onClick={() => void borrar(true)}>
                Borrar con chats
              </Boton>
            </div>
          ) : (
            <span />
          )}
          <Boton type="submit" variante="primario" cargando={guardar.isPending} disabled={!nombre.trim()}>
            Guardar
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
