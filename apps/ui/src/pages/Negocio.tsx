/** Mejoras y notas del negocio en tres columnas: ideas, en progreso, hecho. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Lightbulb, Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Vacio, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";

interface NotaNegocio {
  id: string;
  titulo: string;
  contenido: string;
  estado: "idea" | "en_progreso" | "hecho";
}

const COLUMNAS = [
  { id: "idea", titulo: "Ideas" },
  { id: "en_progreso", titulo: "En progreso" },
  { id: "hecho", titulo: "Hecho" },
] as const;

function Nueva({ alTerminar }: { alTerminar: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const crear = useMutation({
    mutationFn: () => api("/api/negocio/notas", { cuerpo: { titulo, contenido } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["negocio"] });
      alTerminar();
    },
  });
  return (
    <form className="space-y-3" onSubmit={(e: FormEvent) => (e.preventDefault(), crear.mutate())}>
      <Campo etiqueta="Título">
        <Entrada value={titulo} onChange={(e) => setTitulo(e.target.value)} required autoFocus placeholder="Plan de 8 GB para modpacks" />
      </Campo>
      <Campo etiqueta="Detalle">
        <AreaTexto value={contenido} onChange={(e) => setContenido(e.target.value)} />
      </Campo>
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" className="w-full" cargando={crear.isPending}>Guardar</Boton>
    </form>
  );
}

export default function Negocio() {
  const puede = usePuede("negocio", "escritura");
  const [nueva, setNueva] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["negocio"], queryFn: () => api<NotaNegocio[]>("/api/negocio/notas") });
  const mover = (n: NotaNegocio, dir: -1 | 1) => {
    const i = COLUMNAS.findIndex((c) => c.id === n.estado);
    const destino = COLUMNAS[i + dir];
    if (!destino) return;
    void api(`/api/negocio/notas/${n.id}`, { metodo: "PATCH", cuerpo: { estado: destino.id } }).then(() => queryClient.invalidateQueries({ queryKey: ["negocio"] }), avisarError);
  };

  return (
    <>
      <Encabezado titulo="Mejoras del negocio" acciones={puede ? <Boton variante="primario" icono={Plus} onClick={() => setNueva(true)}>Nueva</Boton> : null} />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      {data?.length === 0 ? <Vacio icono={Lightbulb} texto="Anota ideas para tu negocio y llévalas a 'Hecho'." /> : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNAS.map((c, ci) => (
          <section key={c.id} className="rounded-tarjeta border border-borde bg-superficie p-3">
            <h3 className="mb-3 text-sm font-semibold">
              {c.titulo} <span className="text-tenue">({data?.filter((n) => n.estado === c.id).length ?? 0})</span>
            </h3>
            <div className="space-y-2">
              {data
                ?.filter((n) => n.estado === c.id)
                .map((n) => (
                  <article key={n.id} className="rounded-xl bg-fondo p-3 text-sm">
                    <p className="font-medium">{n.titulo}</p>
                    {n.contenido ? <p className="mt-1 whitespace-pre-wrap text-xs text-tenue">{n.contenido}</p> : null}
                    {puede ? (
                      <div className="mt-2 flex justify-end gap-1">
                        <Boton tamano="icono" variante="fantasma" icono={ChevronLeft} disabled={ci === 0} onClick={() => mover(n, -1)} aria-label="Mover a la izquierda" />
                        <Boton tamano="icono" variante="fantasma" icono={ChevronRight} disabled={ci === COLUMNAS.length - 1} onClick={() => mover(n, 1)} aria-label="Mover a la derecha" />
                        <Boton
                          tamano="icono"
                          variante="fantasma"
                          icono={Trash2}
                          aria-label="Borrar"
                          onClick={() => void api(`/api/negocio/notas/${n.id}`, { metodo: "DELETE" }).then(() => queryClient.invalidateQueries({ queryKey: ["negocio"] }), avisarError)}
                        />
                      </div>
                    ) : null}
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
      <Modal abierto={nueva} titulo="Nueva mejora" alCerrar={() => setNueva(false)}>
        <Nueva alTerminar={() => setNueva(false)} />
      </Modal>
    </>
  );
}
