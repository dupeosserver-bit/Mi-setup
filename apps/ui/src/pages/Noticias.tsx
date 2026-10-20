/** Noticias de tus fuentes RSS (Google Noticias, BBC y las que agregues). */
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Newspaper, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Pestanas, Selector, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { queryClient } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";

interface Fuente {
  nombre: string;
  url: string;
}
interface Catalogo {
  temas: { id: string; nombre: string }[];
  grupos: { grupo: string; fuentes: Fuente[] }[];
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
  const fuentes = useQuery({
    queryKey: ["noticias", "fuentes"],
    queryFn: () => api<Fuente[]>("/api/noticias/fuentes"),
  });
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
  const catalogo = useQuery({
    queryKey: ["noticias", "catalogo"],
    queryFn: () => api<Catalogo>("/api/noticias/catalogo"),
    staleTime: Infinity,
  });
  const tiene = (url: string) => actual.some((f) => f.url === url);
  return (
    <div className="space-y-3">
      {catalogo.data ? (
        <details className="rounded-xl border border-borde p-2" open>
          <summary className="cursor-pointer text-sm font-medium">Sugeridas (toca para agregar)</summary>
          <div className="mt-2 space-y-2">
            {catalogo.data.grupos.map((g) => (
              <div key={g.grupo}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-tenue">{g.grupo}</p>
                <div className="flex flex-wrap gap-1">
                  {g.fuentes.map((f) => (
                    <button
                      key={f.url}
                      type="button"
                      disabled={tiene(f.url) || actual.length >= 20}
                      onClick={() => setLista([...actual, f])}
                      className={cx("rounded-full border px-2.5 py-1 text-xs", tiene(f.url) ? "border-acento bg-acento/20" : "border-borde hover:bg-tarjeta")}
                    >
                      {tiene(f.url) ? "✓ " : "+ "}
                      {f.nombre}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
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
        Para un tema (ej. "Pterodactyl" o "Monterrey") escribe solo la palabra en el campo de URL: se crea una fuente de Google Noticias. Muchos sitios tienen su RSS en /feed o
        /rss.
      </p>
      <Boton variante="primario" cargando={guardar.isPending} onClick={() => guardar.mutate(actual)}>
        Guardar fuentes
      </Boton>
    </div>
  );
}

function Tarjetas({ noticias }: { noticias: Noticia[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {noticias.map((n, i) => (
        <button
          key={`${n.url}-${i}`}
          type="button"
          onClick={() => abrirExterno(n.url)}
          className="flex gap-3 rounded-tarjeta border border-borde bg-superficie p-3 text-left hover:bg-tarjeta"
        >
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
  );
}

/** Lo más visto en Google Noticias México, por tema (en su orden, no por fecha). */
function Populares() {
  const [tema, setTema] = useState("inicio");
  const catalogo = useQuery({
    queryKey: ["noticias", "catalogo"],
    queryFn: () => api<Catalogo>("/api/noticias/catalogo"),
    staleTime: Infinity,
  });
  const q = useQuery({
    queryKey: ["noticias", "populares", tema],
    queryFn: () => api<{ noticias: Noticia[] }>(`/api/noticias/populares?tema=${tema}`),
    refetchInterval: 15 * 60_000,
  });
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {catalogo.data?.temas.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTema(t.id)}
            className={cx("whitespace-nowrap rounded-full border px-3 py-1 text-xs", tema === t.id ? "border-acento bg-acento text-black" : "border-borde hover:bg-tarjeta")}
          >
            {t.nombre}
          </button>
        ))}
      </div>
      {q.isLoading ? <Cargando /> : null}
      <ErrorCaja error={q.error} />
      {q.data ? <Tarjetas noticias={q.data.noticias} /> : null}
    </div>
  );
}

export default function Noticias() {
  const [vista, setVista] = useState<"populares" | "mias">("populares");
  const [fuente, setFuente] = useState("");
  const [editar, setEditar] = useState(false);
  const fuentes = useQuery({
    queryKey: ["noticias", "fuentes"],
    queryFn: () => api<Fuente[]>("/api/noticias/fuentes"),
  });
  const datos = useQuery({
    queryKey: ["noticias", "lista", fuente],
    queryFn: () =>
      api<{
        noticias: Noticia[];
        errores: { fuente: string; error: string }[];
      }>(`/api/noticias${fuente ? `?fuente=${encodeURIComponent(fuente)}` : ""}`),
    refetchInterval: 15 * 60_000,
    enabled: vista === "mias",
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
      <Pestanas
        valor={vista}
        alCambiar={setVista}
        opciones={[
          { id: "populares", texto: "Populares" },
          { id: "mias", texto: "Mis fuentes" },
        ]}
      />
      {vista === "populares" ? <Populares /> : null}
      {vista === "mias" ? (
        <>
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
          {datos.data ? <Tarjetas noticias={datos.data.noticias} /> : null}
        </>
      ) : null}
      <Modal abierto={editar} titulo="Fuentes de noticias" alCerrar={() => setEditar(false)} ancho="max-w-2xl">
        {editar ? <Fuentes alCerrar={() => setEditar(false)} /> : null}
      </Modal>
    </div>
  );
}
