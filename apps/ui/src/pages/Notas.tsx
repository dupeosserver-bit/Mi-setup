import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckSquare, Files, KanbanSquare, LayoutTemplate, NotebookPen, Pin, Plus, Search, SquarePen, Table, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { EditorNota, type Nota } from "../components/EditorNota";
import { usePaginado } from "../components/Paginas";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Vacio, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { localeActual } from "../lib/idioma";
import { useModoPagina } from "../lib/marco";
import { fondoNota } from "../lib/markdownNotas";

const PLANTILLAS: { nombre: string; icono: string; titulo: string; contenido: string }[] = [
  { nombre: "En blanco", icono: "📝", titulo: "Nueva página", contenido: "" },
  { nombre: "Lista de tareas", icono: "✅", titulo: "Pendientes", contenido: "## Hoy\n- [ ] \n- [ ] \n\n## Esta semana\n- [ ] \n" },
  {
    nombre: "Diario",
    icono: "📔",
    titulo: new Date().toLocaleDateString(localeActual(), { weekday: "long", day: "numeric", month: "long" }),
    contenido: "## ¿Cómo me siento?\n\n## Lo que hice\n- \n\n## Agradezco\n- \n",
  },
  { nombre: "Lista de compras", icono: "🛒", titulo: "Compras", contenido: "- [ ] \n- [ ] \n- [ ] \n" },
  { nombre: "Ideas", icono: "💡", titulo: "Ideas", contenido: "## Idea\n\n**Por qué:** \n\n**Siguiente paso:** \n" },
  { nombre: "Reunión", icono: "🗓️", titulo: "Reunión", contenido: "**Fecha:** \n**Con:** \n\n## Temas\n- \n\n## Acuerdos\n- [ ] \n" },
  { nombre: "Tabla", icono: "📊", titulo: "Tabla", contenido: "| Nombre | Estado | Notas |\n| --- | --- | --- |\n|  |  |  |\n" },
];

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
              className={cx("min-w-0 rounded-tarjeta border bg-superficie p-3", arrastrando ? "border-dashed border-acento" : "border-borde")}
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

