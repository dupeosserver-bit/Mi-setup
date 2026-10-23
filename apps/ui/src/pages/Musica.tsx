import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  Film,
  Flame,
  Gamepad2,
  Heart,
  History,
  Laptop,
  Link2,
  ListMusic,
  Monitor,
  Music,
  Pause,
  Pencil,
  Play,
  Radio,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Smartphone,
  Speaker,
  Trash2,
  Tv,
  Unlink,
  Upload,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ArchivoMedia } from "../components/Biblioteca";
import { Paginas, usePaginado } from "../components/Paginas";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, FaltaConfigurar, avisar, avisarError, cx } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { useForma } from "../lib/marco";
import { corazonOptimista, iniciales, minutos, type EstadoSpotify, type PistaSpotify } from "../lib/musica";
import { abrirExterno } from "../lib/plataforma";
import { conectarRemoto, enRemoto, estadoRemoto, type AccionRemota } from "../lib/spotifyRemoto";
import { subirConAvance } from "../lib/subir";

const VERDE = "#1ed760";

interface Dispositivo {
  id: string;
  nombre: string;
  tipo: string;
  activo: boolean;
  volumen: number | null;
}
interface Playlist {
  id: string;
  uri: string;
  nombre: string;
  portada: string | null;
  total: number;
  de: string;
}
interface PaginaMedia {
  items: ArchivoMedia[];
  total: number;
  pagina: number;
  paginas: number;
}
type Control = { accion: "play" | "pause" | "next" | "previous" | "aleatorio"; uri?: string; uris?: string[]; desde?: number; encendido?: boolean };

const ICONO_EQUIPO: Record<string, LucideIcon> = { smartphone: Smartphone, computer: Laptop, tv: Tv, speaker: Speaker, castaudio: Speaker, castvideo: Tv, gameconsole: Gamepad2, automobile: Radio, tablet: Smartphone };

function Vidrio({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx("min-w-0 rounded-[22px] border border-white/10 bg-white/[0.045] p-4 backdrop-blur-xl sm:p-5", className)}>{children}</section>;
}

function Cabeza({ icono: Icono, titulo, derecha, verde }: { icono: LucideIcon; titulo: string; derecha?: ReactNode; verde?: boolean }) {
  return (
    <header className="mb-3 flex min-w-0 items-center justify-between gap-2">
      <h3 className="flex min-w-0 items-center gap-2 truncate text-[15px] font-semibold" style={verde ? { color: VERDE } : undefined}>
        <Icono className="h-4 w-4 shrink-0" />
        {titulo}
      </h3>
      {derecha ? <div className="flex shrink-0 items-center gap-1">{derecha}</div> : null}
    </header>
  );
}

function Portada({ src, texto, tam, redonda }: { src?: string | null; texto: string; tam: number; redonda?: boolean }) {
  const estilo = { width: tam, height: tam };
  if (src) return <img src={src} alt="" loading="lazy" className={cx("shrink-0 object-cover shadow-lg", redonda ? "rounded-full" : "rounded-xl")} style={estilo} />;
  return (
    <span className={cx("grid shrink-0 place-items-center bg-gradient-to-br from-[#7c5cff] to-[#ff3d77] font-extrabold text-white/90 shadow-lg", redonda ? "rounded-full" : "rounded-xl")} style={{ ...estilo, fontSize: Math.max(12, Math.round(tam / 2.8)) }}>
      {iniciales(texto)}
    </span>
  );
}

function FilaPista({ p, numero, onClick, extra }: { p: PistaSpotify; numero?: number; onClick?: () => void; extra?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/[0.06] disabled:hover:bg-transparent">
      {numero !== undefined ? <span className="w-6 shrink-0 text-center text-sm font-bold text-tenue">{numero}</span> : null}
      <Portada src={p.portadaChica ?? p.portada} texto={p.nombre} tam={40} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-sm font-semibold">{p.nombre}</b>
        <small className="block truncate text-xs text-tenue">{p.artistas}</small>
      </span>
      {extra}
    </button>
  );
}

