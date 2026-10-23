/**
 * Clips de tus streams (estilo NexxusClip): trae tu transmisión por enlace o archivo, deja que la IA proponga los
 * mejores momentos con título y hashtags (o córtalos a mano), saca el video en formato vertical para TikTok y
 * publícalo ahí. Usa solo tus propios streams.
 */
import { usePaginado } from "./Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Clapperboard, Download, Link2, Radio, Scissors, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API_BASE, api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { fmtBytes } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";
import { EstadoCuenta, useCuentas } from "./CuentaRed";
import { Boton, Campo, Cargando, Entrada, ErrorCaja, Insignia, Modal, Selector, Tarjeta, Vacio, avisar, avisarError } from "./ui";

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
  return { empezar: (nuevo: string) => setId(nuevo), activo: q.data && q.data.estado !== "listo" && q.data.estado !== "error" ? q.data : id ? ({ detalle: "En cola…", progreso: 0 } as Pick<Trabajo, "detalle" | "progreso">) : null };
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
        {info.data ? <p className="text-xs text-tenue">Cuenta: {info.data.usuario || "conectada"} · máximo {tiempo(info.data.maxSegundos)}</p> : null}
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
        <p className="rounded-xl bg-fondo p-2 text-xs text-tenue">Mientras TikTok no apruebe tu app (developers.tiktok.com), solo deja publicar videos privados («Solo yo»); luego los pasas a público desde TikTok.</p>
        {publicacion ? (
          <p className="text-sm">
            {e === "PUBLISH_COMPLETE" ? "✅ Publicado en TikTok." : e === "SEND_TO_USER_INBOX" ? "✅ Enviado a tu bandeja de TikTok: ábrelo en la app para publicarlo." : e === "FAILED" ? `❌ TikTok lo rechazó: ${estado.data?.motivo ?? "sin motivo"}` : "⏳ TikTok lo está procesando…"}
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

export function ClipsPanel() {
  const puede = usePuede("streams", "escritura");
  const cuentas = useCuentas();
  const tiktok = cuentas.data?.find((c) => c.plataforma === "tiktok");
  const twitch = cuentas.data?.find((c) => c.plataforma === "twitch");
  const herramientas = useQuery({ queryKey: ["clips", "herramientas"], queryFn: () => api<{ ffmpeg: boolean; ytdlp: boolean; ia: boolean }>("/api/clips/herramientas"), retry: false });
  const fuentes = useQuery({ queryKey: ["clips", "fuentes"], queryFn: () => api<Fuente[]>("/api/clips/fuentes") });
  const clips = useQuery({ queryKey: ["clips", "mis"], queryFn: () => api<Clip[]>("/api/clips/mis-clips") });
  const recientes = useQuery({ queryKey: ["clips", "twitch"], queryFn: () => api<{ id: string; url: string; titulo: string; vistas: number; duracion: number; miniatura: string }[]>("/api/clips/twitch/recientes"), enabled: Boolean(twitch?.cuenta), retry: false });

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
      avisar("Video listo. Busca momentos con IA o córtalo a mano.");
    }
    if (t.tipo === "corte") avisar("¡Clip listo! Está abajo en «Mis clips».");
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
  return (
    <div className="space-y-4">
      {faltan ? (
        <p className="rounded-xl bg-amber-500/10 p-3 text-sm">
          Este servidor no tiene {[!herramientas.data!.ffmpeg && "ffmpeg", !herramientas.data!.ytdlp && "yt-dlp"].filter(Boolean).join(" ni ")}. Con Docker se instalan solos al actualizar el VPS (docker compose up -d --build).
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Tarjeta titulo="1. Trae tu stream" icono={Link2}>
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
              <input ref={entradaVideo} type="file" accept="video/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) void subir(e.target.files[0]); e.target.value = ""; }} />
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
              <ul className="max-h-56 space-y-1 overflow-auto">
                {recientes.data?.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 rounded-lg border border-borde p-1.5 text-xs">
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

      {trabajo.activo ? (
        <div className="rounded-xl border border-borde bg-superficie p-3 text-sm">
          <p>{trabajo.activo.detalle}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-fondo">
            <div className="h-full bg-acento transition-all" style={{ width: `${Math.max(4, trabajo.activo.progreso)}%` }} />
          </div>
        </div>
      ) : null}

      <Tarjeta titulo="2. Elige y corta" icono={Wand2}>
        {fuentes.isLoading ? <Cargando /> : null}
        {fuentes.data?.length === 0 ? <Vacio icono={Clapperboard} texto="Todavía no hay videos. Trae tu stream con un enlace o sube un video." /> : null}
        <div className="flex flex-wrap gap-2">
          {fuentes.data?.map((f) => (
            <button key={f.id} type="button" onClick={() => setElegida(f.id)} className={`rounded-xl border px-3 py-1.5 text-left text-xs ${elegida === f.id ? "border-acento bg-tarjeta" : "border-borde"}`}>
              <span className="block max-w-[14rem] truncate font-medium">{f.nombre}</span>
              <span className="text-tenue">
                {tiempo(f.duracion)} · {fmtBytes(f.bytes)}
              </span>
            </button>
          ))}
        </div>
        {fuente ? (
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-2">
              <video ref={reproductor} src={`${API_BASE}${fuente.url}`} controls className="max-h-[50vh] w-full rounded-xl bg-black" />
              <div className="flex flex-wrap items-end gap-2">
                <Campo etiqueta="Inicio">
                  <Entrada className="w-24" value={manual.inicio} onChange={(e) => setManual({ ...manual, inicio: e.target.value })} />
                </Campo>
                <Boton tamano="sm" variante="fantasma" onClick={() => reproductor.current && setManual({ ...manual, inicio: tiempo(reproductor.current.currentTime) })}>
                  Marcar aquí
                </Boton>
                <Campo etiqueta="Fin">
                  <Entrada className="w-24" value={manual.fin} onChange={(e) => setManual({ ...manual, fin: e.target.value })} />
                </Campo>
                <Boton tamano="sm" variante="fantasma" onClick={() => reproductor.current && setManual({ ...manual, fin: tiempo(reproductor.current.currentTime) })}>
                  Marcar aquí
                </Boton>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Campo etiqueta="Formato">
                  <Selector value={manual.formato} onChange={(e) => setManual({ ...manual, formato: e.target.value as Formato })}>
                    <option value="vertical">Vertical 9:16 (TikTok)</option>
                    <option value="cuadrado">Cuadrado 1:1</option>
                    <option value="original">Original</option>
                  </Selector>
                </Campo>
                <Campo etiqueta="Nombre del clip">
                  <Entrada value={manual.nombre} onChange={(e) => setManual({ ...manual, nombre: e.target.value })} placeholder="Mi mejor jugada" maxLength={80} />
                </Campo>
                <Boton
                  variante="primario"
                  icono={Scissors}
                  cargando={cortar.isPending}
                  disabled={!manual.nombre.trim()}
                  onClick={() => {
                    const i = aSegundos(manual.inicio);
                    const f = aSegundos(manual.fin);
                    if (i === null || f === null || f <= i) return avisarError(new Error("Revisa inicio y fin (ej. 1:30 y 2:00)"));
                    cortar.mutate({ fuenteId: fuente.id, inicio: i, fin: f, formato: manual.formato, nombre: manual.nombre.trim() });
                  }}
                >
                  Crear clip
                </Boton>
              </div>
            </div>
            <div className="space-y-2">
              <Boton variante="primario" icono={Sparkles} cargando={buscarMomentos.isPending} disabled={!herramientas.data?.ffmpeg} onClick={() => buscarMomentos.mutate(fuente.id)}>
                Buscar mejores momentos con IA
              </Boton>
              <p className="text-xs text-tenue">Escucha todo el video, encuentra los picos de risas, gritos y emoción, y les pone título y hashtags.{herramientas.data && !herramientas.data.ia ? " (Sin IA configurada los títulos son simples.)" : ""}</p>
              {(momentos[fuente.id] ?? []).map((m, i) => (
                <div key={i} className="rounded-xl border border-borde p-2 text-xs">
                  <p className="font-medium">{m.titulo}</p>
                  <p className="text-tenue">
                    {tiempo(m.inicio)} → {tiempo(m.fin)} · audio +{m.puntaje} dB
                  </p>
                  {m.hashtags?.length ? <p className="text-acento">{m.hashtags.join(" ")}</p> : null}
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Boton tamano="sm" variante="fantasma" onClick={() => irA(m.inicio)}>
                      Ver
                    </Boton>
                    <Boton tamano="sm" variante="fantasma" onClick={() => setManual({ ...manual, inicio: tiempo(m.inicio), fin: tiempo(m.fin), nombre: `${m.titulo ?? ""} ${m.hashtags?.join(" ") ?? ""}`.trim().slice(0, 80) })}>
                      Ajustar
                    </Boton>
                    <Boton tamano="sm" icono={Scissors} cargando={cortar.isPending} onClick={() => cortar.mutate({ fuenteId: fuente.id, inicio: m.inicio, fin: m.fin, formato: "vertical", nombre: (m.titulo ?? `Momento ${i + 1}`).slice(0, 80) })}>
                      Cortar vertical
                    </Boton>
                  </div>
                </div>
              ))}
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
        ) : null}
      </Tarjeta>

      <Tarjeta titulo="3. Mis clips y TikTok" icono={Clapperboard} acciones={tiktok ? <Insignia tono={tiktok.cuenta ? "ok" : "neutro"}>{tiktok.cuenta ? `TikTok: ${tiktok.cuenta}` : "TikTok sin conectar"}</Insignia> : null}>
        {tiktok ? (
          <div className="mb-3">
            <EstadoCuenta c={tiktok} />
          </div>
        ) : null}
        {clips.data?.length === 0 ? <Vacio icono={Clapperboard} texto="Aquí aparecen los clips que cortes." /> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {pgCl.visibles.map((c) => (
            <div key={c.id} className="rounded-xl border border-borde p-2">
              <button type="button" className="block w-full" onClick={() => setVer(c)}>
                {c.miniatura ? <img src={c.miniatura} alt="" className="aspect-video w-full rounded-lg bg-fondo object-cover" /> : <div className="flex aspect-video items-center justify-center rounded-lg bg-fondo text-tenue">Video</div>}
              </button>
              <p className="mt-1 truncate text-xs font-medium">{c.nombre}</p>
              <p className="text-[11px] text-tenue">{fmtBytes(c.tamano)}</p>
              <div className="mt-1 flex flex-wrap gap-1">
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

      {tiktokClip ? <PublicarTikTok clip={tiktokClip} alCerrar={() => setTiktokClip(null)} /> : null}
      {ver ? (
        <Modal abierto titulo={ver.nombre} alCerrar={() => setVer(null)}>
          <video src={`${API_BASE}${ver.url}`} controls autoPlay className="max-h-[60vh] w-full rounded-xl bg-black" />
        </Modal>
      ) : null}
    </div>
  );
}
