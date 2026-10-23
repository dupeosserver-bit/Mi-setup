import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Brain, Copy, FolderOpen, PanelRight, Paperclip, ShieldCheck, Sparkles, Volume2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../../lib/api";
import { HERRAMIENTAS_DIAGNOSTICO, mensajeAnalizar, TarjetaPropuesta, usePropuestas, type Propuesta, type RespuestaChat } from "../../lib/ia";
import { refrescarIa, useConversaciones, useProyectos, type Proyecto } from "../../lib/iaProyectos";
import { useForma, useModoPagina } from "../../lib/marco";
import { aHtml } from "../../lib/markdownNotas";
import { usePreferencias } from "../../lib/preferencias";
import { useSesion } from "../../lib/sesion";
import { hablar } from "../../lib/voz";
import { EntradaIa, type AdjuntoIa } from "../EntradaIa";
import { AreaTexto, Boton, Cargando, ErrorCaja, Modal, avisar, avisarError, cx } from "../ui";
import { borrarChat, MenuChat } from "./Organizar";
import { PanelProyecto } from "./PanelProyecto";

interface Detalle {
  id: string;
  titulo: string;
  proyectoId: string | null;
  mensajes: { id: number; rol: string; texto: string; adjuntos: number; fecha: string }[];
  propuestas: Propuesta[];
}

export function iniciales(nombre: string | null | undefined): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "T") + (partes[1]?.[0] ?? "")).toUpperCase();
}