function useSpotify() {
  const puede = usePuede("musica", "escritura");
  const estado = useQuery({
    queryKey: ["spotify"],
    queryFn: () => api<EstadoSpotify>("/api/musica/spotify/estado"),
    // Si la primera vez falla (token de Spotify por renovar, servidor arrancando), reintenta solo:
    // antes había que salir y volver a entrar a Música para que cargara.
    refetchInterval: (q) => (q.state.data?.conectado ? 5_000 : q.state.error ? 8_000 : false),
    retry: 2,
  });
  const remoto = useQuery({ queryKey: ["spotify", "remoto"], queryFn: estadoRemoto, staleTime: 30_000 });
  const refrescar = () => setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["spotify"], exact: true }), 700);

  const control = useMutation({
    mutationFn: async (d: Control) => {
      if (remoto.data?.conectado) {
        const accion: AccionRemota | null =
          d.accion === "play" ? (d.uri && !d.uris && d.desde === undefined ? { tipo: "reproducir", uri: d.uri } : d.uris?.length === 1 ? { tipo: "reproducir", uri: d.uris[0]! } : d.uri || d.uris ? null : { tipo: "reanudar" }) : d.accion === "pause" ? { tipo: "pausar" } : d.accion === "next" ? { tipo: "siguiente" } : d.accion === "previous" ? { tipo: "anterior" } : null;
        if (accion && (await enRemoto(accion))) return;
      }
      await api("/api/musica/spotify/control", { metodo: "POST", cuerpo: d });
    },
    onSuccess: refrescar,
    onError: avisarError,
  });

  const corazon = (id: string, guardar: boolean) =>
    void corazonOptimista({
      leer: () => queryClient.getQueryData<EstadoSpotify>(["spotify"]),
      escribir: (e) => queryClient.setQueryData(["spotify"], e),
      enviar: () => api(`/api/musica/spotify/biblioteca/${id}`, { metodo: "PUT", cuerpo: { guardar } }),
      id,
      guardar,
    }).then(
      () => avisar(guardar ? "Guardada en tu biblioteca" : "Quitada de tu biblioteca"),
      avisarError,
    );

  return { puede, estado, remoto, control, corazon, refrescar };
}

