import { useMutation } from "@tanstack/react-query";
import { BookOpen, Brain, FileImage, FileText, FileType, FileUp, Pencil, Plus, ScrollText, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../lib/api";
import { confirmar } from "../../lib/confirmar";
import { ACEPTA_CONTEXTO, refrescarIa, subirContexto, tamano, urlArchivo, useArchivosProyecto, useMemoria, type ArchivoContexto, type Proyecto } from "../../lib/iaProyectos";
import { usePaginado } from "../Paginas";
import { AreaTexto, Boton, Entrada, Interruptor, avisar, avisarError, cx } from "../ui";

function IconoArchivo({ a }: { a: Pick<ArchivoContexto, "tipo" | "imagen"> }) {
  if (a.imagen) return <FileImage className="h-4 w-4 text-ok" />;
  if (a.tipo === "application/pdf") return <FileType className="h-4 w-4 text-peligro" />;
  return <FileText className="h-4 w-4 text-acento" />;
}

function Barra({ valor, max }: { valor: number; max: number }) {
  const p = Math.min(100, Math.round((valor / Math.max(1, max)) * 100));
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-fondo">
      <div className={cx("h-full rounded-full", p >= 90 ? "bg-peligro" : p >= 70 ? "bg-aviso" : "bg-acento")} style={{ width: `${p}%` }} />
    </div>
  );
}

function Seccion({ icono: Icono, titulo, extra, children }: { icono: typeof BookOpen; titulo: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-b border-borde px-4 py-4 last:border-b-0">
      <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Icono className="h-4 w-4 text-acento" />
        <span className="min-w-0 flex-1 truncate">{titulo}</span>
        {extra}
      </h4>
      {children}
    </section>
  );
}

