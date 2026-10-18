/** Noticias de tus fuentes RSS (Google Noticias, BBC y las que agregues). */
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Newspaper, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Selector, Vacio, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";

interface Fuente {
  nombre: string;
  url: string;
}
interface Noticia {
  titulo: string;
  url: string;
  fecha: string | null;
  fuente: string;
  resumen: string;
  imagen: string | null;
}

function Fuentes({ alCerrar }: { alCerrar: () => void }) {
  const fuentes = useQuery({ queryKey: ["noticias", "fuentes"], queryFn: () => api<Fuente[]>("/api/noticias/fuentes") });
  const [lista, setLista] = useState<Fuente[] | null>(null);
  const [nueva, setNueva] = useState<Fuente>({ nombre: "", url: "" });
  const actual = lista ?? fuentes.data ?? [];
  const guardar = useMutation({
    mutationFn: (f: Fuente[]) => api("/api/noticias/fuentes", { metodo: "PUT", cuerpo: { fuentes: f } }),
    onSuccess: () => {
      avisar("Fuentes guardadas");
      void queryClient.invalidateQueries({ queryKey: ["noticias"] });
      alCerrar();
    },
    onError: avisarError,
  });
  const google = (tema: string) => `https://news.google.com/rss/search?q=${encodeURIComponent(tema)}&hl=es-419&gl=MX&ceid=MX:es-419`;
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {actual.map((f, i) => (
          <div key={`${f.url}-${i}`} className="flex items-center gap-2 rounded-xl bg-fondo p-2 text-sm">
            <span className="min-w-0 flex-1 truncate">
              <b>{f.nombre}</b> <span className="text-xs text-tenue">{f.url}</span>
            </span>
            <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar" onClick={() => setLista(actual.filter((_, j) => j !== i))} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <Entrada value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Nombre" />
        <Entrada value={nueva.url} onChange={(e) => setNueva({ ...nueva, url: e.target.value })} placeholder="URL del RSS, o escribe un tema" />
        <Boton
          icono={Plus}
          disabled={!nueva.nombre.trim() || !nueva.url.trim()}
          onClick={() => {
            const url = /^https?:\/\//i.test(nueva.url.trim()) ? nueva.url.trim() : google(nueva.url.trim());
            setLista([...actual, { nombre: nueva.nombre.trim(), url }]);
            setNueva({ nombre: "", url: "" });
          }}
        >
          Agregar
        </Boton>
      </div>
      <p className="text-xs text-tenue">
        Para un tema (ej. "Pterodactyl" o "Monterrey") escribe solo la palabra en el campo de URL: se crea una fuente de Google Noticias. Muchos sitios tienen su RSS en /feed o /rss.
      </p>
      <Boton variante="primario" cargando={guardar.isPending} onClick={() => guardar.mutate(actual)}>
        Guardar fuentes
      </Boton>
    </div>
  );
}

export default function Noticias() {
  const [fuente, setFuente] = useState("");
  const [editar, setEditar] = useState(false);
  const fuentes = useQuery({ queryKey: ["noticias", "fuentes"], queryFn: () => api<Fuente[]>("/api/noticias/fuentes") });
  const datos = useQuery({
    queryKey: ["noticias", "lista", fuente],
    queryFn: () => api<{ noticias: Noticia[]; errores: { fuente: string; error: string }[] }>(`/api/noticias${fuente ? `?fuente=${encodeURIComponent(fuente)}` : ""}`),
    refetchInterval: 15 * 60_000,
  });
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Noticias"
        descripcion="Lo último de tus fuentes. Toca una noticia para abrirla."
        acciones={
          <>
            <Boton icono={RefreshCw} cargando={datos.isFetching} onClick={() => void datos.refetch()}>
              Actualizar
            </Boton>
            <Boton icono={Settings2} onClick={() => setEditar(true)}>
              Fuentes
            </Boton>
          </>
        }
      />
      <Selector className="max-w-xs" value={fuente} onChange={(e) => setFuente(e.target.value)}>
        <option value="">Todas las fuentes</option>
        {fuentes.data?.map((f) => (
          <option key={f.nombre} value={f.nombre}>
            {f.nombre}
          </option>
        ))}
      </Selector>
      {datos.isLoading ? <Cargando /> : null}
      <ErrorCaja error={datos.error} />
      {datos.data?.errores.length ? <p className="text-xs text-aviso">No se pudieron leer: {datos.data.errores.map((e) => e.fuente).join(", ")}</p> : null}
      {datos.data?.noticias.length === 0 ? <Vacio icono={Newspaper} texto="Sin noticias por ahora." /> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {datos.data?.noticias.map((n) => (
          <button key={n.url} type="button" onClick={() => abrirExterno(n.url)} className="flex gap-3 rounded-tarjeta border border-borde bg-superficie p-3 text-left hover:bg-tarjeta">
            {n.imagen ? <img src={n.imagen} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-20 w-28 shrink-0 rounded-lg object-cover" /> : null}
            <div className="min-w-0 flex-1">
              <p className="line-clamp-3 text-sm font-medium">{n.titulo}</p>
              {n.resumen && n.resumen !== n.titulo ? <p className="mt-1 line-clamp-2 text-xs text-tenue">{n.resumen}</p> : null}
              <p className="mt-1 text-xs text-tenue">
                {n.fuente}
                {n.fecha ? ` · ${haceCuanto(n.fecha)}` : ""}
              </p>
            </div>
            <ExternalLink className="h-4 w-4 shrink-0 text-tenue" />
          </button>
        ))}
      </div>
      <Modal abierto={editar} titulo="Fuentes de noticias" alCerrar={() => setEditar(false)} ancho="max-w-2xl">
        {editar ? <Fuentes alCerrar={() => setEditar(false)} /> : null}
      </Modal>
    </div>
  );
}
