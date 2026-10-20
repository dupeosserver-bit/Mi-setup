/**
 * Bloc de notas tipo Notion: las mismas notas se escriben como texto o se ven
 * como página (títulos, listas, casillas que se marcan, tablas), con subpáginas,
 * ícono, plantillas y un tablero de tareas. Guardado automático y sincronizado.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  KanbanSquare,
  NotebookPen,
  Pin,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Pestanas, Vacio, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { EditorNota, type Nota } from "../components/EditorNota";
import { fondoNota } from "../lib/markdownNotas";


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
  const renombrar = useMutation({
    mutationFn: ({ id, titulo }: { id: string; titulo: string }) => api(`/api/tareas/${id}`, { metodo: "PATCH", cuerpo: { titulo } }),
    onSuccess: refrescar,
    onError: avisarError,
  });
  // Tocar una tarea abre sus opciones (antes solo respondían las flechas pequeñas).
  const [abierta, setAbierta] = useState<Tarea | null>(null);
  const [titulo, setTitulo] = useState("");
  const [arrastrando, setArrastrando] = useState<string | null>(null);

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
            <div
              key={col.id}
              className={cx("min-w-0 rounded-tarjeta border bg-superficie p-3", arrastrando ? "border-dashed border-acento/60" : "border-borde")}
              onDragOver={(e) => puedeEditar && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                setArrastrando(null);
                if (id && puedeEditar) mover.mutate({ id, estado: col.id });
              }}
            >
              <p className="mb-2 text-sm font-semibold">
                {col.titulo} <span className="text-tenue">({tareas.length})</span>
              </p>
              <div className="space-y-2">
                {tareas.map((t) => (
                  <div
                    key={t.id}
                    draggable={puedeEditar}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", t.id);
                      setArrastrando(t.id);
                    }}
                    onDragEnd={() => setArrastrando(null)}
                    className="flex items-center gap-1 rounded-xl bg-fondo p-2 text-sm"
                  >
                    {puedeEditar ? (
                      <input
                        type="checkbox"
                        aria-label={col.id === "hecho" ? "Marcar como pendiente" : "Marcar como hecha"}
                        checked={col.id === "hecho"}
                        onChange={() => mover.mutate({ id: t.id, estado: col.id === "hecho" ? "pendiente" : "hecho" })}
                        className="h-4 w-4 shrink-0 accent-acento"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setAbierta(t);
                        setTitulo(t.titulo);
                      }}
                      className={cx("min-w-0 flex-1 break-words text-left", col.id === "hecho" && "text-tenue line-through")}
                    >
                      {t.titulo}
                    </button>
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
      <p className="text-xs text-tenue">Toca una tarea para editarla o moverla. En la PC también puedes arrastrarla a otra columna.</p>
      <Modal abierto={abierta !== null} titulo="Tarea" alCerrar={() => setAbierta(null)}>
        {abierta ? (
          <div className="space-y-3">
            {puedeEditar ? (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (titulo.trim() && titulo.trim() !== abierta.titulo) renombrar.mutate({ id: abierta.id, titulo: titulo.trim() });
                  setAbierta(null);
                }}
              >
                <Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={300} autoFocus />
                <Boton type="submit" variante="primario">
                  Guardar
                </Boton>
              </form>
            ) : (
              <p className="text-sm">{abierta.titulo}</p>
            )}
            {puedeEditar ? (
              <>
                <p className="text-xs text-tenue">Mover a:</p>
                <div className="flex flex-wrap gap-2">
                  {COLUMNAS.map((c) => (
                    <Boton
                      key={c.id}
                      tamano="sm"
                      variante={abierta.estado === c.id ? "primario" : "secundario"}
                      onClick={() => {
                        mover.mutate({ id: abierta.id, estado: c.id });
                        setAbierta(null);
                      }}
                    >
                      {c.titulo}
                    </Boton>
                  ))}
                </div>
                <Boton
                  tamano="sm"
                  variante="peligro"
                  icono={Trash2}
                  onClick={() => {
                    borrar.mutate(abierta.id);
                    setAbierta(null);
                  }}
                >
                  Borrar tarea
                </Boton>
              </>
            ) : null}
          </div>
        ) : null}
      </Modal>
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
                style={{ marginLeft: nivel * 14, width: `calc(100% - ${nivel * 14}px)`, backgroundColor: fondoNota(n.color) }}
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
              <EditorNota nota={actual} notas={data ?? []} puedeEditar={puedeEditar} alVolver={() => setParams({})} alAbrir={(id) => setParams({ id })} />
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
