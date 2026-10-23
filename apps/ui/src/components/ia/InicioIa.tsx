import { Brain, Download, FileText, FolderPlus, Gauge, HandCoins, Inbox, MessageSquarePlus, PanelRight, ScanSearch, Search, Settings2, Sparkles, Upload, WandSparkles } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { usePropuestas, useUsoIa } from "../../lib/ia";
import { useConversaciones, useMemoria, useProyectos, type Conversacion, type Proyecto } from "../../lib/iaProyectos";
import { useForma } from "../../lib/marco";
import { useSesion } from "../../lib/sesion";
import { EntradaIa, type AdjuntoIa } from "../EntradaIa";
import { usePaginado } from "../Paginas";
import { Boton, Cargando, Selector, avisarError, cx } from "../ui";
import { ReglaIa } from "./Conversacion";
import { bajarJson, borrarChat, EditarProyecto, importarChats, MenuChat } from "./Organizar";
import { PanelProyecto } from "./PanelProyecto";

const COLORES = ["#7c5cff", "#3ddc84", "#f5c451", "#ff6b81", "#7cb7ff", "#ff9a3c", "#c084fc"];
export const colorProyecto = (id: string) => COLORES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length]!;

function hace(fecha: string): string {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  const dias = Math.round(min / 60 / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}

function FilaChat({ c, proyectos, alAbrir }: { c: Conversacion; proyectos: Proyecto[]; alAbrir: (id: string) => void }) {
  const p = proyectos.find((x) => x.id === c.proyectoId);
  return (
    <div className="group flex items-center gap-1 rounded-xl hover:bg-tarjeta">
      <button type="button" onClick={() => alAbrir(c.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
        <span className="block truncate text-sm">{c.titulo}</span>
        <small className="flex items-center gap-1 truncate text-xs text-tenue">
          {p ? <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: colorProyecto(p.id) }} /> : null}
          {p ? `${p.nombre} · ` : ""}
          {hace(c.actualizada)}
        </small>
      </button>
      <MenuChat c={c} proyectos={proyectos} alBorrar={() => void borrarChat(c)} />
    </div>
  );
}

export function InicioIa({
  pestanas,
  textoInicial,
  alAbrir,
  alNuevo,
  alPestana,
}: {
  pestanas: ReactNode;
  textoInicial?: string | null;
  alAbrir: (id: string) => void;
  alNuevo: (proyectoId: string | null, inicial?: { mensaje: string; adjuntos: AdjuntoIa[] }) => void;
  alPestana: (p: "pendientes" | "deudas" | "ajustes") => void;
}) {
  const forma = useForma();
  const navegar = useNavigate();
  const usuario = useSesion((s) => s.usuario);
  const proyectos = useProyectos();
  const chats = useConversaciones();
  const memoria = useMemoria(null);
  const uso = useUsoIa();
  const pendientes = (usePropuestas().data ?? []).filter((p) => p.estado === "pendiente").length;
  const [buscar, setBuscar] = useState("");
  const [elegido, setElegido] = useState<string | null>(null);
  const [editar, setEditar] = useState<Proyecto | null | "nuevo">(null);
  const [panel, setPanel] = useState(false);
  const [texto, setTexto] = useState<string | null>(textoInicial ?? null);
  const archivo = useRef<HTMLInputElement>(null);
  const lista = proyectos.data ?? [];
  const proyecto = lista.find((p) => p.id === elegido) ?? null;
  const filtro = buscar.trim().toLowerCase();
  const visibles = (chats.data ?? []).filter((c) => (!elegido || c.proyectoId === elegido) && (!filtro || c.titulo.toLowerCase().includes(filtro)));
  const paginado = usePaginado(visibles, 8);
  const nombre = usuario?.displayName?.split(/\s+/)[0];
  const celular = forma === "celular";

  const lado = (
    <aside className="flex min-h-0 w-72 shrink-0 flex-col gap-2 rounded-tarjeta border border-borde bg-superficie p-3">
      <Boton variante="primario" icono={MessageSquarePlus} onClick={() => alNuevo(elegido)}>
        Nuevo chat
      </Boton>
      <label className="flex items-center gap-2 rounded-xl border border-borde px-2.5">
        <Search className="h-4 w-4 text-tenue" />
        <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar chats" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-tenue" />
      </label>
      <div className="flex items-center justify-between px-1 pt-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-tenue">Proyectos</p>
        <Boton tamano="icono" variante="fantasma" icono={FolderPlus} aria-label="Nuevo proyecto" onClick={() => setEditar("nuevo")} />
      </div>
      <div className="max-h-48 space-y-0.5 overflow-y-auto">
        {!lista.length ? <p className="px-2 text-xs text-tenue">Agrupa tus chats, sube archivos y dale instrucciones a la IA por proyecto.</p> : null}
        {lista.map((p) => {
          const n = (chats.data ?? []).filter((c) => c.proyectoId === p.id).length;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setElegido(elegido === p.id ? null : p.id)}
              className={cx("flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm", elegido === p.id ? "bg-[color-mix(in_srgb,var(--acento)_16%,transparent)] text-texto" : "text-tenue hover:bg-tarjeta hover:text-texto")}
            >
              <i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorProyecto(p.id) }} />
              <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
              <small className="text-xs text-tenue">{n || ""}</small>
            </button>
          );
        })}
      </div>
      <p className="px-1 pt-1 text-xs font-semibold uppercase tracking-wide text-tenue">{proyecto ? `Chats de ${proyecto.nombre}` : "Recientes"}</p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {chats.isLoading ? <Cargando /> : null}
        {paginado.visibles.map((c) => (
          <FilaChat key={c.id} c={c} proyectos={lista} alAbrir={alAbrir} />
        ))}
        {!chats.isLoading && !visibles.length ? <p className="px-2 text-xs text-tenue">Sin chats todavía.</p> : null}
      </div>
      {paginado.paginas}
      <div className="flex flex-wrap gap-1 border-t border-borde pt-2">
        <Boton tamano="sm" variante="fantasma" icono={Upload} onClick={() => archivo.current?.click()}>
          Importar
        </Boton>
        <Boton tamano="sm" variante="fantasma" icono={Download} onClick={() => void api("/api/ia/exportar").then((d) => bajarJson(d, "chats-mi-setup.json"), avisarError)}>
          Exportar
        </Boton>
      </div>
      <input
        ref={archivo}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importarChats(f, elegido);
          e.target.value = "";
        }}
      />
    </aside>
  );

  const tarjetas = [
    { icono: Inbox, titulo: pendientes === 1 ? "1 propuesta" : `${pendientes} propuestas`, sub: "esperan tu «Aprobar»", tono: "text-aviso", fn: () => alPestana("pendientes") },
    { icono: Brain, titulo: "Memoria", sub: `${memoria.data?.length ?? 0} cosas que recuerdo de ti`, tono: "text-acento", fn: () => alPestana("ajustes") },
    { icono: Gauge, titulo: uso.data ? `$${uso.data.gastadoUsd.toFixed(2)} de $${uso.data.presupuestoUsd}` : "Gasto", sub: "gasto de este mes", tono: "text-ok", fn: () => alPestana("ajustes") },
  ];

  return (
    <div className="flex h-full min-h-0 gap-4">
      {celular ? null : lado}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h1 className="font-titulo text-xl font-semibold">IA asistente</h1>
          {pestanas}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-5 py-4">
            <div className="text-center">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--acento)_18%,transparent)] text-acento">
                <Sparkles className="h-6 w-6" />
              </span>
              <h2 className="mt-3 font-titulo text-2xl font-semibold sm:text-3xl">{nombre ? `¿Cómo puedo ayudarte hoy, ${nombre}?` : "¿Cómo puedo ayudarte hoy?"}</h2>
            </div>
            <div className="rounded-tarjeta border border-borde bg-superficie p-3 shadow-[0_18px_50px_-30px_rgba(0,0,0,.8)]">
              <EntradaIa textoInicial={texto} cargando={false} alEnviar={(mensaje, adjuntos) => alNuevo(elegido, { mensaje, adjuntos })} />
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-borde pt-2">
                <Selector value={elegido ?? ""} onChange={(e) => setElegido(e.target.value || null)} aria-label="Proyecto del chat" className="h-8 w-auto max-w-[14rem] rounded-lg px-2 text-xs">
                  <option value="">Sin proyecto</option>
                  {lista.map((p) => (
                    <option key={p.id} value={p.id}>
                      Proyecto: {p.nombre}
                    </option>
                  ))}
                </Selector>
                {proyecto ? (
                  <>
                    <Boton tamano="sm" variante="fantasma" icono={PanelRight} onClick={() => setPanel(true)}>
                      Archivos y memoria
                    </Boton>
                    <Boton tamano="sm" variante="fantasma" icono={Settings2} onClick={() => setEditar(proyecto)}>
                      Editar
                    </Boton>
                  </>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {[
                { icono: HandCoins, texto: "Negociar una deuda", fn: () => alPestana("deudas") },
                { icono: ScanSearch, texto: "¿Lo escribió una IA?", fn: () => navegar("/ia/creativa") },
                { icono: WandSparkles, texto: "Hacer más natural", fn: () => navegar("/ia/creativa") },
                { icono: FileText, texto: "Resumir un PDF", fn: () => setTexto("Resume este PDF en puntos cortos: ") },
              ].map((c) => (
                <button key={c.texto} type="button" onClick={c.fn} className="flex min-h-10 items-center gap-2 rounded-full border border-borde bg-superficie px-3.5 text-sm text-tenue hover:border-acento hover:text-texto">
                  <c.icono className="h-4 w-4" /> {c.texto}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {tarjetas.map((t) => (
                <button key={t.titulo} type="button" onClick={t.fn} className="flex items-center gap-3 rounded-2xl border border-borde bg-superficie p-3 text-left hover:bg-tarjeta">
                  <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-tarjeta", t.tono)}>
                    <t.icono className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate text-sm">{t.titulo}</b>
                    <small className="block truncate text-xs text-tenue">{t.sub}</small>
                  </span>
                </button>
              ))}
            </div>
            {celular ? (
              <div className="rounded-tarjeta border border-borde bg-superficie p-2">
                <div className="flex items-center justify-between px-2 pb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-tenue">Recientes</p>
                  <Boton tamano="sm" variante="fantasma" icono={FolderPlus} onClick={() => setEditar("nuevo")}>
                    Proyecto
                  </Boton>
                </div>
                {paginado.visibles.map((c) => (
                  <FilaChat key={c.id} c={c} proyectos={lista} alAbrir={alAbrir} />
                ))}
                {!visibles.length ? <p className="px-2 pb-2 text-xs text-tenue">Sin chats todavía.</p> : null}
                {paginado.paginas}
              </div>
            ) : null}
            <ReglaIa />
          </div>
        </div>
      </section>
      {editar ? <EditarProyecto p={editar === "nuevo" ? null : editar} alCerrar={() => setEditar(null)} alCreado={setElegido} /> : null}
      {panel && proyecto
        ? createPortal(
            <div className="fixed inset-0 z-[66] flex justify-end bg-black/50" onClick={() => setPanel(false)}>
              <div className={cx("h-full bg-superficie shadow-2xl", celular ? "w-full" : "w-[380px] max-w-[90vw]")} onClick={(e) => e.stopPropagation()}>
                <PanelProyecto proyecto={proyecto} alCerrar={() => setPanel(false)} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
