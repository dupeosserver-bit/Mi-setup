/** Películas y series: buscar, dónde verlas en México, siguiente capítulo y tu lista "por ver". */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, CalendarClock, Check, Clapperboard, ExternalLink, Film, Play, Radio, Search, Star, Trash2, Tv } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Modal, Pestanas, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { abrirExterno } from "../lib/plataforma";

type TipoTmdb = "movie" | "tv";
interface Resumen {
  id: number;
  tipo: TipoTmdb;
  titulo: string;
  poster: string | null;
  fecha: string | null;
  calificacion: number | null;
  sinopsis: string;
}
interface Proveedor {
  nombre: string;
  logo: string;
}
interface Detalle extends Resumen {
  generos: string[];
  duracion: number | null;
  temporadas: number | null;
  estado: string | null;
  siguienteCapitulo: { fecha: string; temporada: number; capitulo: number; nombre: string } | null;
  dondeVer: { suscripcion: Proveedor[]; gratis?: Proveedor[]; renta: Proveedor[]; compra: Proveedor[]; enlace: string | null };
  trailer?: { youtube: string; nombre: string } | null;
}
interface PorVer {
  id: string;
  tmdbId: number;
  tipo: TipoTmdb;
  titulo: string;
  poster: string | null;
  vista: boolean;
}

/** Servicios gratis y legales con anuncios (México). */
const CANALES_GRATIS = [
  { nombre: "Pluto TV (canales en vivo)", url: "https://pluto.tv/latam/live-tv" },
  { nombre: "Tubi", url: "https://tubitv.com/" },
  { nombre: "ViX gratis", url: "https://vix.com/" },
  { nombre: "Canela.TV", url: "https://www.canela.tv/" },
  { nombre: "Películas gratis en YouTube", url: "https://www.youtube.com/feed/storefront?bp=ogUCKAU%3D" },
  { nombre: "Plex (gratis)", url: "https://watch.plex.tv/es/on-demand" },
] as const;

const fechaBonita = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });

function Poster({ r, alAbrir }: { r: { titulo: string; poster: string | null; fecha?: string | null; calificacion?: number | null; tipo: TipoTmdb }; alAbrir: () => void }) {
  return (
    <button type="button" onClick={alAbrir} className="group min-w-0 text-left">
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-fondo">
        {r.poster ? (
          <img src={r.poster} alt={r.titulo} loading="lazy" className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center p-2 text-center text-xs text-tenue">{r.titulo}</div>
        )}
        {r.calificacion ? (
          <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-white">
            <Star className="h-3 w-3 fill-current text-yellow-400" /> {r.calificacion}
          </span>
        ) : null}
      </div>
      <p className="mt-1 truncate text-sm font-medium">{r.titulo}</p>
      <p className="text-xs text-tenue">
        {r.tipo === "tv" ? "Serie" : "Película"}
        {r.fecha ? ` · ${r.fecha.slice(0, 4)}` : ""}
      </p>
    </button>
  );
}

function Rejilla({ elementos, alAbrir }: { elementos: Resumen[]; alAbrir: (r: Resumen) => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {elementos.map((r) => (
        <Poster key={`${r.tipo}-${r.id}`} r={r} alAbrir={() => alAbrir(r)} />
      ))}
    </div>
  );
}

function Proveedores({ titulo, lista }: { titulo: string; lista: Proveedor[] }) {
  if (!lista.length) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-tenue">{titulo}</p>
      <div className="flex flex-wrap gap-2">
        {lista.map((p) => (
          <span key={p.nombre} className="flex items-center gap-1.5 rounded-lg bg-fondo py-1 pl-1 pr-2 text-xs">
            <img src={p.logo} alt="" className="h-6 w-6 rounded" />
            {p.nombre}
          </span>
        ))}
      </div>
    </div>
  );
}

