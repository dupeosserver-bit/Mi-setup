/**
 * Chat con la IA estilo Claude: barra con proyectos y chats, área grande de
 * conversación (PC y celular), mover, renombrar, exportar, importar y borrar
 * chats. La IA solo propone: las acciones esperan a que toques «Aprobar».
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { BookmarkPlus, ChevronDown, ChevronRight, Copy, Download, FolderOpen, FolderPlus, MessageSquarePlus, MoreHorizontal, Paperclip, PanelLeft, Pencil, Search, Sparkles, Trash2, Upload, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient } from "../lib/consultas";
import { guardarBlob } from "../lib/guardar";
import { HERRAMIENTAS_DIAGNOSTICO, mensajeAnalizar, TarjetaPropuesta, usePropuestas, type Propuesta, type RespuestaChat } from "../lib/ia";
import { aHtml } from "../lib/markdownNotas";
import { usePreferencias } from "../lib/preferencias";
import { hablar } from "../lib/voz";
import { EntradaIa, type AdjuntoIa } from "./EntradaIa";
import { Boton, Cargando, Entrada, ErrorCaja, Modal, Selector, avisar, avisarError, cx } from "./ui";

interface Conversacion {
  id: string;
  titulo: string;
  actualizada: string;
  proyectoId: string | null;
}
interface Proyecto {
  id: string;
  nombre: string;
  instrucciones: string;
}
interface Detalle {
  id: string;
  titulo: string;
  proyectoId: string | null;
  mensajes: { id: number; rol: string; texto: string; adjuntos: number; fecha: string }[];
  propuestas: Propuesta[];
}

const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["ia"] });

function leerPreguntaLarga(): string | null {
  try {
    return sessionStorage.getItem("mi-setup.pregunta");
  } catch {
    return null;
  }
}

async function bajarJson(datos: unknown, nombre: string) {
  await guardarBlob(new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" }), nombre);
}

/** Menú ⋯ de cada chat: renombrar, mover, exportar, borrar. */
function MenuChat({ c, proyectos, alBorrar }: { c: Conversacion; proyectos: Proyecto[]; alBorrar: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"renombrar" | "mover" | null>(null);
  const [titulo, setTitulo] = useState(c.titulo);
  const [destino, setDestino] = useState(c.proyectoId ?? "");
  const cambiar = useMutation({
    mutationFn: (cuerpo: { titulo?: string; proyectoId?: string | null }) => api(`/api/ia/conversaciones/${c.id}`, { metodo: "PATCH", cuerpo }),
    onSuccess: () => {
      setModo(null);
      refrescar();
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
        className="shrink-0 rounded-lg p-1 text-tenue opacity-60 hover:bg-fondo hover:text-texto hover:opacity-100"
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
              <div className="fixed z-[71] w-48 overflow-hidden rounded-xl border border-borde bg-superficie py-1 text-sm shadow-2xl" style={{ top: Math.min(r.bottom + 4, window.innerHeight - 200), left: Math.max(8, Math.min(r.left - 160, window.innerWidth - 200)) }}>
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

/** Crear o editar un proyecto (nombre e instrucciones que la IA sigue en sus chats). */
function EditarProyecto({ p, alCerrar }: { p: Proyecto | null; alCerrar: () => void }) {
  const [nombre, setNombre] = useState(p?.nombre ?? "");
  const [instrucciones, setInstrucciones] = useState(p?.instrucciones ?? "");
  const guardar = useMutation({
    mutationFn: () => api(p ? `/api/ia/proyectos/${p.id}` : "/api/ia/proyectos", { metodo: p ? "PATCH" : "POST", cuerpo: { nombre: nombre.trim(), instrucciones } }),
    onSuccess: () => {
      refrescar();
      alCerrar();
    },
    onError: avisarError,
  });
  const borrar = async (conChats: boolean) => {
    if (!p) return;
    if (!(await confirmar({ titulo: `Borrar ${p.nombre}`, mensaje: conChats ? "Se borran el proyecto y todos sus chats." : "Se borra el proyecto; sus chats quedan sueltos.", peligroso: conChats, boton: "Borrar" }))) return;
    await api(`/api/ia/proyectos/${p.id}?conChats=${conChats}`, { metodo: "DELETE" }).catch(avisarError);
    refrescar();
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
        <textarea
          value={instrucciones}
          onChange={(e) => setInstrucciones(e.target.value)}
          maxLength={8000}
          placeholder="Instrucciones para la IA en este proyecto (ej. «Soy dueño de un servidor de Minecraft; responde con pasos cortos»)"
          className="min-h-32 w-full rounded-xl border border-borde bg-superficie p-3 text-sm focus:border-acento focus:outline-none"
        />
        <div className="flex flex-wrap justify-between gap-2">
          {p ? (
            <div className="flex gap-2">
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

function Barra({
  actual,
  proyectoNuevo,
  alAbrir,
  alNuevo,
  alCerrarCelular,
}: {
  actual: string | null;
  proyectoNuevo: string | null;
  alAbrir: (id: string) => void;
  alNuevo: (proyectoId: string | null) => void;
  alCerrarCelular?: () => void;
}) {
  const [buscar, setBuscar] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [editar, setEditar] = useState<Proyecto | null | "nuevo">(null);
  const lista = useQuery({ queryKey: ["ia", "conversaciones"], queryFn: () => api<Conversacion[]>("/api/ia/conversaciones") });
  const proyectos = useQuery({ queryKey: ["ia", "proyectos"], queryFn: () => api<Proyecto[]>("/api/ia/proyectos") });
  const archivo = useRef<HTMLInputElement>(null);
  const filtro = buscar.trim().toLowerCase();
  const chats = (lista.data ?? []).filter((c) => !filtro || c.titulo.toLowerCase().includes(filtro));
  const borrar = async (c: Conversacion) => {
    if (!(await confirmar({ titulo: "Eliminar chat", mensaje: `Se borra «${c.titulo}». Las propuestas quedan en la cola.`, boton: "Eliminar" }))) return;
    await api(`/api/ia/conversaciones/${c.id}`, { metodo: "DELETE" }).catch(avisarError);
    if (actual === c.id) alNuevo(null);
    refrescar();
  };
  const importar = async (f: File) => {
    try {
      const datos = JSON.parse(await f.text()) as unknown;
      const r = await api<{ chats: number; mensajes: number }>("/api/ia/importar", { cuerpo: { datos, proyectoId: proyectoNuevo } });
      avisar(`Importados ${r.chats} chat(s) con ${r.mensajes} mensajes`);
      refrescar();
    } catch (err) {
      avisarError(err instanceof SyntaxError ? new Error("El archivo no es un JSON válido") : err);
    }
  };
  const Item = ({ c }: { c: Conversacion }) => (
    <div className={cx("group flex items-center gap-1 rounded-lg pr-1", actual === c.id ? "bg-tarjeta" : "hover:bg-tarjeta/60")}>
      <button
        type="button"
        onClick={() => {
          alAbrir(c.id);
          alCerrarCelular?.();
        }}
        className={cx("min-w-0 flex-1 truncate px-2.5 py-1.5 text-left text-sm", actual === c.id ? "text-texto" : "text-tenue")}
      >
        {c.titulo}
      </button>
      <MenuChat c={c} proyectos={proyectos.data ?? []} alBorrar={() => void borrar(c)} />
    </div>
  );
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <Boton
        variante="primario"
        icono={MessageSquarePlus}
        onClick={() => {
          alNuevo(null);
          alCerrarCelular?.();
        }}
      >
        Nuevo chat
      </Boton>
      <label className="flex items-center gap-2 rounded-xl border border-borde px-2">
        <Search className="h-4 w-4 text-tenue" />
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar chats" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-tenue" />
      </label>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        <div>
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-tenue">Proyectos</p>
            <button type="button" aria-label="Nuevo proyecto" className="rounded p-1 text-tenue hover:text-texto" onClick={() => setEditar("nuevo")}>
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>
          {!proyectos.data?.length ? <p className="px-2 py-1 text-xs text-tenue">Agrupa tus chats y dale instrucciones a la IA por proyecto.</p> : null}
          {proyectos.data?.map((p) => {
            const suyos = chats.filter((c) => c.proyectoId === p.id);
            const abierto = abiertos.has(p.id) || (actual !== null && suyos.some((c) => c.id === actual));
            return (
              <div key={p.id}>
                <div className="group flex items-center gap-1 rounded-lg hover:bg-tarjeta/60">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1.5 text-left text-sm"
                    onClick={() => setAbiertos((s) => (s.has(p.id) ? new Set([...s].filter((x) => x !== p.id)) : new Set([...s, p.id])))}
                  >
                    {abierto ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                    <FolderOpen className="h-4 w-4 shrink-0 text-acento" />
                    <span className="truncate">{p.nombre}</span>
                    <span className="text-xs text-tenue">{suyos.length || ""}</span>
                  </button>
                  <button type="button" aria-label={`Nuevo chat en ${p.nombre}`} className="rounded p-1 text-tenue hover:text-texto" onClick={() => (alNuevo(p.id), alCerrarCelular?.())}>
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label={`Editar ${p.nombre}`} className="rounded p-1 text-tenue hover:text-texto" onClick={() => setEditar(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
                {abierto ? (
                  <div className="ml-4 border-l border-borde pl-1">
                    {suyos.length ? suyos.map((c) => <Item key={c.id} c={c} />) : <p className="px-2 py-1 text-xs text-tenue">Sin chats todavía.</p>}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <div>
          <p className="px-1 text-xs font-semibold uppercase tracking-wide text-tenue">Recientes</p>
          {lista.isLoading ? <Cargando /> : null}
          {chats.filter((c) => !c.proyectoId).map((c) => (
            <Item key={c.id} c={c} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1 border-t border-borde pt-2">
        <Boton tamano="sm" variante="fantasma" icono={Upload} onClick={() => archivo.current?.click()}>
          Importar
        </Boton>
        <Boton tamano="sm" variante="fantasma" icono={Download} onClick={() => void api("/api/ia/exportar").then((d) => bajarJson(d, "chats-mi-setup.json"), avisarError)}>
          Exportar todo
        </Boton>
        <input
          ref={archivo}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importar(f);
            e.target.value = "";
          }}
        />
      </div>
      {editar ? <EditarProyecto p={editar === "nuevo" ? null : editar} alCerrar={() => setEditar(null)} /> : null}
    </div>
  );
}

function Mensaje({ m, alRecordar }: { m: Detalle["mensajes"][number]; alRecordar: (texto: string) => void }) {
  const prefs = usePreferencias();
  const html = useMemo(() => (m.rol === "assistant" ? aHtml(m.texto) : ""), [m.rol, m.texto]);
  if (m.rol === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-tarjeta px-4 py-2.5 text-sm [overflow-wrap:anywhere]">
          {m.texto}
          {m.adjuntos ? (
            <span className="mt-1 flex items-center gap-1 text-xs text-tenue">
              <Paperclip className="h-3 w-3" /> {m.adjuntos} archivo(s)
            </span>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div className="group flex gap-3">
      <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-acento/15 text-acento">
        <Sparkles className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        {/* Markdown limpiado con DOMPurify (sin scripts). */}
        <div className="pagina-notion text-[0.95rem]" dangerouslySetInnerHTML={{ __html: html }} />
        <div className="mt-1 flex gap-1 text-tenue opacity-70 group-hover:opacity-100">
          <button type="button" className="rounded p-1 hover:bg-tarjeta hover:text-texto" aria-label="Copiar" onClick={() => void navigator.clipboard.writeText(m.texto).then(() => avisar("Copiado"))}>
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="rounded p-1 hover:bg-tarjeta hover:text-texto" aria-label="Leer en voz alta" onClick={() => void hablar(m.texto, prefs.voz)}>
            <Volume2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="rounded p-1 hover:bg-tarjeta hover:text-texto" aria-label="Guardar en la memoria de la IA" title="Guardar en la memoria" onClick={() => alRecordar(m.texto)}>
            <BookmarkPlus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatIa() {
  const [params] = useSearchParams();
  const pregunta = params.get("pregunta") === "@sesion" ? leerPreguntaLarga() : params.get("pregunta");
  const [actual, setActual] = useState<string | null>(null);
  const [proyectoNuevo, setProyectoNuevo] = useState<string | null>(null);
  const [barraCelular, setBarraCelular] = useState(false);
  const [recordar, setRecordar] = useState<string | null>(null);
  const proyectos = useQuery({ queryKey: ["ia", "proyectos"], queryFn: () => api<Proyecto[]>("/api/ia/proyectos") });
  const detalle = useQuery({ queryKey: ["ia", "conversacion", actual], queryFn: () => api<Detalle>(`/api/ia/conversaciones/${actual}`), enabled: Boolean(actual) });
  const propuestas = usePropuestas();
  const estado = new Map((propuestas.data ?? []).map((p) => [p.id, p]));
  const prefs = usePreferencias();
  const [pendiente, setPendiente] = useState<string | null>(null);
  const enviar = useMutation({
    mutationFn: ({ mensaje, adjuntos }: { mensaje: string; adjuntos: AdjuntoIa[] }) =>
      api<RespuestaChat>("/api/ia/chat", {
        metodo: "POST",
        cuerpo: {
          mensaje,
          conversacionId: actual ?? undefined,
          ...(!actual && proyectoNuevo ? { proyectoId: proyectoNuevo } : {}),
          modulo: "ia",
          adjuntos: adjuntos.map(({ nombre, tipo, datos }) => ({ nombre, tipo, datos })),
        },
      }),
    onMutate: ({ mensaje }) => setPendiente(mensaje),
    onSettled: () => setPendiente(null),
    onSuccess: (r) => {
      setActual(r.conversacionId);
      if (r.aviso) avisar(r.aviso, "info");
      if (prefs.voz.leerRespuestas && r.respuesta) void hablar(r.respuesta, prefs.voz).catch(() => undefined);
      refrescar();
    },
  });
  const guardarMemoria = useMutation({
    mutationFn: (texto: string) => api("/api/ia/memoria", { cuerpo: { texto } }),
    onSuccess: () => {
      setRecordar(null);
      avisar("Guardado en la memoria de la IA");
      void queryClient.invalidateQueries({ queryKey: ["ia", "memoria"] });
    },
    onError: avisarError,
  });

  // Al abrir un chat (o llegar una respuesta) se baja directo al último mensaje.
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [actual, detalle.data, pendiente]);

  const proyecto = proyectos.data?.find((p) => p.id === (actual ? detalle.data?.proyectoId : proyectoNuevo));
  const nuevo = (proyectoId: string | null) => {
    setActual(null);
    setProyectoNuevo(proyectoId);
  };

  return (
    <div className="flex h-full min-h-[22rem] gap-4">
      <aside className="hidden w-72 shrink-0 rounded-tarjeta border border-borde bg-superficie p-3 md:block">
        <Barra actual={actual} proyectoNuevo={proyectoNuevo} alAbrir={setActual} alNuevo={nuevo} />
      </aside>
      {barraCelular
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex md:hidden">
              <div className="h-full w-[85vw] max-w-xs border-r border-borde bg-superficie p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <Barra actual={actual} proyectoNuevo={proyectoNuevo} alAbrir={setActual} alNuevo={nuevo} alCerrarCelular={() => setBarraCelular(false)} />
              </div>
              <button type="button" aria-label="Cerrar" className="flex-1 bg-black/50" onClick={() => setBarraCelular(false)} />
            </div>,
            document.body,
          )
        : null}
      <section className="flex min-w-0 flex-1 flex-col rounded-tarjeta border border-borde bg-superficie">
        <header className="flex items-center gap-2 border-b border-borde px-3 py-2">
          <button type="button" className="rounded-lg p-1.5 text-tenue hover:bg-tarjeta md:hidden" aria-label="Chats y proyectos" onClick={() => setBarraCelular(true)}>
            <PanelLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{actual ? (detalle.data?.titulo ?? "…") : "Nuevo chat"}</p>
            {proyecto ? (
              <p className="flex items-center gap-1 truncate text-xs text-tenue">
                <FolderOpen className="h-3 w-3" /> {proyecto.nombre}
              </p>
            ) : null}
          </div>
          {actual ? <Boton tamano="icono" variante="fantasma" icono={MessageSquarePlus} aria-label="Nuevo chat" onClick={() => nuevo(proyectoNuevo)} /> : null}
        </header>
        <div ref={caja} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-5 px-3 py-5 sm:px-6">
            {!actual ? (
              <div className="py-10 text-center">
                <Sparkles className="mx-auto h-8 w-8 text-acento" />
                <h2 className="mt-3 font-titulo text-2xl font-semibold">¿Cómo puedo ayudarte hoy?</h2>
                <p className="mt-1 text-sm text-tenue">La IA solo propone: nada se ejecuta hasta que tocas «Aprobar».</p>
                <div className="mx-auto mt-4 max-w-xs">
                  <Selector value={proyectoNuevo ?? ""} onChange={(e) => setProyectoNuevo(e.target.value || null)} aria-label="Proyecto del chat">
                    <option value="">Sin proyecto</option>
                    {proyectos.data?.map((p) => (
                      <option key={p.id} value={p.id}>
                        Proyecto: {p.nombre}
                      </option>
                    ))}
                  </Selector>
                </div>
              </div>
            ) : null}
            {actual && detalle.isLoading ? <Cargando /> : null}
            {detalle.data?.mensajes.map((m) => <Mensaje key={m.id} m={m} alRecordar={(t) => setRecordar(t.slice(0, 500))} />)}
            {detalle.data?.propuestas.map((p) => (
              <TarjetaPropuesta
                key={p.id}
                p={estado.get(p.id) ?? p}
                alAnalizar={HERRAMIENTAS_DIAGNOSTICO.has(p.herramienta) && !enviar.isPending ? () => enviar.mutate({ mensaje: mensajeAnalizar(p), adjuntos: [] }) : undefined}
              />
            ))}
            {pendiente ? <Mensaje m={{ id: -1, rol: "user", texto: pendiente, adjuntos: 0, fecha: "" }} alRecordar={() => undefined} /> : null}
            {enviar.isPending ? (
              <p className="flex items-center gap-2 text-sm text-tenue">
                <Sparkles className="h-4 w-4 animate-pulse text-acento" /> Pensando…
              </p>
            ) : null}
            <ErrorCaja error={enviar.error} />
          </div>
        </div>
        <div className="border-t border-borde p-2 sm:p-3">
          <div className="mx-auto max-w-3xl">
            <EntradaIa textoInicial={pregunta} cargando={enviar.isPending} alEnviar={(mensaje, adjuntos) => enviar.mutate({ mensaje, adjuntos })} />
          </div>
        </div>
      </section>
      <Modal abierto={recordar !== null} titulo="Guardar en la memoria de la IA" alCerrar={() => setRecordar(null)} ancho="max-w-md">
        <div className="space-y-3">
          <p className="text-sm text-tenue">La IA lo tendrá en cuenta en todos tus chats. Escríbelo corto (lo puedes editar en Ajustes de la IA).</p>
          <textarea value={recordar ?? ""} onChange={(e) => setRecordar(e.target.value)} maxLength={500} className="min-h-24 w-full rounded-xl border border-borde bg-superficie p-3 text-sm focus:border-acento focus:outline-none" />
          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" icono={X} onClick={() => setRecordar(null)}>
              Cancelar
            </Boton>
            <Boton variante="primario" icono={BookmarkPlus} cargando={guardarMemoria.isPending} disabled={(recordar ?? "").trim().length < 2} onClick={() => guardarMemoria.mutate((recordar ?? "").trim())}>
              Guardar
            </Boton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
