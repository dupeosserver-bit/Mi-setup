import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bookmark, BookmarkCheck, CalendarClock, Check, ChevronLeft, Clapperboard, ExternalLink, Film, Info, Play, Radio, Search, Star, Trash2, Tv } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Pestanas, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { useModoPagina } from "../lib/marco";
import { api } from "../lib/api";
import { queryClient, usePuede } from "../lib/consultas";
import { abrirExterno } from "../lib/plataforma";
import { localeActual } from "../lib/idioma";

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

const CANALES_GRATIS = [
  { nombre: "Pluto TV (canales en vivo)", url: "https://pluto.tv/latam/live-tv" },
  { nombre: "Tubi", url: "https://tubitv.com/" },
  { nombre: "ViX gratis", url: "https://vix.com/" },
  { nombre: "Canela.TV", url: "https://www.canela.tv/" },
  { nombre: "Películas gratis en YouTube", url: "https://www.youtube.com/feed/storefront?bp=ogUCKAU%3D" },
  { nombre: "Plex (gratis)", url: "https://watch.plex.tv/es/on-demand" },
] as const;

const fechaBonita = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString(localeActual(), { day: "numeric", month: "long", year: "numeric" });

function Poster({ r, alAbrir }: { r: { titulo: string; poster: string | null; fecha?: string | null; calificacion?: number | null; tipo: TipoTmdb }; alAbrir: () => void }) {
  return (
    <button type="button" onClick={alAbrir} className="group block w-full min-w-0 text-left">
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
  const pagina = usePaginado(elementos, 18);
  return (
    <>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {pagina.visibles.map((r) => (
          <Poster key={`${r.tipo}-${r.id}`} r={r} alAbrir={() => alAbrir(r)} />
        ))}
      </div>
      {pagina.paginas}
    </>
  );
}

function Fila({ titulo, icono: Icono, elementos, alAbrir }: { titulo: string; icono: typeof Tv; elementos: Resumen[]; alAbrir: (r: Resumen) => void }) {
  const pagina = usePaginado(elementos, 12);
  if (!elementos.length) return null;
  return (
    <section className="min-w-0 space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Icono className="h-4 w-4 text-tenue" />
        {titulo}
      </h2>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {pagina.visibles.map((r) => (
          <div key={`${r.tipo}-${r.id}`} className="w-28 shrink-0 snap-start sm:w-36 xl:w-40">
            <Poster r={r} alAbrir={() => alAbrir(r)} />
          </div>
        ))}
      </div>
      {pagina.paginas}
    </section>
  );
}

function Portada({ r, enLista, alAbrir }: { r: Resumen; enLista: boolean; alAbrir: () => void }) {
  const puede = usePuede("peliculas", "escritura");
  const agregar = useMutation({
    mutationFn: () => api("/api/peliculas/por-ver", { metodo: "POST", cuerpo: { tmdbId: r.id, tipo: r.tipo, titulo: r.titulo, poster: r.poster } }),
    onSuccess: () => {
      avisar("Agregada a tu lista");
      void queryClient.invalidateQueries({ queryKey: ["peliculas", "por-ver"] });
    },
    onError: avisarError,
  });
  return (
    <section className="relative min-w-0 overflow-hidden rounded-tarjeta border border-borde bg-superficie">
      {r.poster ? <img src={r.poster} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-2xl" /> : null}
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--superficie)] via-[color-mix(in_srgb,var(--superficie)_70%,transparent)] to-transparent" />
      <div className="relative flex min-w-0 gap-4 p-4 sm:p-6">
        {r.poster ? <img src={r.poster} alt={r.titulo} className="hidden w-32 shrink-0 self-start rounded-xl shadow-2xl sm:block lg:w-40" /> : null}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Insignia>{r.tipo === "tv" ? "Serie del momento" : "Película del momento"}</Insignia>
            {r.calificacion ? (
              <span className="flex items-center gap-1 text-tenue">
                <Star className="h-3.5 w-3.5 fill-current text-yellow-400" />
                {r.calificacion}
              </span>
            ) : null}
            {r.fecha ? <span className="text-tenue">{r.fecha.slice(0, 4)}</span> : null}
          </div>
          <h2 className="text-2xl font-bold leading-tight md:text-4xl">{r.titulo}</h2>
          <p className="line-clamp-3 max-w-2xl text-sm text-tenue">{r.sinopsis || "Sin descripción en español."}</p>
          <div className="flex flex-wrap gap-2">
            <Boton variante="primario" icono={Info} onClick={alAbrir}>
              Ver tráiler y dónde verla
            </Boton>
            {puede ? (
              <Boton icono={enLista ? BookmarkCheck : Bookmark} disabled={enLista || agregar.isPending} onClick={() => agregar.mutate()}>
                {enLista ? "Ya está en tu lista" : "Agregar a por ver"}
              </Boton>
            ) : null}
          </div>
        </div>
      </div>
    </section>
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
  useModoPagina("completa");
  const navegar = useNavigate();
  const [verTrailer, setVerTrailer] = useState(false);
  const misVideos = useQuery({ queryKey: ["media", "videos"], queryFn: () => api<{ id: string; titulo: string }[]>("/api/media/videos"), retry: false, enabled: usePuede("videos") });
  const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const laTienes = d ? (misVideos.data ?? []).find((v) => normal(v.titulo).includes(normal(d.titulo)) && normal(d.titulo).length >= 3) : undefined;
  const sinDonde = d && !d.dondeVer.suscripcion.length && !d.dondeVer.renta.length && !d.dondeVer.compra.length && !d.dondeVer.gratis?.length;
  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-fondo" style={{ height: "var(--alto-app, 100dvh)" }}>
      {d?.poster ? <img src={d.poster} alt="" aria-hidden="true" className="pointer-events-none fixed inset-0 h-full w-full scale-110 object-cover opacity-25 blur-3xl" /> : null}
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-borde bg-[color-mix(in_srgb,var(--fondo)_80%,transparent)] px-3 py-2 backdrop-blur" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <Boton tamano="icono" variante="fantasma" icono={ChevronLeft} aria-label="Volver" onClick={alCerrar} />
        <b className="min-w-0 truncate">{d?.titulo ?? "Cargando…"}</b>
      </header>
      <div className="relative mx-auto w-full max-w-6xl p-4 sm:p-6">
        {q.isLoading ? <Cargando /> : null}
        <ErrorCaja error={q.error} />
        {d ? (
          <div className="grid min-w-0 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
            {d.poster ? <img src={d.poster} alt={d.titulo} className="hidden w-64 self-start rounded-2xl shadow-2xl lg:block" /> : null}
            <div className="min-w-0 space-y-4">
              <h1 className="text-2xl font-bold md:text-4xl">{d.titulo}</h1>
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
            {d.poster ? <img src={d.poster} alt="" className="w-24 shrink-0 self-start rounded-xl sm:w-32 lg:hidden" /> : null}
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
            <div className="flex items-start gap-2 rounded-xl border border-[color-mix(in_srgb,var(--acento)_40%,transparent)] bg-[color-mix(in_srgb,var(--acento)_10%,transparent)] p-3 text-sm">
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Lista({ elementos, alAbrir }: { elementos: PorVer[]; alAbrir: (p: PorVer) => void }) {
  const pagina = usePaginado(elementos, 18);
  const puede = usePuede("peliculas", "escritura");
  const invalidar = () => void queryClient.invalidateQueries({ queryKey: ["peliculas", "por-ver"] });
  const marcar = useMutation({ mutationFn: (p: PorVer) => api(`/api/peliculas/por-ver/${p.id}`, { metodo: "PATCH", cuerpo: { vista: !p.vista } }), onSuccess: invalidar, onError: avisarError });
  const quitar = useMutation({ mutationFn: (id: string) => api(`/api/peliculas/por-ver/${id}`, { metodo: "DELETE" }), onSuccess: invalidar, onError: avisarError });
  if (!elementos.length) return <Vacio icono={Bookmark} texto="Busca una película o serie y tócala para agregarla aquí." />;
  return (
    <>
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {pagina.visibles.map((p) => (
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
    {pagina.paginas}
    </>
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
  const destacada = novedades.data?.series[0] ?? novedades.data?.peliculas[0];

  if (abierta) return <Ficha tipo={abierta.tipo} id={abierta.id} enLista={enLista.has(`${abierta.tipo}-${abierta.id}`)} alCerrar={() => setAbierta(null)} />;

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
              {destacada ? <Portada r={destacada} enLista={enLista.has(`${destacada.tipo}-${destacada.id}`)} alAbrir={() => abrir(destacada)} /> : null}
              <Fila titulo="Películas populares esta semana" icono={Clapperboard} elementos={novedades.data.peliculas} alAbrir={abrir} />
              <Fila titulo="Series populares esta semana" icono={Tv} elementos={novedades.data.series} alAbrir={abrir} />
              <Fila titulo="Próximos estrenos en cines" icono={CalendarClock} elementos={novedades.data.proximas} alAbrir={abrir} />
            </>
          ) : null}
          <Tarjeta titulo="Ver gratis y legal" icono={Radio}>
            <p className="mb-3 text-sm text-tenue">Canales y películas gratis (con anuncios) disponibles en México. Se abren en su página o app.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
              {CANALES_GRATIS.map((c) => (
                <button
                  key={c.nombre}
                  type="button"
                  onClick={() => abrirExterno(c.url)}
                  className="flex min-w-0 items-center gap-2 rounded-xl border border-borde bg-fondo p-3 text-left text-sm hover:border-acento"
                >
                  <ExternalLink className="h-4 w-4 shrink-0 text-acento" />
                  <span className="min-w-0 truncate">{c.nombre}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-tenue">Tus propias películas: súbelas en Mis videos y aparece "Ver ahora" al abrir su ficha.</p>
          </Tarjeta>
        </div>
      )}
    </div>
  );
}
