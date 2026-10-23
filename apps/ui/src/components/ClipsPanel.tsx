import { usePaginado } from "./Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Clapperboard, Download, Link2, Maximize2, Radio, Scissors, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from "react";
import { API_BASE, api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtBytes } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";
import { EstadoCuenta, useCuentas } from "./CuentaRed";
import { useForma, useModoPagina } from "../lib/marco";
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Insignia, Modal, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "./ui";

interface Fuente {
  id: string;
  nombre: string;
  origen: string;
  duracion: number;
  bytes: number;
  url: string;
}
interface Momento {
  inicio: number;
  fin: number;
  puntaje: number;
  titulo?: string;
  hashtags?: string[];
}
interface Trabajo {
  id: string;
  tipo: "descarga" | "momentos" | "corte";
  estado: "esperando" | "trabajando" | "listo" | "error";
  progreso: number;
  detalle: string;
  resultado: unknown;
}
interface Clip {
  id: string;
  nombre: string;
  tamano: number;
  miniatura: string;
  url: string;
}
type Formato = "original" | "vertical" | "cuadrado";

const tiempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
/** "1:02:30", "12:30" o "750" a segundos. */
function aSegundos(t: string): number | null {
  if (!t.trim()) return null;
  const p = t.trim().split(":").map(Number);
  if (p.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return p.reduce((a, n) => a * 60 + n, 0);
}

/** Sigue un trabajo en segundo plano hasta que termina. */
function useTrabajo(alTerminar: (t: Trabajo) => void) {
  const [id, setId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["clips", "trabajo", id],
    queryFn: () => api<Trabajo>(`/api/clips/trabajos/${id}`),
    enabled: Boolean(id),
    refetchInterval: (c) => (c.state.data && (c.state.data.estado === "listo" || c.state.data.estado === "error") ? false : 1500),
    retry: false,
  });
  const terminado = useRef<string | null>(null);
  useEffect(() => {
    const t = q.data;
    if (t && (t.estado === "listo" || t.estado === "error") && terminado.current !== t.id) {
      terminado.current = t.id;
      if (t.estado === "error") avisarError(new Error(t.detalle));
      alTerminar(t);
      setId(null);
    }
  });
  return {
    empezar: (nuevo: string) => setId(nuevo),
    activo: q.data && q.data.estado !== "listo" && q.data.estado !== "error" ? q.data : id ? ({ detalle: "En cola…", progreso: 0 } as Pick<Trabajo, "detalle" | "progreso">) : null,
  };
}