function Previa({ contenido }: { contenido: string }) {
  const lineas = contenido
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^\|?\s*-{3,}/.test(l))
    .slice(0, 7);
  if (!lineas.length) return <p className="text-xs italic text-tenue">Vacía</p>;
  return (
    <div className="space-y-1 text-[13px] leading-snug text-tenue">
      {lineas.map((l, i) => {
        const tarea = /^[-*] \[( |x|X)\]\s*(.*)$/.exec(l);
        if (tarea) {
          const hecha = tarea[1] !== " ";
          return (
            <p key={i} className="flex items-start gap-1.5">
              <span className={cx("mt-0.5 grid h-3.5 w-3.5 shrink-0 place-items-center rounded border", hecha ? "border-acento bg-acento" : "border-tenue")} />
              <span className={cx("min-w-0 break-words", hecha && "line-through opacity-70")}>{tarea[2] || "…"}</span>
            </p>
          );
        }
        const texto = l.replace(/^#+\s*/, "").replace(/^[-*>]\s*/, "• ").replace(/[*_|`]/g, "");
        return (
          <p key={i} className={cx("break-words", /^#/.test(l) && "font-semibold text-texto")}>
            {texto}
          </p>
        );
      })}
    </div>
  );
}

function TarjetaNota({ nota, hijas, alAbrir }: { nota: Nota; hijas: number; alAbrir: () => void }) {
  const fondo = fondoNota(nota.color);
  return (
    <button
      type="button"
      onClick={alAbrir}
      className="mb-3 block w-full break-inside-avoid rounded-2xl border border-borde p-3.5 text-left transition-transform hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--texto)_22%,transparent)]"
      style={{ background: fondo ?? "var(--superficie)" }}
    >
      <b className="mb-1.5 flex items-start gap-1.5 text-sm">
        <span className="shrink-0">{nota.icono ?? "📝"}</span>
        <span className="min-w-0 break-words">{nota.titulo || "Sin título"}</span>
        {nota.fijada ? <Pin className="ml-auto h-3.5 w-3.5 shrink-0 text-tenue" /> : null}
      </b>
      <Previa contenido={nota.contenido} />
      <small className="mt-2.5 flex items-center gap-2 text-[11px] text-tenue">
        {haceCuanto(nota.actualizada)}
        {hijas ? (
          <span className="inline-flex items-center gap-1">
            <Files className="h-3 w-3" />
            {hijas}
          </span>
        ) : null}
      </small>
    </button>
  );
}

const MURO = "columns-2 gap-3 sm:columns-3 xl:columns-4 2xl:columns-5";

export default function Notas() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [vista, setVista] = useState<"notas" | "tablero">("notas");
  const [plantillas, setPlantillas] = useState(false);
  const puedeEditar = usePuede("notas", "escritura");
  const { data, isLoading, error } = useQuery({
    queryKey: ["notas", q],
    queryFn: () => api<Nota[]>(`/api/notas${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
  const seleccion = params.get("id");
  const actual = data?.find((n) => n.id === seleccion) ?? null;
  useModoPagina("completa", Boolean(actual));

  const ids = useMemo(() => new Set((data ?? []).map((n) => n.id)), [data]);
  const hijasDe = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of data ?? []) if (n.padre) m.set(n.padre, (m.get(n.padre) ?? 0) + 1);
    return m;
  }, [data]);
  const principales = useMemo(() => (data ?? []).filter((n) => q || !n.padre || !ids.has(n.padre)), [data, q, ids]);
  const fijadas = principales.filter((n) => n.fijada);
  const otras = useMemo(() => principales.filter((n) => !n.fijada), [principales]);
  const { visibles, paginas } = usePaginado(otras, 20);

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

  if (actual) return <EditorNota key={actual.id} nota={actual} notas={data ?? []} puedeEditar={puedeEditar} pantalla alVolver={() => setParams({})} alAbrir={(id) => setParams({ id })} />;

  const rapido = (nombre: string) => crear.mutate(PLANTILLAS.find((p) => p.nombre === nombre) ?? PLANTILLAS[0]!);

  return (
    <>
      <Encabezado
        titulo="Bloc de notas"
        descripcion="Tus notas y páginas, con tareas y tablero."
        acciones={
          <div className="flex gap-1 rounded-xl bg-superficie p-1">
            {(
              [
                ["notas", "Notas", NotebookPen],
                ["tablero", "Tablero", KanbanSquare],
              ] as const
            ).map(([id, texto, Icono]) => (
              <button
                key={id}
                type="button"
                onClick={() => setVista(id)}
                className={cx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm", vista === id ? "bg-[color-mix(in_srgb,var(--acento)_16%,transparent)] text-acento" : "text-tenue hover:text-texto")}
              >
                <Icono className="h-4 w-4" />
                {texto}
              </button>
            ))}
          </div>
        }
      />
      <ErrorCaja error={error} />
      {vista === "tablero" ? (
        <Tablero puedeEditar={puedeEditar} />
      ) : (
        <>
          <div className="mx-auto mb-4 flex max-w-2xl items-center gap-1 rounded-2xl border border-borde bg-superficie p-1.5 shadow-lg">
            {puedeEditar ? (
              <button type="button" disabled={crear.isPending} onClick={() => rapido("En blanco")} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-tenue hover:text-texto">
                <SquarePen className="h-4 w-4 shrink-0" />
                <span className="truncate">Escribe una nota…</span>
              </button>
            ) : (
              <span className="flex-1" />
            )}
            {puedeEditar ? (
              <>
                <Boton tamano="icono" variante="fantasma" icono={CheckSquare} aria-label="Lista de tareas" title="Lista de tareas" onClick={() => rapido("Lista de tareas")} />
                <Boton tamano="icono" variante="fantasma" icono={Table} aria-label="Tabla" title="Tabla" onClick={() => rapido("Tabla")} />
                <Boton tamano="icono" variante="fantasma" icono={LayoutTemplate} aria-label="Plantillas" title="Plantillas" onClick={() => setPlantillas(true)} />
              </>
            ) : null}
          </div>
          <div className="relative mx-auto mb-5 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-tenue" />
            <Entrada className="pl-9" placeholder="Buscar en tus notas" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {isLoading ? <Cargando /> : null}
          {data?.length === 0 ? <Vacio icono={NotebookPen} texto={q ? "Sin resultados." : "Todavía no hay notas."} /> : null}
          {fijadas.length ? (
            <section className="mb-4">
              <h2 className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-tenue">
                <Pin className="h-3.5 w-3.5" />
                Fijadas
              </h2>
              <div className={MURO}>
                {fijadas.map((n) => (
                  <TarjetaNota key={n.id} nota={n} hijas={hijasDe.get(n.id) ?? 0} alAbrir={() => setParams({ id: n.id })} />
                ))}
              </div>
            </section>
          ) : null}
          {otras.length ? (
            <section>
              {fijadas.length ? <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-tenue">Otras notas</h2> : null}
              <div className={MURO}>
                {visibles.map((n) => (
                  <TarjetaNota key={n.id} nota={n} hijas={hijasDe.get(n.id) ?? 0} alAbrir={() => setParams({ id: n.id })} />
                ))}
              </div>
              {paginas}
            </section>
          ) : null}
        </>
      )}
      <Modal abierto={plantillas} titulo="Nueva nota" alCerrar={() => setPlantillas(false)}>
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
          <KanbanSquare className="h-3 w-3" /> Para tareas sueltas usa «Tablero».
        </p>
      </Modal>
    </>
  );
}
