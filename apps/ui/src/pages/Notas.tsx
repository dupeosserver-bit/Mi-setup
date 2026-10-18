/** Bloc de notas con búsqueda, fijado, guardado automático y sincronización. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, NotebookPen, Pin, PinOff, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Vacio, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";

interface Nota {
  id: string;
  titulo: string;
  contenido: string;
  fijada: boolean;
  actualizada: string;
}

function Editor({ nota, puedeEditar, alVolver }: { nota: Nota; puedeEditar: boolean; alVolver: () => void }) {
  const [titulo, setTitulo] = useState(nota.titulo);
  const [contenido, setContenido] = useState(nota.contenido);
  const [estado, setEstado] = useState<"guardado" | "pendiente" | "guardando">("guardado");
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTitulo(nota.titulo);
    setContenido(nota.contenido);
    setEstado("guardado");
    // Solo al cambiar de nota; los cambios remotos de la misma nota no pisan lo que se escribe.
  }, [nota.id]);

  const guardar = (cambios: Partial<Nota>) => {
    setEstado("pendiente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(async () => {
      setEstado("guardando");
      try {
        await api(`/api/notas/${nota.id}`, { metodo: "PATCH", cuerpo: cambios });
        setEstado("guardado");
        void queryClient.invalidateQueries({ queryKey: ["notas"] });
      } catch (err) {
        avisarError(err);
        setEstado("pendiente");
      }
    }, 700);
  };

  return (
    <div className="flex h-full flex-col rounded-tarjeta border border-borde bg-superficie">
      <div className="flex items-center gap-2 border-b border-borde p-2">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alVolver} className="md:hidden" aria-label="Volver" />
        <span className="flex-1 text-xs text-tenue">
          {estado === "guardado" ? `Guardado · ${haceCuanto(nota.actualizada)}` : estado === "guardando" ? "Guardando…" : "Sin guardar"}
        </span>
        {puedeEditar ? (
          <>
            <Boton
              tamano="icono"
              variante="fantasma"
              icono={nota.fijada ? PinOff : Pin}
              aria-label={nota.fijada ? "Desfijar" : "Fijar"}
              onClick={() =>
                void api(`/api/notas/${nota.id}`, { metodo: "PATCH", cuerpo: { fijada: !nota.fijada } }).then(() =>
                  queryClient.invalidateQueries({ queryKey: ["notas"] }),
                )
              }
            />
            <Boton
              tamano="icono"
              variante="fantasma"
              icono={Trash2}
              aria-label="Borrar"
              onClick={async () => {
                if (!(await confirmar({ titulo: "Borrar nota", mensaje: `¿Borrar "${nota.titulo || "sin título"}"?`, boton: "Borrar" }))) return;
                await api(`/api/notas/${nota.id}`, { metodo: "DELETE" }).catch(avisarError);
                await queryClient.invalidateQueries({ queryKey: ["notas"] });
                alVolver();
              }}
            />
          </>
        ) : null}
      </div>
      <input
        value={titulo}
        readOnly={!puedeEditar}
        placeholder="Título"
        onChange={(e) => {
          setTitulo(e.target.value);
          guardar({ titulo: e.target.value });
        }}
        className="bg-transparent px-4 pt-4 font-titulo text-lg font-semibold outline-none placeholder:text-tenue"
      />
      <textarea
        value={contenido}
        readOnly={!puedeEditar}
        placeholder="Escribe aquí…"
        onChange={(e) => {
          setContenido(e.target.value);
          guardar({ contenido: e.target.value });
        }}
        className="min-h-[50vh] flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-tenue"
      />
    </div>
  );
}

export default function Notas() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const puedeEditar = usePuede("notas", "escritura");
  const { data, isLoading, error } = useQuery({
    queryKey: ["notas", q],
    queryFn: () => api<Nota[]>(`/api/notas${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
  const seleccion = params.get("id");
  const actual = data?.find((n) => n.id === seleccion) ?? null;

  const crear = useMutation({
    mutationFn: () => api<Nota>("/api/notas", { cuerpo: { titulo: "Nueva nota" } }),
    onSuccess: (n) => {
      void queryClient.invalidateQueries({ queryKey: ["notas"] });
      setParams({ id: n.id });
    },
    onError: avisarError,
  });

  useEffect(() => {
    if (params.get("nueva") && puedeEditar && !crear.isPending) crear.mutate();
  }, [params, puedeEditar]);

  return (
    <>
      <Encabezado
        titulo="Bloc de notas"
        acciones={puedeEditar ? <Boton variante="primario" icono={Plus} onClick={() => crear.mutate()} cargando={crear.isPending}>Nueva nota</Boton> : null}
      />
      <ErrorCaja error={error} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_1fr]">
        <div className={cx("space-y-2", actual && "hidden md:block")}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-tenue" />
            <Entrada className="pl-9" placeholder="Buscar notas" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {isLoading ? <Cargando /> : null}
          {data?.length === 0 ? <Vacio icono={NotebookPen} texto={q ? "Sin resultados." : "Todavía no hay notas."} /> : null}
          {data?.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setParams({ id: n.id })}
              className={cx(
                "w-full rounded-xl border p-3 text-left",
                n.id === seleccion ? "border-acento/60 bg-tarjeta" : "border-borde bg-superficie hover:bg-tarjeta",
              )}
            >
              <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                {n.fijada ? <Pin className="h-3 w-3 shrink-0 text-tenue" /> : null}
                {n.titulo || "Sin título"}
              </p>
              <p className="mt-1 line-clamp-2 text-xs text-tenue">{n.contenido || "Vacía"}</p>
            </button>
          ))}
        </div>
        <div className={cx(!actual && "hidden md:block")}>
          {actual ? (
            <Editor nota={actual} puedeEditar={puedeEditar} alVolver={() => setParams({})} />
          ) : (
            <Vacio icono={NotebookPen} texto="Elige una nota o crea una nueva." />
          )}
        </div>
      </div>
    </>
  );
}