export function MensajeIa({ rol, texto, adjuntos = 0, alRecordar }: { rol: string; texto: string; adjuntos?: number; alRecordar?: (t: string) => void }) {
  const prefs = usePreferencias();
  const usuario = useSesion((s) => s.usuario);
  const forma = useForma();
  const html = useMemo(() => (rol === "assistant" ? aHtml(texto) : ""), [rol, texto]);
  const esIa = rol === "assistant";
  return (
    <div className="group flex gap-3">
      {forma === "celular" && !esIa ? null : (
        <span
          className={cx(
            "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold",
            esIa ? "bg-[color-mix(in_srgb,var(--acento)_18%,transparent)] text-acento" : "bg-tarjeta text-texto",
          )}
        >
          {esIa ? <Sparkles className="h-4 w-4" /> : iniciales(usuario?.displayName)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-xs font-semibold text-tenue">{esIa ? "IA asistente" : "Tú"}</p>
        {esIa ? (
          <div className="pagina-notion text-[0.95rem]" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-tarjeta px-4 py-2.5 text-sm [overflow-wrap:anywhere]">{texto}</div>
        )}
        {adjuntos ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-tenue">
            <Paperclip className="h-3 w-3" /> {adjuntos} archivo(s)
          </p>
        ) : null}
        {esIa ? (
          <div className="mt-1 flex gap-1 text-tenue opacity-70 group-hover:opacity-100">
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-tarjeta hover:text-texto" aria-label="Copiar" onClick={() => void navigator.clipboard.writeText(texto).then(() => avisar("Copiado"))}>
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button type="button" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-tarjeta hover:text-texto" aria-label="Leer en voz alta" onClick={() => void hablar(texto, prefs.voz)}>
              <Volume2 className="h-3.5 w-3.5" />
            </button>
            {alRecordar ? (
              <button type="button" className="grid h-8 w-8 place-items-center rounded-lg hover:bg-tarjeta hover:text-texto" aria-label="Guardar en la memoria de la IA" title="Guardar en la memoria" onClick={() => alRecordar(texto)}>
                <Brain className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ReglaIa() {
  return (
    <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-tenue">
      <ShieldCheck className="h-3.5 w-3.5 text-ok" /> La IA solo propone: nada se ejecuta hasta que tocas «Aprobar».
    </p>
  );
}

export function Conversacion({
  id,
  proyectoId,
  inicial,
  alSalir,
  alAbierto,
}: {
  id: string | null;
  proyectoId: string | null;
  inicial?: { mensaje: string; adjuntos: AdjuntoIa[] } | null;
  alSalir: () => void;
  alAbierto: (id: string) => void;
}) {
  useModoPagina("completa");
  const forma = useForma();
  const prefs = usePreferencias();
  const proyectos = useProyectos();
  const chats = useConversaciones();
  const detalle = useQuery({ queryKey: ["ia", "conversacion", id], queryFn: () => api<Detalle>(`/api/ia/conversaciones/${id}`), enabled: Boolean(id) });
  const propuestas = usePropuestas();
  const estado = new Map((propuestas.data ?? []).map((p) => [p.id, p]));
  const [pendiente, setPendiente] = useState<string | null>(null);
  const [panel, setPanel] = useState(forma === "pc");
  const [recordar, setRecordar] = useState<string | null>(null);
  const proyecto: Proyecto | undefined = proyectos.data?.find((p) => p.id === (id ? detalle.data?.proyectoId : proyectoId));
  const chat = chats.data?.find((c) => c.id === id);

  const enviar = useMutation({
    mutationFn: ({ mensaje, adjuntos }: { mensaje: string; adjuntos: AdjuntoIa[] }) =>
      api<RespuestaChat>("/api/ia/chat", {
        metodo: "POST",
        cuerpo: {
          mensaje,
          conversacionId: id ?? undefined,
          ...(!id && proyectoId ? { proyectoId } : {}),
          modulo: "ia",
          adjuntos: adjuntos.map(({ nombre, tipo, datos }) => ({ nombre, tipo, datos })),
        },
      }),
    onMutate: ({ mensaje }) => setPendiente(mensaje),
    onSettled: () => setPendiente(null),
    onSuccess: (r) => {
      if (r.conversacionId !== id) alAbierto(r.conversacionId);
      if (r.aviso) avisar(r.aviso, "info");
      if (prefs.voz.leerRespuestas && r.respuesta) void hablar(r.respuesta, prefs.voz).catch(() => undefined);
      refrescarIa();
    },
  });
  const guardarMemoria = useMutation({
    mutationFn: (texto: string) => api("/api/ia/memoria", { cuerpo: { texto, ...(proyecto ? { proyectoId: proyecto.id } : {}) } }),
    onSuccess: () => {
      setRecordar(null);
      avisar("Guardado en la memoria de la IA");
      refrescarIa();
    },
    onError: avisarError,
  });

  const mandado = useRef(false);
  useEffect(() => {
    if (!inicial || mandado.current || id) return;
    mandado.current = true;
    enviar.mutate(inicial);
  }, [inicial, id, enviar]);

  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = caja.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [id, detalle.data, pendiente]);

  const ancho = forma === "pc";
  const mostrarPanel = Boolean(proyecto) && panel;

  return (
    <div className="flex h-full min-h-0 flex-col bg-fondo">
      <header className="safe-top flex shrink-0 items-center gap-2 border-b border-borde bg-superficie px-2 py-2 sm:px-3">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} aria-label="Volver" onClick={alSalir} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{id ? (detalle.data?.titulo ?? "…") : "Nuevo chat"}</p>
          {proyecto ? (
            <p className="flex items-center gap-1 truncate text-xs text-tenue">
              <FolderOpen className="h-3 w-3 text-acento" /> {proyecto.nombre}
            </p>
          ) : null}
        </div>
        {proyecto ? <Boton tamano="icono" variante={panel ? "secundario" : "fantasma"} icono={PanelRight} aria-label="Panel del proyecto" onClick={() => setPanel(!panel)} /> : null}
        {chat ? <MenuChat c={chat} proyectos={proyectos.data ?? []} claro alBorrar={() => void borrarChat(chat).then((ok) => ok && alSalir())} /> : null}
      </header>
      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
          <div ref={caja} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-3xl space-y-6 px-3 py-5 sm:px-6">
              {!id && !pendiente ? (
                <div className="py-10 text-center text-tenue">
                  <Sparkles className="mx-auto h-8 w-8 text-acento" />
                  <p className="mt-3">{proyecto ? `Nuevo chat en «${proyecto.nombre}». La IA usará sus archivos, instrucciones y memoria.` : "Escribe tu pregunta para empezar."}</p>
                </div>
              ) : null}
              {id && detalle.isLoading ? <Cargando /> : null}
              {detalle.data?.mensajes.map((m) => <MensajeIa key={m.id} rol={m.rol} texto={m.texto} adjuntos={m.adjuntos} alRecordar={(t) => setRecordar(t.slice(0, 500))} />)}
              {detalle.data?.propuestas.map((p) => (
                <div key={p.id} className="pl-11">
                  <TarjetaPropuesta
                    p={estado.get(p.id) ?? p}
                    alAnalizar={HERRAMIENTAS_DIAGNOSTICO.has(p.herramienta) && !enviar.isPending ? () => enviar.mutate({ mensaje: mensajeAnalizar(p), adjuntos: [] }) : undefined}
                  />
                </div>
              ))}
              {pendiente ? <MensajeIa rol="user" texto={pendiente} /> : null}
              {enviar.isPending ? (
                <p className="flex items-center gap-2 pl-11 text-sm text-tenue">
                  <Sparkles className="h-4 w-4 animate-pulse text-acento" /> Pensando…
                </p>
              ) : null}
              <ErrorCaja error={enviar.error} />
            </div>
          </div>
          <div className="safe-bottom shrink-0 border-t border-borde bg-superficie p-2 sm:p-3">
            <div className="mx-auto max-w-3xl">
              <EntradaIa cargando={enviar.isPending} alEnviar={(mensaje, adjuntos) => enviar.mutate({ mensaje, adjuntos })} />
              <ReglaIa />
            </div>
          </div>
        </section>
        {mostrarPanel && proyecto && ancho ? (
          <aside className="w-[340px] shrink-0 border-l border-borde bg-superficie">
            <PanelProyecto proyecto={proyecto} />
          </aside>
        ) : null}
      </div>
      {mostrarPanel && proyecto && !ancho
        ? createPortal(
            <div className="fixed inset-0 z-[66] flex justify-end bg-black/50" onClick={() => setPanel(false)}>
              <div className={cx("h-full bg-superficie shadow-2xl", forma === "celular" ? "w-full" : "w-[380px] max-w-[90vw]")} onClick={(e) => e.stopPropagation()}>
                <PanelProyecto proyecto={proyecto} alCerrar={() => setPanel(false)} />
              </div>
            </div>,
            document.body,
          )
        : null}
      <Modal abierto={recordar !== null} titulo="Guardar en la memoria de la IA" alCerrar={() => setRecordar(null)} ancho="max-w-md">
        <div className="space-y-3">
          <p className="text-sm text-tenue">{proyecto && !proyecto.memoriaCompartida ? "Se guarda solo en este proyecto." : "La IA lo tendrá en cuenta en todos tus chats."} Escríbelo corto.</p>
          <AreaTexto value={recordar ?? ""} onChange={(e) => setRecordar(e.target.value)} maxLength={500} rows={4} />
          <div className="flex justify-end gap-2">
            <Boton variante="fantasma" icono={X} onClick={() => setRecordar(null)}>
              Cancelar
            </Boton>
            <Boton variante="primario" icono={Brain} cargando={guardarMemoria.isPending} disabled={(recordar ?? "").trim().length < 2} onClick={() => guardarMemoria.mutate((recordar ?? "").trim())}>
              Guardar
            </Boton>
          </div>
        </div>
      </Modal>
    </div>
  );
}