function Ficha({ tipo, id, alCerrar, enLista }: { tipo: TipoTmdb; id: number; alCerrar: () => void; enLista: boolean }) {
  const puede = usePuede("peliculas", "escritura");
  const q = useQuery({ queryKey: ["peliculas", tipo, id], queryFn: () => api<Detalle>(`/api/peliculas/${tipo}/${id}`) });
  const agregar = useMutation({
    mutationFn: (d: Detalle) => api("/api/peliculas/por-ver", { metodo: "POST", cuerpo: { tmdbId: d.id, tipo: d.tipo, titulo: d.titulo, poster: d.poster } }),
    onSuccess: () => {
      avisar("Agregada a tu lista");
      void queryClient.invalidateQueries({ queryKey: ["peliculas", "por-ver"] });
    },
    onError: avisarError,
  });
  const d = q.data;
  const navegar = useNavigate();
  const [verTrailer, setVerTrailer] = useState(false);
  // ¿La tienes en Mis videos? (mismo título, sin importar mayúsculas ni acentos)
  const misVideos = useQuery({ queryKey: ["media", "videos"], queryFn: () => api<{ id: string; titulo: string }[]>("/api/media/videos"), retry: false, enabled: usePuede("videos") });
  const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const laTienes = d ? (misVideos.data ?? []).find((v) => normal(v.titulo).includes(normal(d.titulo)) && normal(d.titulo).length >= 3) : undefined;
  const sinDonde = d && !d.dondeVer.suscripcion.length && !d.dondeVer.renta.length && !d.dondeVer.compra.length && !d.dondeVer.gratis?.length;
  return (
    <Modal abierto titulo={d?.titulo ?? "Cargando…"} alCerrar={alCerrar}>
      {q.isLoading ? <Cargando /> : null}
      <ErrorCaja error={q.error} />
      {d ? (
        <div className="space-y-4">
          {verTrailer && d.trailer ? (
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe
                title={d.trailer.nombre}
                src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(d.trailer.youtube)}?autoplay=1&rel=0`}
                className="h-full w-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {d.trailer ? (
              <Boton variante="primario" icono={Play} onClick={() => setVerTrailer((v) => !v)}>
                {verTrailer ? "Ocultar tráiler" : "Ver tráiler"}
              </Boton>
            ) : null}
            {laTienes ? (
              <Boton variante="primario" icono={Film} onClick={() => navegar("/entretenimiento/videos")}>
                Ver ahora (la tienes en Mis videos)
              </Boton>
            ) : null}
          </div>
          <div className="flex gap-3">
            {d.poster ? <img src={d.poster} alt="" className="w-24 shrink-0 self-start rounded-xl sm:w-32" /> : null}
            <div className="min-w-0 space-y-2 text-sm">
              <div className="flex flex-wrap gap-1">
                <Insignia>{d.tipo === "tv" ? "Serie" : "Película"}</Insignia>
                {d.calificacion ? <Insignia tono="aviso">★ {d.calificacion}</Insignia> : null}
                {d.generos.slice(0, 3).map((g) => (
                  <Insignia key={g}>{g}</Insignia>
                ))}
              </div>
              <p className="text-tenue">
                {d.fecha ? fechaBonita(d.fecha) : "Sin fecha"}
                {d.duracion ? ` · ${Math.floor(d.duracion / 60)} h ${d.duracion % 60} min` : ""}
                {d.temporadas ? ` · ${d.temporadas} temporada${d.temporadas > 1 ? "s" : ""}` : ""}
              </p>
              <p className="line-clamp-6">{d.sinopsis || "Sin descripción en español."}</p>
            </div>
          </div>
          {d.siguienteCapitulo ? (
            <div className="flex items-start gap-2 rounded-xl border border-acento/40 bg-acento/10 p-3 text-sm">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-acento" />
              <span>
                Siguiente capítulo: T{d.siguienteCapitulo.temporada} E{d.siguienteCapitulo.capitulo}
                {d.siguienteCapitulo.nombre ? ` "${d.siguienteCapitulo.nombre}"` : ""} el {fechaBonita(d.siguienteCapitulo.fecha)}
              </span>
            </div>
          ) : d.tipo === "tv" && d.estado === "Ended" ? (
            <p className="text-xs text-tenue">Esta serie ya terminó.</p>
          ) : null}
          <div className="space-y-3">
            <p className="font-semibold">Dónde verla en México</p>
            {sinDonde ? <p className="text-sm text-tenue">No aparece en ninguna plataforma de México por ahora.</p> : null}
            <Proveedores titulo="Gratis (con anuncios)" lista={d.dondeVer.gratis ?? []} />
            <Proveedores titulo="Incluida en tu suscripción" lista={d.dondeVer.suscripcion} />
            <Proveedores titulo="Rentar" lista={d.dondeVer.renta} />
            <Proveedores titulo="Comprar" lista={d.dondeVer.compra} />
            {d.dondeVer.enlace ? (
              <Boton tamano="sm" icono={ExternalLink} onClick={() => abrirExterno(d.dondeVer.enlace!)}>
                Ver opciones y precios
              </Boton>
            ) : null}
          </div>
          {puede ? (
            <Boton className="w-full" variante={enLista ? "secundario" : "primario"} icono={enLista ? BookmarkCheck : Bookmark} disabled={enLista || agregar.isPending} onClick={() => agregar.mutate(d)}>
              {enLista ? "Ya está en tu lista" : "Agregar a por ver"}
            </Boton>
          ) : null}
          <p className="text-[11px] text-tenue">Datos de TMDB y JustWatch.</p>
        </div>
      ) : null}
    </Modal>
  );
}

function Lista({ elementos, alAbrir }: { elementos: PorVer[]; alAbrir: (p: PorVer) => void }) {
  const puede = usePuede("peliculas", "escritura");
  const invalidar = () => void queryClient.invalidateQueries({ queryKey: ["peliculas", "por-ver"] });
  const marcar = useMutation({ mutationFn: (p: PorVer) => api(`/api/peliculas/por-ver/${p.id}`, { metodo: "PATCH", cuerpo: { vista: !p.vista } }), onSuccess: invalidar, onError: avisarError });
  const quitar = useMutation({ mutationFn: (id: string) => api(`/api/peliculas/por-ver/${id}`, { metodo: "DELETE" }), onSuccess: invalidar, onError: avisarError });
  if (!elementos.length) return <Vacio icono={Bookmark} texto="Busca una película o serie y tócala para agregarla aquí." />;
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {elementos.map((p) => (
        <div key={p.id} className={cx("min-w-0", p.vista && "opacity-50")}>
          <Poster r={p} alAbrir={() => alAbrir(p)} />
          {puede ? (
            <div className="mt-1 flex gap-1">
              <Boton tamano="icono" variante="fantasma" icono={Check} aria-label={p.vista ? "Marcar como no vista" : "Marcar como vista"} onClick={() => marcar.mutate(p)} />
              <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar de la lista" onClick={() => quitar.mutate(p.id)} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function Peliculas() {
  const [pestana, setPestana] = useState<"descubrir" | "lista">("descubrir");
  const [texto, setTexto] = useState("");
  const [buscado, setBuscado] = useState("");
  const [abierta, setAbierta] = useState<{ tipo: TipoTmdb; id: number } | null>(null);
  const novedades = useQuery({
    queryKey: ["peliculas", "novedades"],
    queryFn: () => api<{ peliculas: Resumen[]; series: Resumen[]; proximas: Resumen[] }>("/api/peliculas/novedades"),
    staleTime: 60 * 60_000,
    retry: false,
  });
  const busqueda = useQuery({
    queryKey: ["peliculas", "buscar", buscado],
    queryFn: () => api<Resumen[]>(`/api/peliculas/buscar?q=${encodeURIComponent(buscado)}`),
    enabled: buscado.length >= 2,
  });
  const lista = useQuery({ queryKey: ["peliculas", "por-ver"], queryFn: () => api<PorVer[]>("/api/peliculas/por-ver") });
  const enLista = new Set((lista.data ?? []).map((p) => `${p.tipo}-${p.tmdbId}`));
  const abrir = (r: Resumen) => setAbierta({ tipo: r.tipo, id: r.id });
  const pendientes = (lista.data ?? []).filter((p) => !p.vista).length;

  return (
    <div className="space-y-4">
      <Encabezado titulo="Películas y series" descripcion="Encuentra dónde ver cualquier película o serie en México y guarda las que quieres ver." />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBuscado(texto.trim());
          setPestana("descubrir");
        }}
      >
        <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar: Spider-Man, The Last of Us…" />
        <Boton type="submit" variante="primario" icono={Search}>
          Buscar
        </Boton>
      </form>
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "descubrir", texto: "Descubrir" },
          { id: "lista", texto: `Por ver${pendientes ? ` (${pendientes})` : ""}` },
        ]}
      />
      {pestana === "lista" ? (
        <Lista elementos={lista.data ?? []} alAbrir={(p) => setAbierta({ tipo: p.tipo, id: p.tmdbId })} />
      ) : (
        <div className="space-y-4">
          <ErrorCaja error={novedades.error ?? busqueda.error} />
          {buscado ? (
            <Tarjeta titulo={`Resultados de "${buscado}"`} icono={Search} acciones={<Boton tamano="sm" variante="fantasma" onClick={() => { setBuscado(""); setTexto(""); }}>Limpiar</Boton>}>
              {busqueda.isLoading ? <Cargando /> : null}
              {busqueda.data && !busqueda.data.length ? <Vacio texto="No encontré nada con ese nombre." /> : null}
              {busqueda.data ? <Rejilla elementos={busqueda.data} alAbrir={abrir} /> : null}
            </Tarjeta>
          ) : null}
          {novedades.isLoading ? <Cargando /> : null}
          {novedades.data ? (
            <>
              <Tarjeta titulo="Películas populares esta semana" icono={Clapperboard}>
                <Rejilla elementos={novedades.data.peliculas} alAbrir={abrir} />
              </Tarjeta>
              <Tarjeta titulo="Series populares esta semana" icono={Tv}>
                <Rejilla elementos={novedades.data.series} alAbrir={abrir} />
              </Tarjeta>
              <Tarjeta titulo="Próximos estrenos en cines" icono={CalendarClock}>
                <Rejilla elementos={novedades.data.proximas} alAbrir={abrir} />
              </Tarjeta>
            </>
          ) : null}
          <Tarjeta titulo="Ver gratis y legal" icono={Radio}>
            <p className="mb-3 text-sm text-tenue">Canales y películas gratis (con anuncios) disponibles en México. Se abren en su página o app.</p>
            <div className="flex flex-wrap gap-2">
              {CANALES_GRATIS.map((c) => (
                <Boton key={c.nombre} tamano="sm" icono={ExternalLink} onClick={() => abrirExterno(c.url)}>
                  {c.nombre}
                </Boton>
              ))}
            </div>
            <p className="mt-3 text-xs text-tenue">Tus propias películas: súbelas en Mis videos y aparece "Ver ahora" al abrir su ficha.</p>
          </Tarjeta>
        </div>
      )}
      {abierta ? <Ficha tipo={abierta.tipo} id={abierta.id} enLista={enLista.has(`${abierta.tipo}-${abierta.id}`)} alCerrar={() => setAbierta(null)} /> : null}
    </div>
  );
}