function PublicarTikTok({ clip, alCerrar }: { clip: Clip; alCerrar: () => void }) {
  const info = useQuery({ queryKey: ["clips", "tiktok"], queryFn: () => api<{ usuario: string; privacidad: string[]; maxSegundos: number }>("/api/clips/tiktok/info"), retry: false });
  const [titulo, setTitulo] = useState(clip.nombre);
  const [privacidad, setPrivacidad] = useState("SELF_ONLY");
  const [publicacion, setPublicacion] = useState<string | null>(null);
  const estado = useQuery({
    queryKey: ["clips", "tiktok", "estado", publicacion],
    queryFn: () => api<{ estado: string; motivo: string | null }>(`/api/clips/tiktok/estado/${publicacion}`),
    enabled: Boolean(publicacion),
    refetchInterval: (c) => (c.state.data && ["PUBLISH_COMPLETE", "FAILED", "SEND_TO_USER_INBOX"].includes(c.state.data.estado) ? false : 3000),
  });
  const publicar = useMutation({
    mutationFn: () => api<{ publishId: string }>("/api/clips/tiktok/publicar", { cuerpo: { proyectoId: clip.id, titulo, privacidad } }),
    onSuccess: (r) => setPublicacion(r.publishId),
    onError: avisarError,
  });
  const opciones = info.data?.privacidad ?? ["SELF_ONLY"];
  const NOMBRES: Record<string, string> = { PUBLIC_TO_EVERYONE: "Público", MUTUAL_FOLLOW_FRIENDS: "Amigos", FOLLOWER_OF_CREATOR: "Seguidores", SELF_ONLY: "Solo yo (privado)" };
  const e = estado.data?.estado;
  return (
    <Modal abierto titulo="Subir a TikTok" alCerrar={alCerrar}>
      <div className="space-y-3">
        <ErrorCaja error={info.error} />
        {info.data ? (
          <p className="text-xs text-tenue">
            Cuenta: {info.data.usuario || "conectada"} · máximo {tiempo(info.data.maxSegundos)}
          </p>
        ) : null}
        <Campo etiqueta="Texto del video (con hashtags)">
          <textarea value={titulo} onChange={(ev) => setTitulo(ev.target.value)} rows={3} maxLength={2200} className="w-full rounded-xl border border-borde bg-fondo p-2 text-sm" />
        </Campo>
        <Campo etiqueta="¿Quién lo ve?">
          <Selector value={privacidad} onChange={(ev) => setPrivacidad(ev.target.value)}>
            {opciones.map((o) => (
              <option key={o} value={o}>
                {NOMBRES[o] ?? o}
              </option>
            ))}
          </Selector>
        </Campo>
        <p className="rounded-xl bg-fondo p-2 text-xs text-tenue">
          Mientras TikTok no apruebe tu app (developers.tiktok.com), solo deja publicar videos privados («Solo yo»); luego los pasas a público desde TikTok.
        </p>
        {publicacion ? (
          <p className="text-sm">
            {e === "PUBLISH_COMPLETE"
              ? "✅ Publicado en TikTok."
              : e === "SEND_TO_USER_INBOX"
                ? "✅ Enviado a tu bandeja de TikTok: ábrelo en la app para publicarlo."
                : e === "FAILED"
                  ? `❌ TikTok lo rechazó: ${estado.data?.motivo ?? "sin motivo"}`
                  : "⏳ TikTok lo está procesando…"}
          </p>
        ) : (
          <Boton variante="primario" icono={Upload} cargando={publicar.isPending} disabled={!titulo.trim() || Boolean(info.error)} onClick={() => publicar.mutate()}>
            Subir a TikTok
          </Boton>
        )}
      </div>
    </Modal>
  );
}

type Paso = 1 | 2 | 3;
const FORMATOS: { id: Formato; texto: string; caja: string }[] = [
  { id: "vertical", texto: "9:16", caja: "aspect-[9/16]" },
  { id: "cuadrado", texto: "1:1", caja: "aspect-square" },
  { id: "original", texto: "Original", caja: "aspect-video" },
];

