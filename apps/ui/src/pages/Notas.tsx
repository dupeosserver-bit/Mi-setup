/**
 * Bloc de notas tipo Notion: las mismas notas se escriben como texto o se ven
 * como página (títulos, listas, casillas que se marcan, tablas), con subpáginas,
 * ícono, plantillas y un tablero de tareas. Guardado automático y sincronizado.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { marked } from "marked";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckSquare,
  ChevronRight,
  FilePlus2,
  Heading1,
  KanbanSquare,
  List,
  Minus,
  NotebookPen,
  PenLine,
  Pin,
  PinOff,
  Plus,
  Search,
  Table,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Pestanas, Vacio, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { alternarCasilla } from "../lib/notas";

interface Nota {
  id: string;
  titulo: string;
  contenido: string;
  fijada: boolean;
  padre: string | null;
  icono: string | null;
  actualizada: string;
}

// ---------------------------------------------------------------- Markdown

marked.setOptions({ gfm: true, breaks: true });

/** Convierte el texto en página (HTML limpio: sin scripts ni eventos). */
function aHtml(contenido: string): string {
  let indice = 0;
  // Cada casilla lleva su número para poder marcarla desde la página.
  const html = (marked.parse(contenido, { async: false }) as string).replace(/<input([^>]*?)type="checkbox"([^>]*?)>/g, (_m, a: string, b: string) => {
    const marcada = /checked/.test(a + b);
    return `<input type="checkbox" data-casilla="${indice++}"${marcada ? " checked" : ""}>`;
  });
  return DOMPurify.sanitize(html, { ADD_ATTR: ["data-casilla"], FORBID_TAGS: ["style", "form"], FORBID_ATTR: ["style"] });
}

const PLANTILLAS: { nombre: string; icono: string; titulo: string; contenido: string }[] = [
  { nombre: "En blanco", icono: "📝", titulo: "Nueva página", contenido: "" },
  { nombre: "Lista de tareas", icono: "✅", titulo: "Pendientes", contenido: "## Hoy\n- [ ] \n- [ ] \n\n## Esta semana\n- [ ] \n" },
  {
    nombre: "Diario",
    icono: "📔",
    titulo: new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" }),
    contenido: "## ¿Cómo me siento?\n\n## Lo que hice\n- \n\n## Agradezco\n- \n",
  },
  { nombre: "Lista de compras", icono: "🛒", titulo: "Compras", contenido: "- [ ] \n- [ ] \n- [ ] \n" },
  { nombre: "Ideas", icono: "💡", titulo: "Ideas", contenido: "## Idea\n\n**Por qué:** \n\n**Siguiente paso:** \n" },
  { nombre: "Reunión", icono: "🗓️", titulo: "Reunión", contenido: "**Fecha:** \n**Con:** \n\n## Temas\n- \n\n## Acuerdos\n- [ ] \n" },
  { nombre: "Tabla", icono: "📊", titulo: "Tabla", contenido: "| Nombre | Estado | Notas |\n| --- | --- | --- |\n|  |  |  |\n" },
];

const ICONOS = ["📝", "✅", "📔", "💡", "🛒", "📊", "🎮", "💻", "🔐", "💰", "🎂", "📚", "🏠", "⭐"];

// ---------------------------------------------------------------- editor