function AhoraSuena({ sp }: { sp: ReturnType<typeof useSpotify> }) {
  const { puede, estado, remoto, control, corazon, refrescar } = sp;
  const [verEquipos, setVerEquipos] = useState(false);
  const [q, setQ] = useState("");
  const [buscado, setBuscado] = useState("");
  const [, latido] = useState(0);
  const d = estado.data;
  const c = d?.cancion;

  useEffect(() => {
    if (!d?.sonando) return;
    const t = setInterval(() => latido((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [d?.sonando]);

  const equipos = useQuery({ queryKey: ["spotify", "equipos"], queryFn: () => api<Dispositivo[]>("/api/musica/spotify/dispositivos"), enabled: verEquipos && Boolean(d?.conectado), refetchInterval: verEquipos ? 8_000 : false });
  const app = useQuery({ queryKey: ["spotify", "app"], queryFn: () => api<{ clientId: string | null; retorno: string }>("/api/musica/spotify/app"), enabled: Boolean(remoto.data?.sdk && d?.conectado) });
  const resultados = useQuery({ queryKey: ["spotify", "buscar", buscado], queryFn: () => api<PistaSpotify[]>(`/api/musica/spotify/buscar?q=${encodeURIComponent(buscado)}`), enabled: Boolean(buscado && d?.conectado) });

  const conectar = useMutation({ mutationFn: () => api<{ url: string }>("/api/musica/spotify/conectar"), onSuccess: (r) => abrirExterno(r.url), onError: avisarError });
  const desconectar = useMutation({ mutationFn: () => api("/api/musica/spotify", { metodo: "DELETE" }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["spotify"] }) });
  const transferir = useMutation({
    mutationFn: (id: string) => api("/api/musica/spotify/transferir", { metodo: "POST", cuerpo: { id } }),
    onSuccess: (_r, id) => {
      avisar(`Ahora suena en ${equipos.data?.find((e) => e.id === id)?.nombre ?? "ese equipo"}`);
      setVerEquipos(false);
      refrescar();
    },
    onError: avisarError,
  });
  const varita = useMutation({
    mutationFn: () => api<{ agregadas: number }>("/api/musica/spotify/parecidas", { metodo: "POST" }),
    onSuccess: (r) => avisar(r.agregadas ? `Agregué ${r.agregadas} canciones parecidas a la cola` : "No encontré canciones parecidas esta vez"),
    onError: avisarError,
  });
  const enCelular = useMutation({
    mutationFn: async () => {
      if (!app.data?.clientId) throw new Error("Falta el Client ID de Spotify en Ajustes → Servicios y claves");
      if (!(await conectarRemoto(app.data.clientId, app.data.retorno))) throw new Error("No se pudo conectar con la app de Spotify de este celular");
    },
    onSuccess: () => {
      void remoto.refetch();
      avisar("Listo: la música suena en este celular sin salir de Mi Setup");
    },
    onError: avisarError,
  });

  if (estado.isLoading) return <Vidrio><Cargando /></Vidrio>;
  const progreso = c ? Math.min(c.duracion, c.progreso + (d?.sonando ? Date.now() - estado.dataUpdatedAt : 0)) : 0;
  const pct = c?.duracion ? (progreso / c.duracion) * 100 : 0;
  const IconoEquipo = ICONO_EQUIPO[d?.equipoTipo?.toLowerCase() ?? ""] ?? Monitor;

  return (
    <Vidrio>
      <Cabeza
        icono={Radio}
        titulo="Spotify"
        verde
        derecha={
          d?.conectado ? (
            <>
              <Boton tamano="icono" variante={verEquipos ? "primario" : "fantasma"} icono={Laptop} aria-label="Elegir dónde suena" title="Elegir dónde suena" onClick={() => setVerEquipos((v) => !v)} />
              {puede ? <Boton tamano="icono" variante="fantasma" icono={Unlink} aria-label="Desconectar Spotify" title="Desconectar Spotify" onClick={() => desconectar.mutate()} /> : null}
            </>
          ) : null
        }
      />
      <ErrorCaja error={estado.error} />
      {d && !d.configurado ? <FaltaConfigurar variable="SPOTIFY_CLIENT_ID" detalle="Crea una app en developer.spotify.com y pon sus claves en Ajustes → Servicios y claves. Cada dueño usa las suyas." /> : null}
      {d?.configurado && !d.conectado ? (
        <div className="grid place-items-center gap-3 py-6 text-center">
          <Music className="h-10 w-10" style={{ color: VERDE }} />
          <p className="max-w-sm text-sm text-tenue">Conecta tu cuenta para ver qué suena, guardar canciones, ver tus playlists y elegir dónde se escucha. Controlar la música necesita Spotify Premium.</p>
          {puede ? (
            <Boton variante="primario" icono={Link2} cargando={conectar.isPending} onClick={() => conectar.mutate()}>
              Conectar Spotify
            </Boton>
          ) : null}
        </div>
      ) : null}
      {d?.conectado ? (
        <>
          {c ? (
            <div className="mb-4 flex items-center gap-4">
              <Portada src={c.portada} texto={c.nombre} tam={84} />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold sm:text-xl">{c.nombre}</h2>
                <p className="truncate text-sm text-tenue">{c.artistas}</p>
                {d.equipo ? (
                  <span className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs" style={{ color: VERDE }}>
                    <IconoEquipo className="h-3.5 w-3.5 shrink-0" />
                    En: {d.equipo}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                disabled={!puede}
                onClick={() => corazon(c.id, !c.guardada)}
                aria-label={c.guardada ? "Quitar de tu biblioteca" : "Guardar en tu biblioteca"}
                aria-pressed={c.guardada}
                className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-full transition-transform active:scale-90", c.guardada ? "text-[#ff4d8d]" : "text-tenue hover:text-texto")}
              >
                <Heart className="h-6 w-6" fill={c.guardada ? "currentColor" : "none"} />
              </button>
            </div>
          ) : (
            <p className="mb-4 text-sm text-tenue">No suena nada. Abre Spotify en tu celular, PC, consola o bocina y dale play, o elige un equipo con el botón de la laptop.</p>
          )}
          {c ? (
            <>
              <div className="relative h-1.5 rounded-full bg-white/10">
                <i className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: VERDE }} />
              </div>
              <div className="mb-3 mt-1.5 flex justify-between font-mono text-[11px] text-tenue">
                <span>{minutos(progreso)}</span>
                <span>{minutos(c.duracion)}</span>
              </div>
            </>
          ) : null}
          {puede ? (
            <div className="flex items-center justify-between">
              <button type="button" aria-label="Aleatorio" title="Aleatorio" onClick={() => control.mutate({ accion: "aleatorio", encendido: !d.aleatorio })} className={cx("grid h-11 w-11 place-items-center rounded-2xl", d.aleatorio ? "text-[#1ed760]" : "text-tenue hover:text-texto")}>
                <Shuffle className="h-5 w-5" />
              </button>
              <button type="button" aria-label="Anterior" onClick={() => control.mutate({ accion: "previous" })} className="grid h-11 w-11 place-items-center rounded-2xl hover:bg-white/[0.06]">
                <SkipBack className="h-6 w-6" />
              </button>
              <button type="button" aria-label={d.sonando ? "Pausar" : "Reproducir"} onClick={() => control.mutate({ accion: d.sonando ? "pause" : "play" })} className="grid h-[60px] w-[60px] place-items-center rounded-[20px] bg-acento text-black shadow-[0_10px_30px_color-mix(in_srgb,var(--acento)_35%,transparent)]">
                {d.sonando ? <Pause className="h-7 w-7" fill="currentColor" /> : <Play className="h-7 w-7" fill="currentColor" />}
              </button>
              <button type="button" aria-label="Siguiente" onClick={() => control.mutate({ accion: "next" })} className="grid h-11 w-11 place-items-center rounded-2xl hover:bg-white/[0.06]">
                <SkipForward className="h-6 w-6" />
              </button>
              <button type="button" aria-label="Agregar canciones parecidas a la cola" title="Canciones parecidas a la cola" disabled={!c || varita.isPending} onClick={() => varita.mutate()} className="grid h-11 w-11 place-items-center rounded-2xl text-acento hover:bg-white/[0.06] disabled:opacity-40">
                <WandSparkles className={cx("h-5 w-5", varita.isPending && "animate-pulse")} />
              </button>
            </div>
          ) : null}

          {verEquipos ? (
            <div className="mt-3 rounded-2xl border border-borde bg-black/25 p-2">
              <p className="px-2 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wider text-tenue">Dónde suena</p>
              {equipos.isLoading ? <Cargando /> : null}
              <ErrorCaja error={equipos.error} />
              {equipos.data?.length === 0 ? <p className="px-2 py-2 text-xs text-tenue">No veo equipos. Abre Spotify en tu celular, PC, consola o bocina y vuelve a abrir esta lista.</p> : null}
              {equipos.data?.map((e) => {
                const Icono = ICONO_EQUIPO[e.tipo] ?? Monitor;
                return (
                  <button key={e.id} type="button" disabled={!puede || e.activo} onClick={() => transferir.mutate(e.id)} className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm", e.activo ? "bg-[#1ed760]/10 text-[#1ed760]" : "hover:bg-white/[0.06]")}>
                    <Icono className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{e.nombre}</span>
                    {e.activo ? <span className="text-xs">Sonando</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          {remoto.data?.sdk && remoto.data.instalado && !remoto.data.conectado && puede ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-borde bg-black/20 p-3 text-xs text-tenue">
              <Smartphone className="h-4 w-4 shrink-0" style={{ color: VERDE }} />
              <span className="min-w-0 flex-1">Haz que suene en este celular en segundo plano, sin salir de Mi Setup (usa la app de Spotify instalada y Premium).</span>
              <Boton tamano="sm" cargando={enCelular.isPending} onClick={() => enCelular.mutate()}>
                Conectar este celular
              </Boton>
            </div>
          ) : null}
          {remoto.data && !remoto.data.instalado ? <p className="mt-3 text-xs text-tenue">Para que suene en este celular sin abrir otra app, instala Spotify y entra con tu cuenta Premium.</p> : null}
          {remoto.data?.conectado ? (
            <p className="mt-3 flex items-center gap-2 text-xs" style={{ color: VERDE }}>
              <Smartphone className="h-3.5 w-3.5" />
              Este celular está conectado: suena en segundo plano.
            </p>
          ) : null}

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setBuscado(q.trim());
            }}
          >
            <Entrada value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar canción o artista" />
            <Boton type="submit" icono={Search} aria-label="Buscar" />
            {buscado ? (
              <Boton
                variante="fantasma"
                icono={X}
                aria-label="Cerrar búsqueda"
                onClick={() => {
                  setBuscado("");
                  setQ("");
                }}
              />
            ) : null}
          </form>
          <ErrorCaja error={resultados.error} />
          {resultados.isFetching ? <Cargando /> : null}
          {buscado ? (
            <div className="mt-2 space-y-0.5">
              {resultados.data?.map((p) => <FilaPista key={p.uri} p={p} {...(puede ? { onClick: () => control.mutate({ accion: "play", uri: p.uri }) } : {})} />)}
            </div>
          ) : null}
        </>
      ) : null}
    </Vidrio>
  );
}

function TuMusica() {
  const puede = usePuede("musica", "escritura");
  const [pagina, setPagina] = useState(1);
  const [actual, setActual] = useState<ArchivoMedia | null>(null);
  const [avance, setAvance] = useState<number | null>(null);
  const [editando, setEditando] = useState<{ id: string; titulo: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ["media", "musica", "pagina", pagina], queryFn: () => api<PaginaMedia>(`/api/media/musica?pagina=${pagina}&porPagina=6`), placeholderData: keepPreviousData });
  const invalidar = () => void queryClient.invalidateQueries({ queryKey: ["media", "musica"] });
  useEffect(() => {
    if (q.data && pagina > q.data.paginas) setPagina(q.data.paginas);
  }, [q.data, pagina]);

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    try {
      for (const [i, a] of [...archivos].entries()) {
        setAvance(0);
        await subirConAvance("/api/media/musica", a, setAvance);
        if (archivos.length > 1) avisar(`Subido ${i + 1} de ${archivos.length}`, "info");
      }
      avisar("Listo, ya está en tu música");
    } catch (err) {
      avisarError(err);
    } finally {
      setAvance(null);
      invalidar();
      if (entrada.current) entrada.current.value = "";
    }
  };
  const renombrar = useMutation({
    mutationFn: (d: { id: string; titulo: string }) => api(`/api/media/archivo/${d.id}`, { metodo: "PATCH", cuerpo: { titulo: d.titulo } }),
    onSuccess: () => {
      setEditando(null);
      invalidar();
    },
    onError: avisarError,
  });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/media/archivo/${id}`, { metodo: "DELETE" }), onSuccess: invalidar, onError: avisarError });
  const lista = q.data?.items ?? [];
  const siguiente = () => {
    const i = lista.findIndex((m) => m.id === actual?.id);
    const sig = lista[i + 1];
    if (sig) setActual(sig);
  };
  const esVideo = (m: ArchivoMedia) => m.tipoArchivo.startsWith("video/");

  return (
    <Vidrio>
      <Cabeza
        icono={Music}
        titulo="Tu música"
        derecha={
          puede ? (
            <Boton tamano="sm" variante="primario" icono={Upload} disabled={avance !== null} onClick={() => entrada.current?.click()}>
              {avance !== null ? `Subiendo ${avance}%` : "Subir"}
            </Boton>
          ) : null
        }
      />
      <input ref={entrada} type="file" multiple hidden accept="audio/*,video/mp4" onChange={(e) => void subir(e.target.files)} />
      {avance !== null ? (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-acento transition-all" style={{ width: `${avance}%` }} />
        </div>
      ) : null}
      {actual ? <audio key={actual.id} src={`${API_BASE}${actual.url}`} controls autoPlay className="mb-3 w-full" onEnded={siguiente} /> : null}
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data && q.data.total === 0 ? <p className="py-4 text-center text-sm text-tenue">Sube tus canciones o clips (MP3, M4A, MP4…) y escúchalos desde cualquier equipo.</p> : null}
      <div className="space-y-1">
        {lista.map((m) =>
          editando?.id === m.id ? (
            <form
              key={m.id}
              className="flex gap-2 rounded-xl bg-white/[0.05] p-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (editando.titulo.trim()) renombrar.mutate(editando);
              }}
            >
              <Entrada autoFocus value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} />
              <Boton type="submit" tamano="sm">
                Guardar
              </Boton>
            </form>
          ) : (
            <div key={m.id} className={cx("group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-white/[0.06]", actual?.id === m.id && "bg-white/[0.06]")}>
              <button type="button" onClick={() => setActual(m)} aria-label={`Reproducir ${m.titulo}`} className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors", actual?.id === m.id ? "bg-acento text-black" : "bg-black/40 group-hover:bg-acento group-hover:text-black")}>
                <Play className="h-4 w-4" fill="currentColor" />
              </button>
              <button type="button" onClick={() => setActual(m)} className="min-w-0 flex-1 text-left">
                <b className="block truncate text-sm font-semibold">{m.titulo}</b>
                <small className="flex items-center gap-1.5 text-xs text-tenue">
                  {esVideo(m) ? <Film className="h-3 w-3" /> : <Music className="h-3 w-3" />}
                  {esVideo(m) ? "MP4" : (m.tipoArchivo.split("/")[1] ?? "audio").replace("mpeg", "mp3").toUpperCase()} · {m.tamano > 1e9 ? `${(m.tamano / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(m.tamano / 1e6))} MB`}
                </small>
              </button>
              {puede ? (
                <span className="flex shrink-0 gap-0.5 text-tenue">
                  <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Cambiar nombre" onClick={() => setEditando({ id: m.id, titulo: m.titulo })} />
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label="Borrar"
                    onClick={async () => {
                      if (!(await confirmar({ titulo: "Borrar archivo", mensaje: `Se borra "${m.titulo}" del servidor.`, peligroso: true, boton: "Borrar" }))) return;
                      if (actual?.id === m.id) setActual(null);
                      borrar.mutate(m.id);
                    }}
                  />
                </span>
              ) : null}
            </div>
          ),
        )}
      </div>
      {q.data && q.data.paginas > 1 ? <Paginas pagina={q.data.pagina} total={q.data.paginas} alCambiar={setPagina} /> : null}
    </Vidrio>
  );
}

function Playlists({ sp, conectado }: { sp: ReturnType<typeof useSpotify>; conectado: boolean }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const forma = useForma();
  const lista = useQuery({ queryKey: ["spotify", "playlists"], queryFn: () => api<Playlist[]>("/api/musica/spotify/playlists"), enabled: conectado, staleTime: 60_000 });
  const detalle = useQuery({ queryKey: ["spotify", "playlist", abierta], queryFn: () => api<Playlist & { pistas: PistaSpotify[]; legible?: boolean }>(`/api/musica/spotify/playlists/${abierta}`), enabled: Boolean(abierta) });
  const { visibles, paginas } = usePaginado(lista.data, forma === "celular" ? 6 : 8);
  const pistas = usePaginado(detalle.data?.pistas, 10);

  if (!conectado) return null;
  if (abierta) {
    const pl = detalle.data;
    return (
      <Vidrio>
        <Cabeza icono={ListMusic} titulo="Mis playlists" derecha={<Boton tamano="sm" variante="fantasma" icono={ChevronLeft} onClick={() => setAbierta(null)}>Playlists</Boton>} />
        <ErrorCaja error={detalle.error} />
        {detalle.isLoading ? <Cargando /> : null}
        {pl ? (
          <>
            <div className="mb-4 flex items-center gap-4">
              <Portada src={pl.portada} texto={pl.nombre} tam={96} />
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold">{pl.nombre}</h2>
                <p className="text-sm text-tenue">
                  {pl.total} canciones{pl.de ? ` · ${pl.de}` : ""}
                </p>
                {sp.puede ? (
                  <Boton variante="primario" icono={Play} className="mt-2" onClick={() => sp.control.mutate({ accion: "play", uri: pl.uri })}>
                    Reproducir todo
                  </Boton>
                ) : null}
              </div>
            </div>
            {pl.legible === false ? <p className="mb-3 text-sm text-tenue">Spotify solo deja ver las canciones de tus playlists o de las colaborativas. Esta sí la puedes reproducir completa.</p> : null}
            <div className="space-y-0.5">
              {pistas.visibles.map((p) => {
                const i = pl.pistas.indexOf(p);
                return <FilaPista key={`${p.id}-${i}`} p={p} numero={i + 1} {...(sp.puede ? { onClick: () => sp.control.mutate({ accion: "play", uri: pl.uri, desde: i }) } : {})} />;
              })}
            </div>
            {pistas.paginas}
          </>
        ) : null}
      </Vidrio>
    );
  }
  return (
    <Vidrio>
      <Cabeza icono={ListMusic} titulo="Mis playlists" />
      <ErrorCaja error={lista.error} />
      {lista.isLoading ? <Cargando /> : null}
      {lista.data?.length === 0 ? <p className="text-sm text-tenue">Todavía no tienes playlists en Spotify.</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {visibles.map((p) => (
          <button key={p.id} type="button" onClick={() => setAbierta(p.id)} className="min-w-0 rounded-2xl bg-white/[0.04] p-2.5 text-left transition-colors hover:bg-white/[0.08]">
            {p.portada ? <img src={p.portada} alt="" loading="lazy" className="mb-2 aspect-square w-full rounded-xl object-cover shadow-lg" /> : <span className="mb-2 grid aspect-square w-full place-items-center rounded-xl bg-gradient-to-br from-[#7c5cff] to-[#ff3d77] text-2xl font-extrabold">{iniciales(p.nombre)}</span>}
            <b className="block truncate text-[13px] font-semibold">{p.nombre}</b>
            <small className="text-xs text-tenue">{p.total} canciones</small>
          </button>
        ))}
      </div>
      {paginas}
    </Vidrio>
  );
}

function Recientes({ sp, conectado }: { sp: ReturnType<typeof useSpotify>; conectado: boolean }) {
  const q = useQuery({ queryKey: ["spotify", "recientes"], queryFn: () => api<(PistaSpotify & { cuando: string })[]>("/api/musica/spotify/recientes"), enabled: conectado, refetchInterval: 60_000 });
  const { visibles, paginas } = usePaginado(q.data, 6);
  if (!conectado) return null;
  return (
    <Vidrio>
      <Cabeza icono={History} titulo="Escuchado hace poco" />
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data?.length === 0 ? <p className="text-sm text-tenue">Aquí sale lo último que escuchaste.</p> : null}
      <div className="space-y-0.5">
        {visibles.map((p) => <FilaPista key={`${p.id}${p.cuando}`} p={p} {...(sp.puede ? { onClick: () => sp.control.mutate({ accion: "play", uri: p.uri }) } : {})} />)}
      </div>
      {paginas}
    </Vidrio>
  );
}

function Top({ sp, conectado }: { sp: ReturnType<typeof useSpotify>; conectado: boolean }) {
  const q = useQuery({ queryKey: ["spotify", "top"], queryFn: () => api<{ fuente: "tuyo" | "mexico" | "ninguna"; pistas: PistaSpotify[] }>("/api/musica/spotify/top"), enabled: conectado, staleTime: 10 * 60_000 });
  const { visibles, paginas, pagina } = usePaginado(q.data?.pistas, 6);
  if (!conectado) return null;
  return (
    <Vidrio>
      <Cabeza icono={Flame} titulo={q.data?.fuente === "mexico" ? "Top 50 México" : "Tu Top 50"} derecha={q.data?.fuente === "tuyo" ? <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] text-tenue">4 semanas</span> : null} />
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data?.pistas.length === 0 ? <p className="text-sm text-tenue">Escucha un poco más y aquí aparecen tus favoritas.</p> : null}
      <div className="space-y-0.5">
        {visibles.map((p, i) => (
          <FilaPista
            key={p.id}
            p={p}
            numero={(pagina - 1) * 6 + i + 1}
            {...(sp.puede ? { onClick: () => sp.control.mutate({ accion: "play", uris: (q.data?.pistas ?? []).map((x) => x.uri), desde: (pagina - 1) * 6 + i }) } : {})}
          />
        ))}
      </div>
      {paginas}
    </Vidrio>
  );
}

function MiniReproductor({ sp }: { sp: ReturnType<typeof useSpotify> }) {
  const d = sp.estado.data;
  const c = d?.cancion;
  if (!c || !d?.conectado) return null;
  return (
    <div className="fixed bottom-2.5 left-2.5 right-[76px] z-30 flex items-center gap-2.5 rounded-[18px] border border-white/15 bg-[rgba(28,24,40,0.92)] p-2 pr-2.5 shadow-2xl backdrop-blur-xl safe-bottom">
      <Portada src={c.portadaChica ?? c.portada} texto={c.nombre} tam={44} />
      <span className="min-w-0 flex-1">
        <b className="block truncate text-sm">{c.nombre}</b>
        <small className="block truncate text-xs" style={{ color: VERDE }}>
          {d.equipo ? `En: ${d.equipo}` : c.artistas}
        </small>
      </span>
      {sp.puede ? (
        <>
          <button type="button" onClick={() => sp.corazon(c.id, !c.guardada)} aria-label={c.guardada ? "Quitar de tu biblioteca" : "Guardar en tu biblioteca"} className={cx("grid h-10 w-10 place-items-center rounded-xl", c.guardada ? "text-[#ff4d8d]" : "text-tenue")}>
            <Heart className="h-5 w-5" fill={c.guardada ? "currentColor" : "none"} />
          </button>
          <button type="button" onClick={() => sp.control.mutate({ accion: d.sonando ? "pause" : "play" })} aria-label={d.sonando ? "Pausar" : "Reproducir"} className="grid h-10 w-10 place-items-center rounded-xl bg-acento text-black">
            {d.sonando ? <Pause className="h-5 w-5" fill="currentColor" /> : <Play className="h-5 w-5" fill="currentColor" />}
          </button>
        </>
      ) : null}
    </div>
  );
}

export default function Musica() {
  const sp = useSpotify();
  const forma = useForma();
  const conectado = Boolean(sp.estado.data?.conectado);
  return (
    <div className={cx(forma === "celular" && conectado && "pb-24")}>
      <Encabezado titulo="Música" descripcion="Tu Spotify y tu música en un solo lugar." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <AhoraSuena sp={sp} />
          <TuMusica />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Playlists sp={sp} conectado={conectado} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Recientes sp={sp} conectado={conectado} />
            <Top sp={sp} conectado={conectado} />
          </div>
        </div>
      </div>
      {forma === "celular" ? <MiniReproductor sp={sp} /> : null}
    </div>
  );
}