export function PanelProyecto({ proyecto, alCerrar }: { proyecto: Proyecto; alCerrar?: () => void }) {
  const archivos = useArchivosProyecto(proyecto.id);
  const memoria = useMemoria(proyecto.id);
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [instrucciones, setInstrucciones] = useState(proyecto.instrucciones);
  const [recuerdo, setRecuerdo] = useState("");
  const lista = usePaginado(archivos.data?.archivos, 6);
  const uso = archivos.data?.uso;

  const subir = async (lista: FileList | null) => {
    for (const f of Array.from(lista ?? [])) {
      setSubiendo(f.name);
      try {
        const r = await subirContexto(proyecto.id, f);
        avisar(r.sinTexto ? `${f.name} se guardó, pero no tiene texto que la IA pueda leer` : `${f.name} listo para la IA`, r.sinTexto ? "info" : "ok");
      } catch (err) {
        avisarError(err);
        break;
      }
    }
    setSubiendo(null);
    refrescarIa();
  };
  const borrar = async (a: ArchivoContexto) => {
    if (!(await confirmar({ titulo: "Quitar archivo", mensaje: `La IA ya no usará «${a.nombre}».`, boton: "Quitar" }))) return;
    await api(`/api/ia/proyectos/${proyecto.id}/archivos/${a.id}`, { metodo: "DELETE" }).catch(avisarError);
    refrescarIa();
  };
  const guardar = useMutation({
    mutationFn: (cuerpo: { instrucciones?: string; memoriaCompartida?: boolean }) => api(`/api/ia/proyectos/${proyecto.id}`, { metodo: "PATCH", cuerpo }),
    onSuccess: () => {
      setEditando(false);
      refrescarIa();
    },
    onError: avisarError,
  });
  const recordar = useMutation({
    mutationFn: () => api("/api/ia/memoria", { cuerpo: { texto: recuerdo.trim(), proyectoId: proyecto.id } }),
    onSuccess: () => {
      setRecuerdo("");
      refrescarIa();
    },
    onError: avisarError,
  });
  const olvidar = useMutation({ mutationFn: (id: string) => api(`/api/ia/memoria/${id}`, { metodo: "DELETE" }), onSuccess: refrescarIa, onError: avisarError });
  const recuerdos = (memoria.data ?? []).filter((m) => proyecto.memoriaCompartida || m.proyectoId === proyecto.id);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-borde px-4 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--acento)_18%,transparent)] text-acento">
          <BookOpen className="h-4 w-4" />
        </span>
        <b className="min-w-0 flex-1 truncate">{proyecto.nombre}</b>
        {alCerrar ? <Boton tamano="icono" variante="fantasma" icono={X} aria-label="Cerrar panel" onClick={alCerrar} /> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Seccion icono={BookOpen} titulo="Archivos">
          {uso ? (
            <div className="mb-3 space-y-1.5 rounded-xl bg-tarjeta p-3 text-xs">
              <div className="flex justify-between">
                <span className="text-tenue">Archivos</span>
                <b>
                  {uso.archivos} de {uso.maxArchivos}
                </b>
              </div>
              <Barra valor={uso.archivos} max={uso.maxArchivos} />
              <div className="flex justify-between pt-1">
                <span className="text-tenue">Espacio</span>
                <b>
                  {tamano(uso.bytes)} de {tamano(uso.maxBytes)}
                </b>
              </div>
              <Barra valor={uso.bytes} max={uso.maxBytes} />
              <p className="pt-1 text-tenue">Sirven PDF, Markdown (.md), texto y fotos. La IA solo lee las partes que necesita para cada pregunta.</p>
            </div>
          ) : null}
          <div className="space-y-1">
            {lista.visibles.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-tarjeta">
                <IconoArchivo a={a} />
                <a href={urlArchivo(a.url)} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                  <b className="block truncate text-sm font-medium">{a.nombre}</b>
                  <small className="text-xs text-tenue">
                    {tamano(a.tamano)} · {a.imagen ? "foto" : `${a.fragmentos} partes`}
                  </small>
                </a>
                <button type="button" aria-label={`Quitar ${a.nombre}`} className="grid h-8 w-8 place-items-center rounded-lg text-tenue hover:text-peligro" onClick={() => void borrar(a)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          {lista.paginas}
          <button
            type="button"
            disabled={Boolean(subiendo) || (uso ? uso.archivos >= uso.maxArchivos : false)}
            onClick={() => entrada.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void subir(e.dataTransfer.files);
            }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-borde px-3 py-3 text-sm text-tenue hover:border-acento hover:text-texto disabled:opacity-50"
          >
            <FileUp className="h-4 w-4" />
            {subiendo ? `Subiendo ${subiendo}…` : "Subir archivo"}
          </button>
          <input ref={entrada} type="file" multiple accept={ACEPTA_CONTEXTO} className="hidden" onChange={(e) => (void subir(e.target.files), (e.target.value = ""))} />
        </Seccion>

        <Seccion
          icono={ScrollText}
          titulo="Instrucciones"
          extra={!editando ? <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Editar instrucciones" onClick={() => (setInstrucciones(proyecto.instrucciones), setEditando(true))} /> : null}
        >
          {editando ? (
            <div className="space-y-2">
              <AreaTexto rows={6} value={instrucciones} maxLength={8000} onChange={(e) => setInstrucciones(e.target.value)} placeholder="Cómo debe comportarse y responder la IA en este proyecto" />
              <div className="flex justify-end gap-2">
                <Boton tamano="sm" variante="fantasma" onClick={() => setEditando(false)}>
                  Cancelar
                </Boton>
                <Boton tamano="sm" variante="primario" cargando={guardar.isPending} onClick={() => guardar.mutate({ instrucciones })}>
                  Guardar
                </Boton>
              </div>
            </div>
          ) : proyecto.instrucciones ? (
            <p className="whitespace-pre-wrap break-words rounded-xl bg-tarjeta p-3 text-sm [overflow-wrap:anywhere]">{proyecto.instrucciones}</p>
          ) : (
            <p className="text-sm text-tenue">Sin instrucciones. Agrega cómo quieres que responda aquí (van después de las reglas generales).</p>
          )}
        </Seccion>

        <Seccion
          icono={Brain}
          titulo="Memoria compartida"
          extra={<Interruptor activo={proyecto.memoriaCompartida} alCambiar={(v) => guardar.mutate({ memoriaCompartida: v })} />}
        >
          <p className="mb-2 text-xs text-tenue">
            {proyecto.memoriaCompartida ? "Usa lo que la IA recuerda de ti en todos tus chats, y lo que guardes aquí también sirve afuera." : "Apagada: este proyecto solo usa su propia memoria."}
          </p>
          <div className="space-y-1">
            {recuerdos.map((m) => (
              <div key={m.id} className="group flex items-start gap-2 rounded-lg border-l-2 border-acento bg-tarjeta px-2.5 py-1.5 text-sm">
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{m.texto}</span>
                {m.proyectoId ? <small className="shrink-0 text-[10px] text-tenue">solo aquí</small> : null}
                <button type="button" aria-label="Olvidar" className="shrink-0 text-tenue opacity-60 hover:text-peligro group-hover:opacity-100" onClick={() => olvidar.mutate(m.id)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (recuerdo.trim().length >= 2) recordar.mutate();
            }}
          >
            <Entrada value={recuerdo} onChange={(e) => setRecuerdo(e.target.value)} maxLength={500} placeholder="Algo que la IA debe recordar" />
            <Boton type="submit" tamano="icono" variante="secundario" icono={Plus} aria-label="Guardar en la memoria" cargando={recordar.isPending} />
          </form>
        </Seccion>
      </div>
    </div>
  );
}