function Pasos({ paso, alCambiar, listos }: { paso: Paso; alCambiar: (p: Paso) => void; listos: Record<Paso, boolean> }) {
  const nombres: Record<Paso, string> = { 1: "Trae tu stream", 2: "Elige y corta", 3: "Mis clips" };
  return (
    <ol className="grid grid-cols-3 gap-2">
      {([1, 2, 3] as Paso[]).map((n) => (
        <li key={n}>
          <button
            type="button"
            onClick={() => alCambiar(n)}
            className={cx(
              "flex w-full items-center gap-2 rounded-2xl border p-2.5 text-left transition-colors sm:p-3",
              paso === n ? "border-acento bg-[color-mix(in_srgb,var(--acento)_12%,transparent)]" : "border-borde bg-superficie hover:border-tenue",
            )}
          >
            <span
              className={cx(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold",
                listos[n] ? "bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-ok" : paso === n ? "bg-acento text-fondo" : "bg-tarjeta text-tenue",
              )}
            >
              {listos[n] && paso !== n ? <Check className="h-4 w-4" /> : n}
            </span>
            <span className="hidden min-w-0 truncate text-sm font-medium sm:block">{nombres[n]}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function LineaTiempo({
  duracion,
  inicio,
  fin,
  momentos,
  alCambiar,
  alIr,
}: {
  duracion: number;
  inicio: number;
  fin: number;
  momentos: Momento[];
  alCambiar: (inicio: number, fin: number) => void;
  alIr: (s: number) => void;
}) {
  const total = Math.max(1, duracion);
  const pct = (s: number) => `${Math.min(100, Math.max(0, (s / total) * 100))}%`;
  const barras = Array.from({ length: 64 }, (_, i) => 30 + Math.round(55 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.35))));
  return (
    <div className="space-y-2">
      <div className="relative h-16 overflow-hidden rounded-xl border border-borde bg-fondo">
        <div className="absolute inset-0 flex items-center gap-[2px] px-1">
          {barras.map((h, i) => (
            <span key={i} className="flex-1 rounded-full bg-[color-mix(in_srgb,var(--texto-2)_40%,transparent)]" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="absolute inset-y-0 border-x-2 border-acento bg-[color-mix(in_srgb,var(--acento)_22%,transparent)]" style={{ left: pct(inicio), width: `calc(${pct(fin)} - ${pct(inicio)})` }} />
        {momentos.map((m, i) => (
          <button
            key={i}
            type="button"
            title={m.titulo ?? `Momento ${i + 1}`}
            onClick={() => {
              alCambiar(m.inicio, m.fin);
              alIr(m.inicio);
            }}
            className="absolute top-1 grid h-5 w-5 -translate-x-1/2 place-items-center rounded-full bg-aviso text-[10px] font-bold text-fondo"
            style={{ left: pct((m.inicio + m.fin) / 2) }}
          >
            {i + 1}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-tenue">
          <span>{`Inicio: ${tiempo(inicio)}`}</span>
          <input type="range" min={0} max={total} step={1} value={inicio} onChange={(e) => alCambiar(Math.min(Number(e.target.value), fin - 1), fin)} className="w-full accent-[var(--acento)]" />
        </label>
        <label className="space-y-1 text-xs text-tenue">
          <span>{`Fin: ${tiempo(fin)} · dura ${tiempo(Math.max(0, fin - inicio))}`}</span>
          <input type="range" min={0} max={total} step={1} value={fin} onChange={(e) => alCambiar(inicio, Math.max(Number(e.target.value), inicio + 1))} className="w-full accent-[var(--acento)]" />
        </label>
      </div>
    </div>
  );
}

function VistaFormato({ src, formato, video }: { src: string; formato: Formato; video?: Ref<HTMLVideoElement> }) {
  const caja = FORMATOS.find((f) => f.id === formato)?.caja ?? "aspect-video";
  return (
    <div className={cx("relative mx-auto max-h-full overflow-hidden rounded-2xl bg-black", caja, formato === "vertical" ? "h-full max-w-full" : "w-full")}>
      <video ref={video} src={src} muted playsInline className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}

export function ClipsPanel() {
  const puede = usePuede("streams", "escritura");
  const cuentas = useCuentas();
  const tiktok = cuentas.data?.find((c) => c.plataforma === "tiktok");
  const twitch = cuentas.data?.find((c) => c.plataforma === "twitch");
  const herramientas = useQuery({ queryKey: ["clips", "herramientas"], queryFn: () => api<{ ffmpeg: boolean; ytdlp: boolean; ia: boolean }>("/api/clips/herramientas"), retry: false });
  const fuentes = useQuery({ queryKey: ["clips", "fuentes"], queryFn: () => api<Fuente[]>("/api/clips/fuentes") });
  const clips = useQuery({ queryKey: ["clips", "mis"], queryFn: () => api<Clip[]>("/api/clips/mis-clips") });
  const recientes = useQuery({
    queryKey: ["clips", "twitch"],
    queryFn: () => api<{ id: string; url: string; titulo: string; vistas: number; duracion: number; miniatura: string }[]>("/api/clips/twitch/recientes"),
    enabled: Boolean(twitch?.cuenta),
    retry: false,
  });

  const [url, setUrl] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [elegida, setElegida] = useState<string | null>(null);
  const [momentos, setMomentos] = useState<Record<string, Momento[]>>({});
  const [manual, setManual] = useState({ inicio: "0:00", fin: "0:30", formato: "vertical" as Formato, nombre: "" });
  const [tiktokClip, setTiktokClip] = useState<Clip | null>(null);
  const [ver, setVer] = useState<Clip | null>(null);
  const reproductor = useRef<HTMLVideoElement>(null);
  const entradaVideo = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [paso, setPaso] = useState<Paso>(1);
  const [completo, setCompleto] = useState(false);
  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: ["clips"] });
    void queryClient.invalidateQueries({ queryKey: ["estudio"] });
  };

  const trabajo = useTrabajo((t) => {
    if (t.estado !== "listo") return;
    if (t.tipo === "momentos" && elegida) setMomentos((m) => ({ ...m, [elegida]: t.resultado as Momento[] }));
    if (t.tipo === "descarga") {
      const f = t.resultado as Fuente;
      setElegida(f.id);
      setPaso(2);
      avisar("Video listo. Busca momentos con IA o córtalo a mano.");
    }
    if (t.tipo === "corte") avisar("¡Clip listo! Está en «Mis clips».");
    refrescar();
  });

  const traer = useMutation({
    mutationFn: () => {
      const inicio = aSegundos(desde);
      const fin = aSegundos(hasta);
      return api<{ trabajo: string }>("/api/clips/fuentes/url", { cuerpo: { url, ...(inicio !== null && fin !== null ? { inicio, fin } : {}) } });
    },
    onSuccess: (r) => {
      trabajo.empezar(r.trabajo);
      setUrl("");
    },
    onError: avisarError,
  });
  const importarTwitch = (u: string) =>
    api<{ trabajo: string }>("/api/clips/fuentes/url", { cuerpo: { url: u } })
      .then((r) => trabajo.empezar(r.trabajo))
      .catch(avisarError);
  const crearEnVivo = useMutation({
    mutationFn: () => api<{ id: string; url: string }>("/api/clips/twitch/crear", { metodo: "POST" }),
    onSuccess: (r) => {
      avisar("Clip pedido a Twitch. En unos 20 segundos aparece abajo para importarlo.", "info");
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["clips", "twitch"] }), 20_000);
      void r;
    },
    onError: avisarError,
  });
  const buscarMomentos = useMutation({
    mutationFn: (id: string) => api<{ trabajo: string }>(`/api/clips/fuentes/${id}/momentos`, { cuerpo: { cantidad: 5 } }),
    onSuccess: (r) => trabajo.empezar(r.trabajo),
    onError: avisarError,
  });
  const cortar = useMutation({
    mutationFn: (b: { fuenteId: string; inicio: number; fin: number; formato: Formato; nombre: string }) => api<{ trabajo: string }>("/api/clips/cortar", { cuerpo: b }),
    onSuccess: (r) => trabajo.empezar(r.trabajo),
    onError: avisarError,
  });

  const fuente = fuentes.data?.find((f) => f.id === elegida) ?? null;
  const irA = (s: number) => {
    if (reproductor.current) {
      reproductor.current.currentTime = s;
      void reproductor.current.play().catch(() => undefined);
    }
  };
  const subir = async (f: File) => {
    setSubiendo(true);
    try {
      const datos = new FormData();
      datos.append("archivo", f);
      const nueva = await api<Fuente>("/api/clips/fuentes/subir", { formulario: datos });
      setElegida(nueva.id);
      setPaso(2);
      refrescar();
    } catch (err) {
      avisarError(err);
    } finally {
      setSubiendo(false);
    }
  };

  const pgCl = usePaginado(clips.data, 12);
  if (!puede) return <Vacio icono={Clapperboard} texto="Necesitas permiso de escritura en Streams para crear clips." />;
  const faltan = herramientas.data && (!herramientas.data.ffmpeg || !herramientas.data.ytdlp);
  const ini = aSegundos(manual.inicio) ?? 0;
  const fin = aSegundos(manual.fin) ?? 30;
  const ponerRango = (a: number, b: number) => setManual((m) => ({ ...m, inicio: tiempo(a), fin: tiempo(b) }));
  const crearClip = () => {
    if (!fuente) return;
    if (fin <= ini) return avisarError(new Error("Revisa inicio y fin (ej. 1:30 y 2:00)"));
    cortar.mutate({ fuenteId: fuente.id, inicio: ini, fin, formato: manual.formato, nombre: manual.nombre.trim() });
  };
  const usarMomento = (m: Momento, i: number) =>
    setManual((x) => ({ ...x, inicio: tiempo(m.inicio), fin: tiempo(m.fin), nombre: `${m.titulo ?? `Momento ${i + 1}`} ${m.hashtags?.join(" ") ?? ""}`.trim().slice(0, 80) }));
  const listaMomentos = fuente ? (momentos[fuente.id] ?? []) : [];

  const panelMomentos = fuente ? (
    <div className="space-y-2">
      <Boton variante="primario" className="w-full" icono={Sparkles} cargando={buscarMomentos.isPending} disabled={!herramientas.data?.ffmpeg} onClick={() => buscarMomentos.mutate(fuente.id)}>
        Buscar mejores momentos con IA
      </Boton>
      <p className="text-xs text-tenue">
        Escucha todo el video, encuentra los picos de risas, gritos y emoción, y les pone título y hashtags.
        {herramientas.data && !herramientas.data.ia ? " (Sin IA configurada los títulos son simples.)" : ""}
      </p>
      {listaMomentos.map((m, i) => (
        <div key={i} className="rounded-xl border border-borde bg-fondo p-2.5 text-xs">
          <p className="flex items-center gap-2 font-medium">
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-aviso text-[10px] font-bold text-fondo">{i + 1}</span>
            <span className="min-w-0 truncate">{m.titulo}</span>
          </p>
          <p className="mt-1 text-tenue">
            {tiempo(m.inicio)} → {tiempo(m.fin)} · audio +{m.puntaje} dB
          </p>
          {m.hashtags?.length ? <p className="text-acento">{m.hashtags.join(" ")}</p> : null}
          <div className="mt-1.5 flex flex-wrap gap-1">
            <Boton tamano="sm" variante="fantasma" onClick={() => irA(m.inicio)}>
              Ver
            </Boton>
            <Boton tamano="sm" variante="fantasma" onClick={() => usarMomento(m, i)}>
              Usar
            </Boton>
            <Boton
              tamano="sm"
              icono={Scissors}
              cargando={cortar.isPending}
              onClick={() => cortar.mutate({ fuenteId: fuente.id, inicio: m.inicio, fin: m.fin, formato: "vertical", nombre: (m.titulo ?? `Momento ${i + 1}`).slice(0, 80) })}
            >
              Cortar vertical
            </Boton>
          </div>
        </div>
      ))}
    </div>
  ) : null;

  const ajustes = (
    <div className="space-y-3">
      <Campo etiqueta="Formato">
        <div className="grid grid-cols-3 gap-2">
          {FORMATOS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setManual({ ...manual, formato: f.id })}
              className={cx("flex flex-col items-center gap-1.5 rounded-xl border p-2 text-xs", manual.formato === f.id ? "border-acento text-texto" : "border-borde text-tenue")}
            >
              <span className={cx("w-6 rounded-sm border-2 border-current", f.caja)} />
              {f.texto}
            </button>
          ))}
        </div>
      </Campo>
      <Campo etiqueta="Nombre del clip">
        <Entrada value={manual.nombre} onChange={(e) => setManual({ ...manual, nombre: e.target.value })} placeholder="Mi mejor jugada" maxLength={80} />
      </Campo>
      <Boton variante="primario" className="w-full" icono={Scissors} cargando={cortar.isPending} disabled={!manual.nombre.trim() || !fuente} onClick={crearClip}>
        Crear clip
      </Boton>
    </div>
  );

  if (completo && fuente) {
    return (
      <EditorCompleto
        fuente={fuente}
        reproductor={reproductor}
        inicio={ini}
        fin={fin}
        formato={manual.formato}
        momentos={listaMomentos}
        alRango={ponerRango}
        alIr={irA}
        alCerrar={() => setCompleto(false)}
        trabajo={trabajo.activo}
        ajustes={ajustes}
        momentosPanel={panelMomentos}
        tiktok={tiktok?.cuenta ? <p className="text-xs text-tenue">Cuando el clip esté listo, súbelo a TikTok desde «Mis clips».</p> : null}
      />
    );
  }

  return (
    <div className="space-y-4">
      {faltan ? (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--aviso)_12%,transparent)] p-3 text-sm">
          Este servidor no tiene {[!herramientas.data!.ffmpeg && "ffmpeg", !herramientas.data!.ytdlp && "yt-dlp"].filter(Boolean).join(" ni ")}. Con Docker se instalan solos al actualizar el VPS
          (docker compose up -d --build).
        </p>
      ) : null}

      <Pasos paso={paso} alCambiar={setPaso} listos={{ 1: Boolean(fuentes.data?.length), 2: Boolean(clips.data?.length), 3: false }} />

      {trabajo.activo ? (
        <div className="rounded-2xl border border-borde bg-superficie p-3 text-sm">
          <p>{trabajo.activo.detalle}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-fondo">
            <div className="h-full bg-acento transition-all" style={{ width: `${Math.max(4, trabajo.activo.progreso)}%` }} />
          </div>
        </div>
      ) : null}

      {paso === 1 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Tarjeta titulo="Trae tu stream" icono={Link2}>
            <div className="space-y-3">
              <Campo etiqueta="Enlace de Twitch, Kick o YouTube (tu video o clip)">
                <Entrada value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.twitch.tv/videos/…" />
              </Campo>
              <div className="grid grid-cols-2 gap-2">
                <Campo etiqueta="Desde (opcional)" ayuda="Ej. 1:02:30">
                  <Entrada value={desde} onChange={(e) => setDesde(e.target.value)} placeholder="0:00" />
                </Campo>
                <Campo etiqueta="Hasta" ayuda="Obligatorio en transmisiones completas">
                  <Entrada value={hasta} onChange={(e) => setHasta(e.target.value)} placeholder="30:00" />
                </Campo>
              </div>
              <div className="flex flex-wrap gap-2">
                <Boton variante="primario" icono={Link2} cargando={traer.isPending} disabled={url.trim().length < 10} onClick={() => traer.mutate()}>
                  Traer
                </Boton>
                <Boton icono={Upload} cargando={subiendo} onClick={() => entradaVideo.current?.click()}>
                  Subir un video
                </Boton>
                <input
                  ref={entradaVideo}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) void subir(e.target.files[0]);
                    e.target.value = "";
                  }}
                />
              </div>
              <p className="text-xs text-tenue">Para una transmisión larga baja solo el pedazo que quieras (desde/hasta). Las fuentes se borran solas a los 2 días; los clips que cortes se quedan.</p>
            </div>
          </Tarjeta>

          <Tarjeta titulo="En vivo y clips de Twitch" icono={Radio}>
            {twitch && !twitch.cuenta ? <p className="mb-2 text-xs text-tenue">Conecta Twitch en la pestaña «Mis streams» para crear clips del directo.</p> : null}
            {twitch?.cuenta ? (
              <div className="space-y-3">
                <Boton icono={Scissors} cargando={crearEnVivo.isPending} onClick={() => crearEnVivo.mutate()}>
                  Crear un clip del directo ahora
                </Boton>
                <ErrorCaja error={recientes.error} />
                {recientes.isLoading ? <Cargando /> : null}
                {recientes.data?.length === 0 ? <p className="text-xs text-tenue">No hay clips tuyos de los últimos 14 días.</p> : null}
                <ul className="max-h-64 space-y-1 overflow-auto">
                  {recientes.data?.map((c) => (
                    <li key={c.id} className="flex items-center gap-2 rounded-xl border border-borde p-1.5 text-xs">
                      <img src={c.miniatura} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.titulo}</span>
                        <span className="text-tenue">
                          {c.vistas} vistas · {Math.round(c.duracion)} s
                        </span>
                      </span>
                      <Boton tamano="sm" onClick={() => void importarTwitch(c.url)}>
                        Importar
                      </Boton>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Tarjeta>
        </div>
      ) : null}

      {paso === 2 ? (
        <Tarjeta
          titulo="Elige y corta"
          icono={Wand2}
          acciones={
            fuente ? (
              <Boton tamano="sm" icono={Maximize2} onClick={() => setCompleto(true)}>
                Abrir editor completo
              </Boton>
            ) : null
          }
        >
          {fuentes.isLoading ? <Cargando /> : null}
          {fuentes.data?.length === 0 ? <Vacio icono={Clapperboard} texto="Todavía no hay videos. Trae tu stream con un enlace o sube un video." /> : null}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {fuentes.data?.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setElegida(f.id)}
                className={cx("shrink-0 rounded-xl border px-3 py-1.5 text-left text-xs", elegida === f.id ? "border-acento bg-tarjeta" : "border-borde")}
              >
                <span className="block max-w-[14rem] truncate font-medium">{f.nombre}</span>
                <span className="text-tenue">
                  {tiempo(f.duracion)} · {fmtBytes(f.bytes)}
                </span>
              </button>
            ))}
          </div>
          {fuente ? (
            <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-3">
                <video ref={reproductor} src={`${API_BASE}${fuente.url}`} controls className="max-h-[50vh] w-full rounded-2xl bg-black" />
                <LineaTiempo duracion={fuente.duracion} inicio={ini} fin={fin} momentos={listaMomentos} alCambiar={ponerRango} alIr={irA} />
                <div className="flex flex-wrap gap-2">
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    onClick={() => {
                      const t = Math.floor(reproductor.current?.currentTime ?? 0);
                      ponerRango(t, Math.max(fin, t + 1));
                    }}
                  >
                    Marcar inicio aquí
                  </Boton>
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    onClick={() => {
                      const t = Math.floor(reproductor.current?.currentTime ?? 0);
                      ponerRango(ini, Math.max(ini + 1, t));
                    }}
                  >
                    Marcar fin aquí
                  </Boton>
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    icono={Trash2}
                    onClick={async () => {
                      if (!(await confirmar({ titulo: "Borrar video", mensaje: `${fuente.nombre} se borra del servidor (tus clips cortados se quedan).`, boton: "Borrar" }))) return;
                      await api(`/api/clips/fuentes/${fuente.id}`, { metodo: "DELETE" }).catch(avisarError);
                      setElegida(null);
                      refrescar();
                    }}
                  >
                    Borrar este video
                  </Boton>
                </div>
              </div>
              <div className="space-y-4">
                {ajustes}
                {panelMomentos}
              </div>
            </div>
          ) : fuentes.data?.length ? (
            <p className="mt-3 text-sm text-tenue">Elige un video de arriba para cortarlo.</p>
          ) : null}
        </Tarjeta>
      ) : null}

      {paso === 3 ? (
        <Tarjeta
          titulo="Mis clips y TikTok"
          icono={Clapperboard}
          acciones={tiktok ? <Insignia tono={tiktok.cuenta ? "ok" : "neutro"}>{tiktok.cuenta ? `TikTok: ${tiktok.cuenta}` : "TikTok sin conectar"}</Insignia> : null}
        >
          {tiktok ? (
            <div className="mb-3">
              <EstadoCuenta c={tiktok} />
            </div>
          ) : null}
          {clips.data?.length === 0 ? <Vacio icono={Clapperboard} texto="Aquí aparecen los clips que cortes." /> : null}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {pgCl.visibles.map((c) => (
              <div key={c.id} className="min-w-0 rounded-2xl border border-borde bg-fondo p-2">
                <button type="button" className="block w-full" onClick={() => setVer(c)}>
                  {c.miniatura ? (
                    <img src={c.miniatura} alt="" className="aspect-video w-full rounded-xl bg-fondo object-cover" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-xl bg-tarjeta text-tenue">Video</div>
                  )}
                </button>
                <p className="mt-1.5 truncate text-xs font-medium">{c.nombre}</p>
                <p className="text-[11px] text-tenue">{fmtBytes(c.tamano)}</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {tiktok?.cuenta ? (
                    <Boton tamano="sm" variante="primario" onClick={() => setTiktokClip(c)}>
                      TikTok
                    </Boton>
                  ) : null}
                  <Boton tamano="icono" variante="fantasma" icono={Download} aria-label="Descargar" onClick={() => abrirExterno(`${API_BASE}${c.url}`)} />
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label={`Borrar ${c.nombre}`}
                    onClick={async () => {
                      if (!(await confirmar({ titulo: "Borrar clip", mensaje: `${c.nombre} se borra para siempre.`, peligroso: true, boton: "Borrar" }))) return;
                      await api(`/api/estudio/proyectos/${c.id}`, { metodo: "DELETE" }).catch(avisarError);
                      refrescar();
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {pgCl.paginas}
        </Tarjeta>
      ) : null}

      {tiktokClip ? <PublicarTikTok clip={tiktokClip} alCerrar={() => setTiktokClip(null)} /> : null}
      {ver ? (
        <Modal abierto titulo={ver.nombre} alCerrar={() => setVer(null)}>
          <video src={`${API_BASE}${ver.url}`} controls autoPlay className="max-h-[60vh] w-full rounded-xl bg-black" />
        </Modal>
      ) : null}
    </div>
  );
}

function EditorCompleto({
  fuente,
  reproductor,
  inicio,
  fin,
  formato,
  momentos,
  alRango,
  alIr,
  alCerrar,
  trabajo,
  ajustes,
  momentosPanel,
  tiktok,
}: {
  fuente: Fuente;
  reproductor: RefObject<HTMLVideoElement>;
  inicio: number;
  fin: number;
  formato: Formato;
  momentos: Momento[];
  alRango: (a: number, b: number) => void;
  alIr: (s: number) => void;
  alCerrar: () => void;
  trabajo: Pick<Trabajo, "detalle" | "progreso"> | null;
  ajustes: ReactNode;
  momentosPanel: ReactNode;
  tiktok: ReactNode;
}) {
  useModoPagina("completa");
  const forma = useForma();
  const previa = useRef<HTMLVideoElement>(null);
  const src = `${API_BASE}${fuente.url}`;
  useEffect(() => {
    const v = reproductor.current;
    const p = previa.current;
    if (!v || !p) return;
    const seguir = () => {
      if (Math.abs(p.currentTime - v.currentTime) > 0.3) p.currentTime = v.currentTime;
      if (v.paused) p.pause();
      else void p.play().catch(() => undefined);
    };
    v.addEventListener("timeupdate", seguir);
    v.addEventListener("play", seguir);
    v.addEventListener("pause", seguir);
    return () => {
      v.removeEventListener("timeupdate", seguir);
      v.removeEventListener("play", seguir);
      v.removeEventListener("pause", seguir);
    };
  }, [reproductor, formato, forma]);
  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex h-[var(--alto-app,100dvh)] flex-col bg-fondo">
      <header className="flex items-center gap-2 border-b border-borde px-3 py-2">
        <Boton variante="fantasma" tamano="icono" icono={ArrowLeft} aria-label="Volver" onClick={alCerrar} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{fuente.nombre}</p>
          <p className="text-xs text-tenue">{`${tiempo(inicio)} → ${tiempo(fin)} · dura ${tiempo(Math.max(0, fin - inicio))}`}</p>
        </div>
      </header>
      {trabajo ? (
        <div className="border-b border-borde px-3 py-2 text-xs">
          {trabajo.detalle}
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-tarjeta">
            <div className="h-full bg-acento" style={{ width: `${Math.max(4, trabajo.progreso)}%` }} />
          </div>
        </div>
      ) : null}
      <div className={cx("min-h-0 flex-1", forma === "pc" ? "grid grid-cols-[minmax(0,1fr)_340px]" : "overflow-y-auto")}>
        <div className={cx("flex min-w-0 flex-col gap-3 p-3", forma === "pc" && "min-h-0")}>
          <div className={cx("grid gap-3", forma === "celular" ? "grid-cols-1" : "min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto]")}>
            <video
              ref={reproductor}
              src={src}
              controls
              className={cx("w-full rounded-2xl bg-black object-contain", forma === "celular" ? "max-h-[38vh]" : forma === "tablet" ? "max-h-[46vh]" : "h-full min-h-[14rem]")}
            />
            {forma !== "celular" ? (
              <div className={cx("flex min-h-0 flex-col items-center gap-1", formato === "vertical" ? "w-[clamp(8rem,16vw,14rem)]" : "w-[clamp(11rem,20vw,18rem)]")}>
                <span className="text-xs text-tenue">Así queda</span>
                <div className={cx("flex w-full items-center", forma === "pc" ? "min-h-0 flex-1" : "max-h-[46vh]")}>
                  <VistaFormato src={src} formato={formato} video={previa} />
                </div>
              </div>
            ) : null}
          </div>
          <LineaTiempo duracion={fuente.duracion} inicio={inicio} fin={fin} momentos={momentos} alCambiar={alRango} alIr={alIr} />
        </div>
        <aside className={cx("space-y-4 p-3", forma === "pc" ? "overflow-y-auto border-l border-borde" : "border-t border-borde")}>
          {ajustes}
          {tiktok}
          {momentosPanel}
        </aside>
      </div>
    </div>
  );
}