function Editor({ nota, notas, puedeEditar, alVolver, alAbrir }: { nota: Nota; notas: Nota[]; puedeEditar: boolean; alVolver: () => void; alAbrir: (id: string) => void }) {
  const [titulo, setTitulo] = useState(nota.titulo);
  const [contenido, setContenido] = useState(nota.contenido);
  const [modo, setModo] = useState<"pagina" | "editar">(nota.contenido ? "pagina" : "editar");
  const [estado, setEstado] = useState<"guardado" | "pendiente" | "guardando">("guardado");
  const [iconos, setIconos] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitulo(nota.titulo);
    setContenido(nota.contenido);
    setEstado("guardado");
    setModo(nota.contenido ? "pagina" : "editar");
    // Solo al cambiar de nota; los cambios remotos de la misma nota no pisan lo que se escribe.
  }, [nota.id]);

  const guardar = (cambios: Partial<Nota>, inmediato = false) => {
    setEstado("pendiente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(
      async () => {
        setEstado("guardando");
        try {
          await api(`/api/notas/${nota.id}`, { metodo: "PATCH", cuerpo: cambios });
          setEstado("guardado");
          void queryClient.invalidateQueries({ queryKey: ["notas"] });
        } catch (err) {
          avisarError(err);
          setEstado("pendiente");
        }
      },
      inmediato ? 0 : 700,
    );
  };

  const cambiarContenido = (c: string, inmediato = false) => {
    setContenido(c);
    guardar({ contenido: c }, inmediato);
  };

  /** Inserta formato donde está el cursor. */
  const insertar = (antes: string, despues = "", enLinea = false) => {
    const t = area.current;
    if (!t) return cambiarContenido(contenido + antes + despues);
    const [i, f] = [t.selectionStart, t.selectionEnd];
    const prefijo = enLinea && i > 0 && contenido[i - 1] !== "\n" ? "\n" : "";
    cambiarContenido(contenido.slice(0, i) + prefijo + antes + contenido.slice(i, f) + despues + contenido.slice(f));
    requestAnimationFrame(() => {
      t.focus();
      const pos = i + prefijo.length + antes.length + (f - i);
      t.setSelectionRange(pos, pos);
    });
  };

  const html = useMemo(() => aHtml(contenido), [contenido]);
  const hijas = notas.filter((n) => n.padre === nota.id);
  const ruta: Nota[] = [];
  let p = notas.find((n) => n.id === nota.padre);
  while (p && ruta.length < 10) {
    ruta.unshift(p);
    const padreId: string | null = p.padre;
    p = notas.find((n) => n.id === padreId);
  }

  const subpagina = useMutation({
    mutationFn: () => api<Nota>("/api/notas", { cuerpo: { titulo: "Nueva subpágina", padre: nota.id, icono: "📄" } }),
    onSuccess: (n) => {
      void queryClient.invalidateQueries({ queryKey: ["notas"] });
      alAbrir(n.id);
    },
    onError: avisarError,
  });
  const cambiarIcono = (i: string) => {
    setIconos(false);
    void api(`/api/notas/${nota.id}`, { metodo: "PATCH", cuerpo: { icono: i } }).then(() => queryClient.invalidateQueries({ queryKey: ["notas"] }));
  };

  return (
    <div className="flex h-full min-w-0 flex-col rounded-tarjeta border border-borde bg-superficie">
      <div className="flex flex-wrap items-center gap-1 border-b border-borde p-2">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alVolver} className="md:hidden" aria-label="Volver" />
        <span className="min-w-0 flex-1 truncate text-xs text-tenue">
          {estado === "guardado" ? `Guardado · ${haceCuanto(nota.actualizada)}` : estado === "guardando" ? "Guardando…" : "Sin guardar"}
        </span>
        <Boton tamano="sm" variante={modo === "pagina" ? "primario" : "fantasma"} icono={BookOpen} onClick={() => setModo("pagina")}>
          Página
        </Boton>
        {puedeEditar ? (
          <>
            <Boton tamano="sm" variante={modo === "editar" ? "primario" : "fantasma"} icono={PenLine} onClick={() => setModo("editar")}>
              Escribir
            </Boton>
            <Boton tamano="icono" variante="fantasma" icono={FilePlus2} aria-label="Nueva subpágina" title="Nueva subpágina" onClick={() => subpagina.mutate()} />
            <Boton
              tamano="icono"
              variante="fantasma"
              icono={nota.fijada ? PinOff : Pin}
              aria-label={nota.fijada ? "Desfijar" : "Fijar"}
              onClick={() => void api(`/api/notas/${nota.id}`, { metodo: "PATCH", cuerpo: { fijada: !nota.fijada } }).then(() => queryClient.invalidateQueries({ queryKey: ["notas"] }))}
            />
            <Boton
              tamano="icono"
              variante="fantasma"
              icono={Trash2}
              aria-label="Borrar"
              onClick={async () => {
                const extra = hijas.length ? ` Sus ${hijas.length} subpágina(s) suben un nivel.` : "";
                if (!(await confirmar({ titulo: "Borrar página", mensaje: `¿Borrar "${nota.titulo || "sin título"}"?${extra}`, boton: "Borrar" }))) return;
                await api(`/api/notas/${nota.id}`, { metodo: "DELETE" }).catch(avisarError);
                await queryClient.invalidateQueries({ queryKey: ["notas"] });
                alVolver();
              }}
            />
          </>
        ) : null}
      </div>

      {ruta.length ? (
        <div className="flex flex-wrap items-center gap-1 px-4 pt-3 text-xs text-tenue">
          {ruta.map((r) => (
            <span key={r.id} className="flex items-center gap-1">
              <button type="button" className="hover:underline" onClick={() => alAbrir(r.id)}>
                {r.icono ?? "📄"} {r.titulo || "Sin título"}
              </button>
              <ChevronRight className="h-3 w-3" />
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2 px-4 pt-3">
        <button type="button" disabled={!puedeEditar} onClick={() => setIconos((v) => !v)} className="text-2xl" aria-label="Cambiar ícono">
          {nota.icono ?? "📝"}
        </button>
        <input
          value={titulo}
          readOnly={!puedeEditar}
          placeholder="Título"
          onChange={(e) => {
            setTitulo(e.target.value);
            guardar({ titulo: e.target.value });
          }}
          className="min-w-0 flex-1 bg-transparent font-titulo text-xl font-semibold outline-none placeholder:text-tenue"
        />
      </div>
      {iconos ? (
        <div className="flex flex-wrap gap-1 px-4 pt-2">
          {ICONOS.map((i) => (
            <button key={i} type="button" className="rounded-lg p-1 text-xl hover:bg-tarjeta" onClick={() => cambiarIcono(i)}>
              {i}
            </button>
          ))}
        </div>
      ) : null}

      {modo === "editar" && puedeEditar ? (
        <>
          <div className="flex flex-wrap gap-1 px-3 pt-2">
            <Boton tamano="sm" variante="fantasma" icono={Heading1} onClick={() => insertar("## ", "", true)}>
              Título
            </Boton>
            <Boton tamano="sm" variante="fantasma" icono={List} onClick={() => insertar("- ", "", true)}>
              Lista
            </Boton>
            <Boton tamano="sm" variante="fantasma" icono={CheckSquare} onClick={() => insertar("- [ ] ", "", true)}>
              Tarea
            </Boton>
            <Boton tamano="sm" variante="fantasma" onClick={() => insertar("**", "**")}>
              <b>N</b>
            </Boton>
            <Boton tamano="sm" variante="fantasma" icono={Table} onClick={() => insertar("| Columna | Columna |\n| --- | --- |\n|  |  |\n", "", true)}>
              Tabla
            </Boton>
            <Boton tamano="sm" variante="fantasma" icono={Minus} onClick={() => insertar("\n---\n", "", true)}>
              Línea
            </Boton>
          </div>
          <textarea
            ref={area}
            value={contenido}
            placeholder="Escribe aquí… usa los botones de arriba para títulos, listas y tareas."
            onChange={(e) => cambiarContenido(e.target.value)}
            className="min-h-[50vh] flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-tenue"
          />
        </>
      ) : (
        <div
          className="pagina-notion min-h-[50vh] min-w-0 flex-1 overflow-x-auto px-4 py-3"
          // HTML limpiado con DOMPurify (sin scripts ni eventos).
          dangerouslySetInnerHTML={{ __html: html || "<p>Página vacía. Toca «Escribir» para empezar.</p>" }}
          onClick={(e) => {
            const n = (e.target as HTMLElement).getAttribute("data-casilla");
            if (n === null || !puedeEditar) return;
            e.preventDefault();
            cambiarContenido(alternarCasilla(contenido, Number(n)), true);
          }}
        />
      )}

      {hijas.length ? (
        <div className="border-t border-borde px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tenue">Subpáginas</p>
          <div className="flex flex-wrap gap-2">
            {hijas.map((h) => (
              <button key={h.id} type="button" onClick={() => alAbrir(h.id)} className="rounded-xl border border-borde px-3 py-1.5 text-sm hover:bg-tarjeta">
                {h.icono ?? "📄"} {h.titulo || "Sin título"}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- tablero

interface Tarea {
  id: string;
  titulo: string;
  estado: "pendiente" | "haciendo" | "hecho";
}

const COLUMNAS: { id: Tarea["estado"]; titulo: string }[] = [
  { id: "pendiente", titulo: "Pendiente" },
  { id: "haciendo", titulo: "Haciendo" },
  { id: "hecho", titulo: "Hecho" },
];

function Tablero({ puedeEditar }: { puedeEditar: boolean }) {
  const q = useQuery({ queryKey: ["tareas"], queryFn: () => api<Tarea[]>("/api/tareas") });
  const [nueva, setNueva] = useState("");
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["tareas"] });
  const crear = useMutation({
    mutationFn: () => api("/api/tareas", { cuerpo: { titulo: nueva.trim() } }),
    onSuccess: () => {
      setNueva("");
      refrescar();
    },
    onError: avisarError,
  });
  const mover = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: Tarea["estado"] }) => api(`/api/tareas/${id}`, { metodo: "PATCH", cuerpo: { estado } }),
    onSuccess: refrescar,
    onError: avisarError,
  });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/tareas/${id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });

  return (
    <div className="space-y-4">
      {puedeEditar ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (nueva.trim()) crear.mutate();
          }}
        >
          <Entrada value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Nueva tarea…" maxLength={300} />
          <Boton type="submit" variante="primario" icono={Plus} cargando={crear.isPending}>
            Agregar
          </Boton>
        </form>
      ) : null}
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {COLUMNAS.map((col, i) => {
          const tareas = (q.data ?? []).filter((t) => t.estado === col.id);
          return (
            <div key={col.id} className="min-w-0 rounded-tarjeta border border-borde bg-superficie p-3">
              <p className="mb-2 text-sm font-semibold">
                {col.titulo} <span className="text-tenue">({tareas.length})</span>
              </p>
              <div className="space-y-2">
                {tareas.map((t) => (
                  <div key={t.id} className="flex items-center gap-1 rounded-xl bg-fondo p-2 text-sm">
                    <span className={cx("min-w-0 flex-1 break-words", col.id === "hecho" && "text-tenue line-through")}>{t.titulo}</span>
                    {puedeEditar ? (
                      <>
                        {i > 0 ? <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} aria-label="Mover a la izquierda" onClick={() => mover.mutate({ id: t.id, estado: COLUMNAS[i - 1]!.id })} /> : null}
                        {i < COLUMNAS.length - 1 ? (
                          <Boton tamano="icono" variante="fantasma" icono={ArrowRight} aria-label="Mover a la derecha" onClick={() => mover.mutate({ id: t.id, estado: COLUMNAS[i + 1]!.id })} />
                        ) : null}
                        <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={() => borrar.mutate(t.id)} />
                      </>
                    ) : null}
                  </div>
                ))}
                {!tareas.length ? <p className="text-xs text-tenue">Nada aquí.</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- lista y página

/** Lista en árbol: cada página con sus subpáginas debajo. */
function arbol(notas: Nota[]): { nota: Nota; nivel: number }[] {
  const ids = new Set(notas.map((n) => n.id));
  const salida: { nota: Nota; nivel: number }[] = [];
  const agregar = (padre: string | null, nivel: number) => {
    for (const n of notas.filter((x) => (padre === null ? !x.padre || !ids.has(x.padre) : x.padre === padre))) {
      salida.push({ nota: n, nivel });
      if (nivel < 6) agregar(n.id, nivel + 1);
    }
  };
  agregar(null, 0);
  return salida;
}

export default function Notas() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<"paginas" | "tablero">("paginas");
  const [plantillas, setPlantillas] = useState(false);
  const puedeEditar = usePuede("notas", "escritura");
  const { data, isLoading, error } = useQuery({
    queryKey: ["notas", q],
    queryFn: () => api<Nota[]>(`/api/notas${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
  const seleccion = params.get("id");
  const actual = data?.find((n) => n.id === seleccion) ?? null;
  const filas = useMemo(() => (q ? (data ?? []).map((nota) => ({ nota, nivel: 0 })) : arbol(data ?? [])), [data, q]);

  const crear = useMutation({
    mutationFn: (pl: (typeof PLANTILLAS)[number]) => api<Nota>("/api/notas", { cuerpo: { titulo: pl.titulo, contenido: pl.contenido, icono: pl.icono } }),
    onSuccess: (n) => {
      setPlantillas(false);
      void queryClient.invalidateQueries({ queryKey: ["notas"] });
      setParams({ id: n.id });
    },
    onError: avisarError,
  });

  useEffect(() => {
    if (params.get("nueva") && puedeEditar && !crear.isPending) crear.mutate(PLANTILLAS[0]!);
  }, [params, puedeEditar]);

  return (
    <>
      <Encabezado
        titulo="Bloc de notas"
        descripcion="Notas y páginas tipo Notion, con tareas y tablero."
        acciones={
          puedeEditar ? (
            <Boton variante="primario" icono={Plus} onClick={() => setPlantillas(true)} cargando={crear.isPending}>
              Nueva
            </Boton>
          ) : null
        }
      />
      <Pestanas
        valor={vista}
        alCambiar={setVista}
        opciones={[
          { id: "paginas", texto: "Páginas" },
          { id: "tablero", texto: "Tablero de tareas" },
        ]}
      />
      <ErrorCaja error={error} />
      {vista === "tablero" ? (
        <div className="mt-4">
          <Tablero puedeEditar={puedeEditar} />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[300px_1fr]">
          <div className={cx("min-w-0 space-y-1", actual && "hidden md:block")}>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-tenue" />
              <Entrada className="pl-9" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {isLoading ? <Cargando /> : null}
            {data?.length === 0 ? <Vacio icono={NotebookPen} texto={q ? "Sin resultados." : "Todavía no hay notas."} /> : null}
            {filas.map(({ nota: n, nivel }) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setParams({ id: n.id })}
                style={{ marginLeft: nivel * 14, width: `calc(100% - ${nivel * 14}px)` }}
                className={cx("block rounded-xl border p-2.5 text-left", n.id === seleccion ? "border-acento/60 bg-tarjeta" : "border-borde bg-superficie hover:bg-tarjeta")}
              >
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  <span>{n.icono ?? "📝"}</span>
                  {n.fijada ? <Pin className="h-3 w-3 shrink-0 text-tenue" /> : null}
                  <span className="truncate">{n.titulo || "Sin título"}</span>
                </p>
                {nivel === 0 ? <p className="mt-1 line-clamp-1 text-xs text-tenue">{n.contenido.replace(/[#*>\-[\]|]/g, "").trim() || "Vacía"}</p> : null}
              </button>
            ))}
          </div>
          <div className={cx("min-w-0", !actual && "hidden md:block")}>
            {actual ? (
              <Editor nota={actual} notas={data ?? []} puedeEditar={puedeEditar} alVolver={() => setParams({})} alAbrir={(id) => setParams({ id })} />
            ) : (
              <Vacio icono={NotebookPen} texto="Elige una página o crea una nueva." />
            )}
          </div>
        </div>
      )}
      <Modal abierto={plantillas} titulo="Nueva página" alCerrar={() => setPlantillas(false)}>
        <div className="grid grid-cols-2 gap-2">
          {PLANTILLAS.map((pl) => (
            <button
              key={pl.nombre}
              type="button"
              disabled={crear.isPending}
              onClick={() => crear.mutate(pl)}
              className="flex items-center gap-2 rounded-xl border border-borde p-3 text-left text-sm hover:bg-tarjeta"
            >
              <span className="text-xl">{pl.icono}</span>
              {pl.nombre}
            </button>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1 text-xs text-tenue">
          <KanbanSquare className="h-3 w-3" /> Para tareas sueltas usa la pestaña «Tablero de tareas».
        </p>
      </Modal>
    </>
  );
}
