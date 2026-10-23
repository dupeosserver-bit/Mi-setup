import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  Clapperboard,
  Copy,
  Download,
  FileVideo,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  ImagePlus,
  Music2,
  Pause,
  Play,
  Plus,
  RotateCw,
  Save,
  Scissors,
  Settings2,
  SkipBack,
  SlidersHorizontal,
  Trash2,
  Type,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePaginado } from "../components/Paginas";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Selector, Vacio, avisar, avisarError, cx } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient } from "../lib/consultas";
import { leerForma, useAcostado, useForma, useModoPagina } from "../lib/marco";
import { guardarBlob } from "../lib/guardar";
import { fmtBytes } from "../lib/formato";

interface Medio {
  id: string;
  nombre: string;
  tipo: "video" | "imagen" | "audio";
  url: string;
  duracion: number;
  ancho: number;
  alto: number;
}
interface Filtros {
  brillo: number;
  contraste: number;
  saturacion: number;
  desenfoque: number;
  grises: number;
  sepia: number;
}
interface Clip {
  id: string;
  medioId: string;
  entrada: number;
  salida: number;
  velocidad: number;
  volumen: number;
  filtros: Filtros;
  ajuste: "cubrir" | "contener";
  voltearH: boolean;
  voltearV: boolean;
  giro: number;
  transicion: number;
  tipoTransicion?: TipoTransicion;
  efecto?: Efecto;
  difuminar?: Zona[];
}
export type TipoTransicion = "fundido" | "deslizar-izq" | "deslizar-der" | "deslizar-arriba" | "zoom" | "barrido" | "negro" | "blanco";
export type Efecto = "ninguno" | "zoom-lento" | "zoom-salida" | "temblor" | "vineta" | "vhs" | "glitch" | "latido";
export interface Zona {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const TRANSICIONES: Record<TipoTransicion, string> = {
  fundido: "Fundido",
  "deslizar-izq": "Deslizar a la izquierda",
  "deslizar-der": "Deslizar a la derecha",
  "deslizar-arriba": "Deslizar hacia arriba",
  zoom: "Zoom",
  barrido: "Barrido",
  negro: "Pasar por negro",
  blanco: "Destello blanco",
};
export const EFECTOS: Record<Efecto, string> = {
  ninguno: "Ninguno",
  "zoom-lento": "Acercar lento (Ken Burns)",
  "zoom-salida": "Alejar lento",
  temblor: "Cámara en mano",
  vineta: "Viñeta (bordes oscuros)",
  vhs: "VHS / retro",
  glitch: "Glitch",
  latido: "Latido (al ritmo)",
};
export const CALIDADES = {
  "480": { texto: "480p (ligero)", lado: 480, bits: 2_500_000 },
  "720": { texto: "720p HD", lado: 720, bits: 5_000_000 },
  "1080": { texto: "1080p Full HD", lado: 1080, bits: 10_000_000 },
  "1440": { texto: "1440p 2K", lado: 1440, bits: 16_000_000 },
  "2160": { texto: "2160p 4K", lado: 2160, bits: 35_000_000 },
} as const;
export type Calidad = keyof typeof CALIDADES;

export function pasoTransicion(tipo: TipoTransicion, k: number): { alfa: number; dx: number; dy: number; escala: number; recorte: number; velo: { color: string; alfa: number } | null } {
  const base = { alfa: 1, dx: 0, dy: 0, escala: 1, recorte: 1, velo: null as { color: string; alfa: number } | null };
  const suave = k * k * (3 - 2 * k);
  switch (tipo) {
    case "fundido":
      return { ...base, alfa: k };
    case "deslizar-izq":
      return { ...base, dx: 1 - suave };
    case "deslizar-der":
      return { ...base, dx: -(1 - suave) };
    case "deslizar-arriba":
      return { ...base, dy: 1 - suave };
    case "zoom":
      return { ...base, alfa: k, escala: 1.35 - 0.35 * suave };
    case "barrido":
      return { ...base, recorte: suave };
    case "negro":
    case "blanco":
      return { ...base, alfa: k < 0.5 ? 0 : 1, velo: { color: tipo === "negro" ? "#000" : "#fff", alfa: 1 - Math.abs(2 * k - 1) } };
  }
}
interface ClipAudio {
  id: string;
  medioId: string;
  inicio: number;
  entrada: number;
  salida: number;
  volumen: number;
}
interface TextoVideo {
  id: string;
  texto: string;
  inicio: number;
  duracion: number;
  x: number;
  y: number;
  tam: number;
  color: string;
  fondo: boolean;
  negrita: boolean;
}
type Seleccion = { tipo: "clip" | "audio" | "texto"; id: string } | null;

const FILTROS_0: Filtros = { brillo: 1, contraste: 1, saturacion: 1, desenfoque: 0, grises: 0, sepia: 0 };
const PRESETS: [string, Filtros][] = [
  ["Normal", FILTROS_0],
  ["Blanco y negro", { ...FILTROS_0, grises: 1 }],
  ["Sepia", { ...FILTROS_0, sepia: 0.9 }],
  ["Vívido", { ...FILTROS_0, saturacion: 1.5, contraste: 1.1 }],
  ["Cálido", { ...FILTROS_0, sepia: 0.25, saturacion: 1.2, brillo: 1.05 }],
  ["Frío", { ...FILTROS_0, saturacion: 0.85, brillo: 1.03, contraste: 1.05 }],
  ["Apagado", { ...FILTROS_0, saturacion: 0.6, contraste: 0.92 }],
];
const FORMATOS = { "16:9": [16, 9], "9:16": [9, 16], "1:1": [1, 1], "4:5": [4, 5] } as const;
type Formato = keyof typeof FORMATOS;
const id = () => crypto.randomUUID();
const dur = (c: Clip) => Math.max(0.1, (c.salida - c.entrada) / c.velocidad);
const mmss = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
const filtroCss = (f: Filtros) => `brightness(${f.brillo}) contrast(${f.contraste}) saturate(${f.saturacion}) grayscale(${f.grises}) sepia(${f.sepia})${f.desenfoque ? ` blur(${f.desenfoque}px)` : ""}`;

function efectoEncima(g: CanvasRenderingContext2D, efecto: Efecto, t: number, W: number, H: number) {
  if (efecto === "vineta") {
    const r = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    r.addColorStop(0, "rgba(0,0,0,0)");
    r.addColorStop(1, "rgba(0,0,0,0.7)");
    g.fillStyle = r;
    g.fillRect(0, 0, W, H);
  } else if (efecto === "vhs") {
    g.save();
    g.globalAlpha = 0.12;
    g.fillStyle = "#000";
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
    g.globalAlpha = 0.08;
    g.fillStyle = "#ff0040";
    g.fillRect(0, ((t * 120) % (H + 40)) - 40, W, 30);
    g.restore();
  } else if (efecto === "glitch") {
    const fase = Math.floor(t * 8);
    if (fase % 4 === 0) {
      for (let i = 0; i < 6; i++) {
        const y = ((fase * 97 + i * 211) % 100) / 100 * H;
        const alto = H * 0.03;
        const corrimiento = (((fase + i) % 2 ? 1 : -1) * W) / 40;
        g.drawImage(g.canvas, 0, y, W, alto, corrimiento, y, W, alto);
      }
    }
  }
}

export function difuminarZona(g: CanvasRenderingContext2D, c: HTMLCanvasElement, z: Zona, W: number, H: number) {
  const x = z.x * W;
  const y = z.y * H;
  const w = Math.max(2, z.w * W);
  const h = Math.max(2, z.h * H);
  const m = Math.max(8, Math.min(w, h) * 0.35);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.filter = `blur(${Math.round(Math.max(6, Math.min(w, h) / 6))}px)`;
  g.drawImage(c, Math.max(0, x - m), Math.max(0, y - m), Math.min(W, w + 2 * m), Math.min(H, h + 2 * m), x, y, w, h);
  g.drawImage(c, x, y, w, h, x, y, w, h);
  g.restore();
}

function medirMedio(archivo: File): Promise<Medio> {
  const url = URL.createObjectURL(archivo);
  const tipo = archivo.type.startsWith("video/") ? "video" : archivo.type.startsWith("audio/") ? "audio" : "imagen";
  const base = { id: id(), nombre: archivo.name.replace(/\.[^.]+$/, ""), tipo, url } as const;
  return new Promise((ok, mal) => {
    if (tipo === "imagen") {
      const i = new Image();
      i.onload = () => ok({ ...base, duracion: 5, ancho: i.naturalWidth, alto: i.naturalHeight });
      i.onerror = () => mal(new Error(`No se pudo leer ${archivo.name}`));
      i.src = url;
      return;
    }
    const el = document.createElement(tipo === "video" ? "video" : "audio");
    el.preload = "metadata";
    const listo = () => ok({ ...base, duracion: Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 10, ancho: tipo === "video" ? (el as HTMLVideoElement).videoWidth : 0, alto: tipo === "video" ? (el as HTMLVideoElement).videoHeight : 0 });
    el.onloadedmetadata = () => {
      if (el.duration === Infinity) {
        el.onseeked = () => {
          el.onseeked = null;
          el.currentTime = 0;
          listo();
        };
        el.currentTime = 1e7;
      } else listo();
    };
    el.onerror = () => mal(new Error(`No se pudo leer ${archivo.name} (¿formato no compatible?)`));
    el.src = url;
  });
}

const CANDIDATOS = ["video/mp4;codecs=avc1.640028,mp4a.40.2", "video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

async function elegirMime(audio: MediaStreamTrack[]): Promise<string> {
  if (typeof MediaRecorder === "undefined") throw new Error("Este navegador no puede grabar video");
  for (const mime of CANDIDATOS) {
    if (!MediaRecorder.isTypeSupported(mime)) continue;
    try {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 64;
      const g = c.getContext("2d")!;
      const flujo = c.captureStream(30);
      audio.forEach((t) => flujo.addTrack(t));
      const rec = new MediaRecorder(flujo, { mimeType: mime });
      let bytes = 0;
      let fallo = false;
      rec.ondataavailable = (e) => (bytes += e.data.size);
      rec.onerror = () => (fallo = true);
      const parado = new Promise<void>((ok) => (rec.onstop = () => ok()));
      rec.start();
      for (let i = 0; i < 9; i++) {
        g.fillStyle = i % 2 ? "#444" : "#bbb";
        g.fillRect(0, 0, 64, 64);
        await new Promise((r) => setTimeout(r, 35));
      }
      if (rec.state !== "inactive") rec.stop();
      await Promise.race([parado, new Promise((r) => setTimeout(r, 1500))]);
      if (!fallo && bytes > 0) return mime;
    } catch {
      continue;
    }
  }
  return "video/webm";
}

type Herramienta = "archivos" | "editar" | "texto" | "proyecto";
const HERRAMIENTAS_VIDEO: { id: Herramienta; texto: string; icono: LucideIcon }[] = [
  { id: "archivos", texto: "Archivos", icono: FolderOpen },
  { id: "editar", texto: "Editar", icono: SlidersHorizontal },
  { id: "texto", texto: "Texto", icono: Type },
  { id: "proyecto", texto: "Proyecto", icono: Settings2 },
];

const FORMATOS_INICIO: { id: Formato; titulo: string; detalle: string }[] = [
  { id: "16:9", titulo: "Para YouTube", detalle: "Horizontal 16:9" },
  { id: "9:16", titulo: "Para TikTok y Reels", detalle: "Vertical 9:16" },
  { id: "1:1", titulo: "Para Instagram", detalle: "Cuadrado 1:1" },
  { id: "4:5", titulo: "Retrato", detalle: "4:5" },
];

interface VideoGuardado {
  id: string;
  nombre: string;
  tamano: number;
  miniatura: string;
  actualizado: string;
  url: string;
}

function Inicio({ clipsCount, duracion, nombre, alSeguir, alNuevo }: { clipsCount: number; duracion: number; nombre: string; alSeguir: () => void; alNuevo: (f: Formato) => void }) {
  const q = useQuery({ queryKey: ["estudio", "video"], queryFn: () => api<VideoGuardado[]>("/api/estudio/proyectos?tipo=video") });
  const [viendo, setViendo] = useState<VideoGuardado | null>(null);
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/api/estudio/proyectos/${id}`, { metodo: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["estudio", "video"] }),
    onError: avisarError,
  });
  const pagina = usePaginado(q.data, 6);
  return (
    <div className="space-y-5">
      <Encabezado
        titulo="Editor de video"
        descripcion="Cortes, velocidad, filtros, textos, música y formato vertical. Tus archivos se quedan en tu dispositivo."
        acciones={
          <Boton variante="primario" icono={Plus} onClick={() => alNuevo("16:9")}>
            Nuevo proyecto
          </Boton>
        }
      />
      {clipsCount ? (
        <button type="button" onClick={alSeguir} className="flex w-full min-w-0 items-center gap-4 rounded-tarjeta border border-[color-mix(in_srgb,var(--acento)_45%,transparent)] bg-[color-mix(in_srgb,var(--acento)_10%,transparent)] p-4 text-left">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-acento text-black">
            <Play className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block truncate">{`Seguir editando «${nombre}»`}</b>
            <small className="text-xs text-tenue">
              {clipsCount === 1 ? "1 clip" : `${clipsCount} clips`} · {mmss(duracion)}
            </small>
          </span>
        </button>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Empieza con un formato</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {FORMATOS_INICIO.map((f) => {
            const [a, b] = FORMATOS[f.id];
            return (
              <button key={f.id} type="button" onClick={() => alNuevo(f.id)} className="group flex min-w-0 flex-col items-center gap-3 rounded-tarjeta border border-borde bg-superficie p-4 text-center hover:border-acento">
                <span className="grid h-20 w-full place-items-center">
                  <span className="block rounded-lg border-2 border-[color-mix(in_srgb,var(--acento)_60%,transparent)] bg-[color-mix(in_srgb,var(--acento)_12%,transparent)] group-hover:border-acento" style={{ height: a >= b ? `${(b / a) * 4.5}rem` : "4.5rem", width: a >= b ? "4.5rem" : `${(a / b) * 4.5}rem` }} />
                </span>
                <span className="min-w-0">
                  <b className="block truncate text-sm">{f.titulo}</b>
                  <small className="text-xs text-tenue">{f.detalle}</small>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Clapperboard className="h-4 w-4 text-tenue" />
          Tus videos guardados
        </h2>
        <ErrorCaja error={q.error} />
        {q.isLoading ? <Cargando /> : null}
        {q.data && !q.data.length ? <Vacio icono={Clapperboard} texto="Cuando exportes un video y toques «Guardar en mi cuenta», aparece aquí." /> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {pagina.visibles.map((v) => (
            <article key={v.id} className="min-w-0 overflow-hidden rounded-tarjeta border border-borde bg-superficie">
              <button type="button" onClick={() => setViendo(v)} className="relative block aspect-video w-full bg-black" aria-label={`Ver ${v.nombre}`}>
                {v.miniatura ? <img src={v.miniatura} alt="" className="h-full w-full object-cover" /> : null}
                <span className="absolute inset-0 grid place-items-center">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-black/60 text-white">
                    <Play className="h-5 w-5" />
                  </span>
                </span>
              </button>
              <div className="flex items-center gap-2 p-3">
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{v.nombre}</b>
                  <small className="text-xs text-tenue">
                    {fmtBytes(v.tamano)} · {new Date(v.actualizado).toLocaleDateString()}
                  </small>
                </span>
                <a href={`${API_BASE}${v.url}`} download className="grid h-9 w-9 place-items-center rounded-xl text-tenue hover:bg-tarjeta hover:text-texto" aria-label="Descargar">
                  <Download className="h-4 w-4" />
                </a>
                <Boton
                  tamano="icono"
                  variante="fantasma"
                  icono={Trash2}
                  aria-label="Borrar"
                  onClick={async () => {
                    if (await confirmar({ titulo: "Borrar video", mensaje: v.nombre })) borrar.mutate(v.id);
                  }}
                />
              </div>
            </article>
          ))}
        </div>
        {pagina.paginas}
      </section>
      {viendo ? (
        <Modal abierto titulo={viendo.nombre} alCerrar={() => setViendo(null)}>
          <video src={`${API_BASE}${viendo.url}`} controls autoPlay playsInline className="max-h-[60vh] w-full rounded-xl bg-black" />
        </Modal>
      ) : null}
    </div>
  );
}

export default function EditorVideo() {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const elementos = useRef(new Map<string, HTMLVideoElement | HTMLAudioElement>());
  const imagenes = useRef(new Map<string, HTMLImageElement>());
  const audioCtx = useRef<AudioContext | null>(null);
  const destinoExport = useRef<MediaStreamAudioDestinationNode | null>(null);
  const ganancias = useRef(new Map<HTMLMediaElement, GainNode>());
  const tiempoRef = useRef(0);
  const bucle = useRef<{ activo: boolean; cancelar: boolean }>({ activo: false, cancelar: false });
  const entradaArchivos = useRef<HTMLInputElement>(null);

  const [medios, setMedios] = useState<Medio[]>([]);
  const [clips, setClips] = useState<Clip[]>([]);
  const [audios, setAudios] = useState<ClipAudio[]>([]);
  const [textos, setTextos] = useState<TextoVideo[]>([]);
  const [formato, setFormato] = useState<Formato>("16:9");
  const [calidad, setCalidad] = useState<Calidad>("720");
  const [fps, setFps] = useState<24 | 30 | 60>(30);
  const [zonaModo, setZonaModo] = useState(false);
  const [permisoMarca, setPermisoMarca] = useState(false);
  const zonaInicio = useRef<{ x: number; y: number } | null>(null);
  const [zonaTemporal, setZonaTemporal] = useState<Zona | null>(null);
  const [fundidos, setFundidos] = useState({ entrada: false, salida: false });
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [tiempo, setTiempoEstado] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [pps, setPps] = useState(48);
  const [exportando, setExportando] = useState<number | null>(null);
  const [resultado, setResultado] = useState<{ url: string; blob: Blob; ext: string; miniatura: string } | null>(null);
  const [nombreVideo, setNombreVideo] = useState("Mi video");
  const [abierto, setAbierto] = useState(false);
  const anchoGrande = useForma() === "pc";
  const acostado = useAcostado();
  const [herramienta, setHerramienta] = useState<Herramienta | null>(() => (leerForma() === "pc" ? "archivos" : null));
  useModoPagina("completa", abierto);
  useEffect(() => {
    if (seleccion) setHerramienta("editar");
  }, [seleccion]);
  const [guardando, setGuardando] = useState(false);

  const [W, H] = useMemo(() => {
    const [a, b] = FORMATOS[formato];
    const lado = CALIDADES[calidad].lado;
    return a >= b ? [Math.round((lado * a) / b / 2) * 2, lado] : [lado, Math.round((lado * b) / a / 2) * 2];
  }, [formato, calidad]);

  const linea = useMemo(() => {
    let fin = 0;
    return clips.map((c, i) => {
      const solape = i === 0 ? 0 : Math.min(c.transicion, dur(c) - 0.05, dur(clips[i - 1]!) - 0.05);
      const inicio = Math.max(0, fin - Math.max(0, solape));
      fin = inicio + dur(c);
      return { clip: c, inicio, fin, solape: Math.max(0, solape) };
    });
  }, [clips]);
  const total = useMemo(
    () =>
      Math.max(
        0.1,
        linea.at(-1)?.fin ?? 0,
        ...audios.map((a) => a.inicio + (a.salida - a.entrada)),
        ...textos.map((t) => t.inicio + t.duracion),
      ),
    [linea, audios, textos],
  );
  const medioDe = useCallback((mid: string) => medios.find((m) => m.id === mid), [medios]);

  const contexto = () => {
    if (!audioCtx.current) {
      audioCtx.current = new AudioContext();
      destinoExport.current = audioCtx.current.createMediaStreamDestination();
    }
    void audioCtx.current.resume();
    return audioCtx.current;
  };
  const elementoDe = (clave: string, m: Medio): HTMLVideoElement | HTMLAudioElement => {
    let el = elementos.current.get(clave);
    if (!el) {
      el = document.createElement(m.tipo === "video" ? "video" : "audio");
      el.src = m.url;
      el.preload = "auto";
      if (el instanceof HTMLVideoElement) el.playsInline = true;
      const ctx = contexto();
      const fuente = ctx.createMediaElementSource(el);
      const g = ctx.createGain();
      fuente.connect(g);
      g.connect(ctx.destination);
      g.connect(destinoExport.current!);
      ganancias.current.set(el, g);
      elementos.current.set(clave, el);
    }
    return el;
  };
  const imagenDe = (m: Medio): HTMLImageElement => {
    let i = imagenes.current.get(m.id);
    if (!i) {
      i = new Image();
      i.src = m.url;
      imagenes.current.set(m.id, i);
    }
    return i;
  };

  const sincronizar = useCallback(
    (t: number, sonando: boolean) => {
      for (const p of linea) {
        const m = medioDe(p.clip.medioId);
        if (!m || m.tipo !== "video") continue;
        const el = elementoDe(`c:${p.clip.id}`, m) as HTMLVideoElement;
        const activo = t >= p.inicio && t < p.fin;
        const esperado = p.clip.entrada + (t - p.inicio) * p.clip.velocidad;
        ganancias.current.get(el)!.gain.value = p.clip.volumen;
        if (activo) {
          el.playbackRate = p.clip.velocidad;
          if (sonando) {
            if (Math.abs(el.currentTime - esperado) > 0.3) el.currentTime = esperado;
            if (el.paused) void el.play().catch(() => undefined);
          } else {
            el.pause();
            if (Math.abs(el.currentTime - esperado) > 0.04) el.currentTime = esperado;
          }
        } else if (!el.paused) el.pause();
      }
      for (const a of audios) {
        const m = medioDe(a.medioId);
        if (!m) continue;
        const el = elementoDe(`a:${a.id}`, m);
        const largo = a.salida - a.entrada;
        const activo = t >= a.inicio && t < a.inicio + largo;
        ganancias.current.get(el)!.gain.value = a.volumen;
        if (activo && sonando) {
          const esperado = a.entrada + (t - a.inicio);
          if (Math.abs(el.currentTime - esperado) > 0.3) el.currentTime = esperado;
          if (el.paused) void el.play().catch(() => undefined);
        } else {
          if (!el.paused) el.pause();
          if (activo && !sonando) el.currentTime = a.entrada + (t - a.inicio);
        }
      }
    },
    [linea, audios, medioDe],
  );

  const pintar = useCallback(
    (t: number) => {
      const c = lienzo.current;
      if (!c) return;
      const g = c.getContext("2d")!;
      g.globalAlpha = 1;
      g.filter = "none";
      g.fillStyle = "#000";
      g.fillRect(0, 0, W, H);
      for (const p of linea) {
        if (t < p.inicio || t >= p.fin) continue;
        const m = medioDe(p.clip.medioId);
        if (!m) continue;
        const fuente = m.tipo === "video" ? elementos.current.get(`c:${p.clip.id}`) : imagenDe(m);
        if (!fuente) continue;
        const k = p.solape > 0 && t < p.inicio + p.solape ? (t - p.inicio) / p.solape : 1;
        const tr = pasoTransicion(p.clip.tipoTransicion ?? "fundido", k);
        const rotado = p.clip.giro % 180 !== 0;
        const sw = rotado ? m.alto : m.ancho;
        const sh = rotado ? m.ancho : m.alto;
        if (!sw || !sh) continue;
        const escala = p.clip.ajuste === "cubrir" ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh);
        const avance = Math.min(1, Math.max(0, (t - p.inicio) / Math.max(0.1, p.fin - p.inicio)));
        const efecto = p.clip.efecto ?? "ninguno";
        let zoomEfecto = efecto === "zoom-lento" ? 1 + 0.15 * avance : efecto === "zoom-salida" ? 1.15 - 0.15 * avance : efecto === "latido" ? 1 + 0.03 * Math.max(0, Math.sin(t * Math.PI * 4)) : 1;
        let mx = 0;
        let my = 0;
        if (efecto === "temblor") {
          mx = Math.sin(t * 7.3) * W * 0.006 + Math.sin(t * 13.1) * W * 0.003;
          my = Math.cos(t * 6.1) * H * 0.006;
          zoomEfecto = 1.03;
        }
        g.save();
        if (tr.recorte < 1) {
          g.beginPath();
          g.rect(0, 0, W * tr.recorte, H);
          g.clip();
        }
        g.globalAlpha = tr.alfa;
        g.filter = filtroCss(p.clip.filtros) + (efecto === "vhs" ? " saturate(1.3) contrast(1.1)" : "");
        g.translate(W / 2 + tr.dx * W + mx, H / 2 + tr.dy * H + my);
        g.scale(tr.escala * zoomEfecto, tr.escala * zoomEfecto);
        g.rotate((p.clip.giro * Math.PI) / 180);
        g.scale(p.clip.voltearH ? -1 : 1, p.clip.voltearV ? -1 : 1);
        g.drawImage(fuente as CanvasImageSource, (-m.ancho * escala) / 2, (-m.alto * escala) / 2, m.ancho * escala, m.alto * escala);
        g.restore();
        efectoEncima(g, efecto, t, W, H);
        for (const z of p.clip.difuminar ?? []) difuminarZona(g, c, z, W, H);
        if (tr.velo && tr.velo.alfa > 0) {
          g.save();
          g.globalAlpha = tr.velo.alfa;
          g.fillStyle = tr.velo.color;
          g.fillRect(0, 0, W, H);
          g.restore();
        }
      }
      g.filter = "none";
      g.globalAlpha = 1;
      for (const tx of textos) {
        if (t < tx.inicio || t >= tx.inicio + tx.duracion) continue;
        const aparece = Math.min(1, (t - tx.inicio) / 0.3, (tx.inicio + tx.duracion - t) / 0.3);
        g.save();
        g.globalAlpha = Math.max(0, aparece);
        const px = (tx.tam / 100) * H;
        g.font = `${tx.negrita ? "700" : "400"} ${px}px Inter, system-ui, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        const lineas = tx.texto.split("\n");
        lineas.forEach((l, i) => {
          const y = tx.y * H + (i - (lineas.length - 1) / 2) * px * 1.2;
          if (tx.fondo) {
            const w = g.measureText(l).width;
            g.fillStyle = "rgba(0,0,0,0.55)";
            g.fillRect(tx.x * W - w / 2 - px * 0.3, y - px * 0.6, w + px * 0.6, px * 1.2);
          }
          g.lineWidth = Math.max(2, px / 10);
          g.strokeStyle = "rgba(0,0,0,0.6)";
          if (!tx.fondo) g.strokeText(l, tx.x * W, y);
          g.fillStyle = tx.color;
          g.fillText(l, tx.x * W, y);
        });
        g.restore();
      }
      const final = linea.at(-1)?.fin ?? total;
      const oscuro = fundidos.entrada && t < 0.6 ? 1 - t / 0.6 : fundidos.salida && t > final - 0.6 ? 1 - (final - t) / 0.6 : 0;
      if (oscuro > 0) {
        g.fillStyle = `rgba(0,0,0,${Math.min(1, oscuro)})`;
        g.fillRect(0, 0, W, H);
      }
    },
    [linea, textos, medios, W, H, fundidos, total],
  );

  const verInstante = useCallback(
    async (t: number) => {
      sincronizar(t, false);
      const pendientes: Promise<void>[] = [];
      for (const p of linea) {
        if (t < p.inicio || t >= p.fin) continue;
        const m = medioDe(p.clip.medioId);
        if (m?.tipo !== "video") continue;
        const el = elementos.current.get(`c:${p.clip.id}`) as HTMLVideoElement | undefined;
        if (el && (el.seeking || el.readyState < 2)) {
          pendientes.push(new Promise((ok) => {
            const listo = () => ok();
            el.addEventListener("seeked", listo, { once: true });
            el.addEventListener("loadeddata", listo, { once: true });
            setTimeout(ok, 800);
          }));
        }
      }
      if (pendientes.length) await Promise.all(pendientes);
      pintar(t);
    },
    [sincronizar, pintar, linea, medioDe],
  );

  useEffect(() => {
    if (!bucle.current.activo) void verInstante(tiempoRef.current);
  }, [verInstante, W, H]);

  const irA = (t: number) => {
    const limpio = Math.max(0, Math.min(total, t));
    tiempoRef.current = limpio;
    setTiempoEstado(limpio);
    if (!bucle.current.activo) void verInstante(limpio);
  };

  const reproducir = (desde: number, hasta: number, alAvanzar?: (t: number) => void): Promise<void> =>
    new Promise((fin) => {
      bucle.current = { activo: true, cancelar: false };
      contexto();
      const arranque = performance.now() - desde * 1000;
      let ultimoEstado = 0;
      const paso = () => {
        const t = (performance.now() - arranque) / 1000;
        if (bucle.current.cancelar || t >= hasta) {
          bucle.current.activo = false;
          sincronizar(Math.min(t, hasta), false);
          tiempoRef.current = Math.min(hasta, t);
          setTiempoEstado(tiempoRef.current);
          fin();
          return;
        }
        tiempoRef.current = t;
        sincronizar(t, true);
        pintar(t);
        alAvanzar?.(t);
        const ahora = performance.now();
        if (ahora - ultimoEstado > 100) {
          ultimoEstado = ahora;
          setTiempoEstado(t);
        }
        requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    });

  const alternarReproduccion = async () => {
    if (bucle.current.activo) {
      bucle.current.cancelar = true;
      return;
    }
    setReproduciendo(true);
    const desde = tiempoRef.current >= total - 0.05 ? 0 : tiempoRef.current;
    await reproducir(desde, total);
    setReproduciendo(false);
  };
  useEffect(
    () => () => {
      bucle.current.cancelar = true;
      for (const el of elementos.current.values()) el.pause();
    },
    [],
  );

  const agregarArchivos = async (archivos: FileList | File[]) => {
    contexto();
    for (const a of archivos) {
      try {
        const m = await medirMedio(a);
        setMedios((l) => [...l, m]);
        if (m.tipo !== "audio") agregarAlVideo(m);
        else agregarMusica(m);
      } catch (err) {
        avisarError(err);
      }
    }
  };
  const nuevoClip = (m: Medio): Clip => ({ id: id(), medioId: m.id, entrada: 0, salida: m.duracion, velocidad: 1, volumen: 1, filtros: { ...FILTROS_0 }, ajuste: "cubrir", voltearH: false, voltearV: false, giro: 0, transicion: 0 });
  const agregarAlVideo = (m: Medio) => {
    if (m.tipo === "audio") return;
    const c = nuevoClip(m);
    setClips((l) => [...l, c]);
    setSeleccion({ tipo: "clip", id: c.id });
  };
  const agregarMusica = (m: Medio) => {
    const a: ClipAudio = { id: id(), medioId: m.id, inicio: 0, entrada: 0, salida: m.duracion, volumen: 0.8 };
    setAudios((l) => [...l, a]);
    setSeleccion({ tipo: "audio", id: a.id });
  };
  const quitarMedio = (m: Medio) => {
    setClips((l) => l.filter((c) => c.medioId !== m.id));
    setAudios((l) => l.filter((a) => a.medioId !== m.id));
    setMedios((l) => l.filter((x) => x.id !== m.id));
    URL.revokeObjectURL(m.url);
  };

  const cambiarClip = (cid: string, p: Partial<Clip>) => setClips((l) => l.map((c) => (c.id === cid ? { ...c, ...p } : c)));
  const cambiarAudio = (aid: string, p: Partial<ClipAudio>) => setAudios((l) => l.map((a) => (a.id === aid ? { ...a, ...p } : a)));
  const cambiarTexto = (tid: string, p: Partial<TextoVideo>) => setTextos((l) => l.map((t) => (t.id === tid ? { ...t, ...p } : t)));
  const dividir = () => {
    const p = linea.find((x) => tiempoRef.current > x.inicio + 0.1 && tiempoRef.current < x.fin - 0.1);
    if (!p) return avisarError(new Error("Pon la línea roja sobre un clip de video para dividirlo"));
    const corte = p.clip.entrada + (tiempoRef.current - p.inicio) * p.clip.velocidad;
    const segundo: Clip = { ...p.clip, id: id(), entrada: corte, transicion: 0, filtros: { ...p.clip.filtros } };
    setClips((l) => l.flatMap((c) => (c.id === p.clip.id ? [{ ...c, salida: corte }, segundo] : [c])));
  };
  const duplicar = (c: Clip) => setClips((l) => l.flatMap((x) => (x.id === c.id ? [x, { ...c, id: id(), transicion: 0, filtros: { ...c.filtros } }] : [x])));
  const mover = (cid: string, d: -1 | 1) =>
    setClips((l) => {
      const i = l.findIndex((c) => c.id === cid);
      const j = i + d;
      if (i < 0 || j < 0 || j >= l.length) return l;
      const n = [...l];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  const agregarTexto = () => {
    const t: TextoVideo = { id: id(), texto: "Tu texto aquí", inicio: Math.min(tiempoRef.current, Math.max(0, total - 0.5)), duracion: 3, x: 0.5, y: 0.82, tam: 7, color: "#ffffff", fondo: false, negrita: true };
    setTextos((l) => [...l, t]);
    setSeleccion({ tipo: "texto", id: t.id });
  };
  const borrarSeleccion = () => {
    if (!seleccion) return;
    if (seleccion.tipo === "clip") setClips((l) => l.filter((c) => c.id !== seleccion.id));
    if (seleccion.tipo === "audio") setAudios((l) => l.filter((a) => a.id !== seleccion.id));
    if (seleccion.tipo === "texto") setTextos((l) => l.filter((t) => t.id !== seleccion.id));
    setSeleccion(null);
  };
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) return;
      if (e.key === " ") {
        e.preventDefault();
        void alternarReproduccion();
      } else if (e.key === "Delete") borrarSeleccion();
      else if (e.key.toLowerCase() === "s") dividir();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  });

  const arrastrar = (e: React.PointerEvent, inicial: number, poner: (nuevo: number) => void) => {
    const x0 = e.clientX;
    const mover = (ev: PointerEvent) => poner(Math.max(0, inicial + (ev.clientX - x0) / pps));
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  const exportar = async () => {
    if (!clips.length) return avisarError(new Error("Agrega al menos un video o foto"));
    bucle.current.cancelar = true;
    const ctx = contexto();
    await ctx.resume();
    setExportando(0);
    const mime = await elegirMime(destinoExport.current!.stream.getAudioTracks());
    const flujo = lienzo.current!.captureStream(fps);
    destinoExport.current!.stream.getAudioTracks().forEach((t) => flujo.addTrack(t));
    const trozos: Blob[] = [];
    const bits = Math.round(CALIDADES[calidad].bits * (fps === 60 ? 1.5 : fps === 24 ? 0.85 : 1));
    const rec = new MediaRecorder(flujo, { mimeType: mime, videoBitsPerSecond: bits, audioBitsPerSecond: 192_000 });
    rec.ondataavailable = (e) => e.data.size && trozos.push(e.data);
    const detenido = new Promise<void>((ok) => (rec.onstop = () => ok()));
    tiempoRef.current = 0;
    await verInstante(0);
    rec.start(500);
    await reproducir(0, total, (t) => setExportando(Math.min(99, Math.round((t / total) * 100))));
    await new Promise((r) => setTimeout(r, 250));
    rec.stop();
    await detenido;
    const tipo = mime.split(";")[0]!;
    const blob = new Blob(trozos, { type: tipo });
    const mini = document.createElement("canvas");
    mini.width = 180;
    mini.height = Math.round((180 * H) / W);
    mini.getContext("2d")!.drawImage(lienzo.current!, 0, 0, mini.width, mini.height);
    setExportando(null);
    setResultado({ url: URL.createObjectURL(blob), blob, ext: tipo.includes("mp4") ? "mp4" : "webm", miniatura: mini.toDataURL("image/jpeg", 0.6) });
    tiempoRef.current = 0;
    setTiempoEstado(0);
    void verInstante(0);
  };
  const guardarEnCuenta = async () => {
    if (!resultado) return;
    if (resultado.blob.size > 100 * 1024 * 1024) return avisarError(new Error("Pesa más de 100 MB: descárgalo en vez de guardarlo en tu cuenta"));
    setGuardando(true);
    try {
      const datos = new FormData();
      datos.append("tipo", "video");
      datos.append("nombre", nombreVideo.trim() || "Mi video");
      datos.append("miniatura", resultado.miniatura);
      datos.append("archivo", resultado.blob, `video.${resultado.ext}`);
      await api("/api/estudio/proyectos", { formulario: datos });
      void queryClient.invalidateQueries({ queryKey: ["estudio", "video"] });
      avisar("Video guardado en tu cuenta");
    } catch (err) {
      avisarError(err);
    } finally {
      setGuardando(false);
    }
  };
  const descargarVideo = () => {
    if (!resultado) return;
    void guardarBlob(resultado.blob, `${nombreVideo.replace(/[^\w.-]+/g, "_") || "video"}.${resultado.ext}`).catch(avisarError);
  };

  const selClip = seleccion?.tipo === "clip" ? clips.find((c) => c.id === seleccion.id) : undefined;
  const selAudio = seleccion?.tipo === "audio" ? audios.find((a) => a.id === seleccion.id) : undefined;
  const selTexto = seleccion?.tipo === "texto" ? textos.find((t) => t.id === seleccion.id) : undefined;
  const mClip = selClip ? medioDe(selClip.medioId) : undefined;
  const ancho = Math.max(total * pps + 80, 400);
  const colorDe = (i: number) => ["#2563eb", "#7c3aed", "#0d9488", "#c2410c", "#be185d"][i % 5]!;

  if (!abierto) {
    return (
      <Inicio
        clipsCount={clips.length}
        duracion={total}
        nombre={nombreVideo}
        alSeguir={() => setAbierto(true)}
        alNuevo={(f) => {
          setFormato(f);
          setAbierto(true);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-fondo" style={{ height: "var(--alto-app, 100dvh)" }}>
      <header className="flex items-center gap-2 border-b border-borde px-3 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <Boton tamano="icono" variante="fantasma" icono={ChevronLeft} aria-label="Volver a mis proyectos" onClick={() => setAbierto(false)} />
        <Entrada className="h-9 max-w-[14rem] min-w-0" value={nombreVideo} onChange={(e) => setNombreVideo(e.target.value)} maxLength={80} aria-label="Nombre del video" />
        <span className="hidden text-xs text-tenue md:inline">
          {formato} · {CALIDADES[calidad].texto} · {fps} fps
        </span>
        <span className="flex-1" />
        <input ref={entradaArchivos} type="file" multiple accept="video/*,image/*,audio/*" className="hidden" onChange={(e) => { if (e.target.files) void agregarArchivos(e.target.files); e.target.value = ""; }} />
        <Boton tamano="sm" icono={Upload} onClick={() => entradaArchivos.current?.click()}>
          <span className="hidden sm:inline">Agregar archivos</span>
        </Boton>
        <Boton tamano="sm" variante="primario" icono={FileVideo} cargando={exportando !== null} disabled={!clips.length} onClick={() => void exportar()}>
          {exportando !== null ? `Exportando ${exportando}%` : "Exportar"}
        </Boton>
      </header>
      <div className={cx("flex min-h-0 flex-1", acostado ? "flex-row" : "flex-col lg:flex-row")}>
        <nav className={cx("flex shrink-0 bg-superficie p-1", acostado ? "order-first w-[4.5rem] flex-col gap-1 overflow-y-auto border-r border-borde" : "order-last justify-around border-t border-borde lg:order-first lg:w-[4.5rem] lg:flex-col lg:justify-start lg:gap-1 lg:border-r lg:border-t-0")} aria-label="Herramientas">
          {HERRAMIENTAS_VIDEO.map(({ id, texto, icono: Icono }) => (
            <button
              key={id}
              type="button"
              aria-pressed={herramienta === id}
              onClick={() => {
                if (id !== "texto") return setHerramienta(herramienta === id && !anchoGrande ? null : id);
                agregarTexto();
                setHerramienta("editar");
              }}
              className={cx("flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium lg:flex-none", herramienta === id ? "text-acento" : "text-tenue hover:text-texto")}
              style={herramienta === id ? { background: "color-mix(in srgb, var(--acento) 14%, transparent)" } : undefined}
            >
              <Icono className="h-5 w-5" />
              <span className="max-w-full truncate">{texto}</span>
            </button>
          ))}
        </nav>
        {herramienta ? (
          <aside className={cx("shrink-0 overflow-y-auto bg-superficie p-3", acostado ? "order-2 w-72 border-r border-borde" : "order-3 max-h-[38%] border-t border-borde lg:order-2 lg:max-h-none lg:w-80 lg:border-r lg:border-t-0")}>
            {herramienta === "archivos" ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-tenue">{`Archivos (${medios.length})`}</p>
                {medios.length === 0 ? <Vacio icono={ImagePlus} texto="Agrega videos, fotos o música." /> : null}
                <ul className="space-y-1">
                  {medios.map((m) => (
                    <li key={m.id} className="rounded-lg border border-borde p-1.5 text-xs">
                      <p className="truncate font-medium">{m.nombre}</p>
                      <p className="text-tenue">
                        {m.tipo === "video" ? "Video" : m.tipo === "audio" ? "Música" : "Foto"} · {mmss(m.duracion)}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.tipo !== "audio" ? (
                          <Boton tamano="sm" onClick={() => agregarAlVideo(m)}>
                            Al video
                          </Boton>
                        ) : null}
                        {m.tipo !== "imagen" ? (
                          <Boton tamano="sm" variante="fantasma" icono={Music2} onClick={() => agregarMusica(m)}>
                            {m.tipo === "video" ? "Solo audio" : "Música"}
                          </Boton>
                        ) : null}
                        <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label={`Quitar ${m.nombre}`} onClick={() => quitarMedio(m)} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {herramienta === "editar" ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-tenue">{selClip ? "Clip de video" : selAudio ? "Música" : selTexto ? "Texto" : "Propiedades"}</p>
                {!seleccion ? <p className="text-xs text-tenue">Toca un bloque de la línea de tiempo para cambiar su corte, velocidad, volumen, filtros o texto.</p> : null}
                {selClip && mClip ? (
                  <div className="space-y-3 text-xs">
                    <p className="truncate font-medium">{mClip.nombre}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Campo etiqueta={`Desde (s): ${selClip.entrada.toFixed(1)}`}>
                        <input type="range" min={0} max={Math.max(0.2, selClip.salida - 0.1)} step={0.1} value={selClip.entrada} onChange={(e) => cambiarClip(selClip.id, { entrada: Number(e.target.value) })} className="w-full accent-acento" />
                      </Campo>
                      <Campo etiqueta={`Hasta (s): ${selClip.salida.toFixed(1)}`}>
                        <input type="range" min={selClip.entrada + 0.1} max={mClip.tipo === "imagen" ? 60 : mClip.duracion} step={0.1} value={selClip.salida} onChange={(e) => cambiarClip(selClip.id, { salida: Number(e.target.value) })} className="w-full accent-acento" />
                      </Campo>
                    </div>
                    {mClip.tipo === "video" ? (
                      <>
                        <Campo etiqueta="Velocidad">
                          <Selector value={String(selClip.velocidad)} onChange={(e) => cambiarClip(selClip.id, { velocidad: Number(e.target.value) })}>
                            {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map((v) => (
                              <option key={v} value={v}>
                                {v}x
                              </option>
                            ))}
                          </Selector>
                        </Campo>
                        <Campo etiqueta={`Volumen: ${Math.round(selClip.volumen * 100)}%`}>
                          <input type="range" min={0} max={2} step={0.05} value={selClip.volumen} onChange={(e) => cambiarClip(selClip.id, { volumen: Number(e.target.value) })} className="w-full accent-acento" />
                        </Campo>
                      </>
                    ) : null}
                    <Campo etiqueta="Encuadre">
                      <Selector value={selClip.ajuste} onChange={(e) => cambiarClip(selClip.id, { ajuste: e.target.value as Clip["ajuste"] })}>
                        <option value="cubrir">Llenar la pantalla (recorta)</option>
                        <option value="contener">Mostrar completo (bordes negros)</option>
                      </Selector>
                    </Campo>
                    {linea[0]?.clip.id !== selClip.id ? (
                      <Campo etiqueta="Transición con el clip anterior">
                        <div className="grid grid-cols-2 gap-1">
                          <Selector value={String(selClip.transicion)} onChange={(e) => cambiarClip(selClip.id, { transicion: Number(e.target.value) })} aria-label="Duración de la transición">
                            <option value="0">Corte directo</option>
                            <option value="0.5">0.5 s</option>
                            <option value="1">1 s</option>
                            <option value="2">2 s</option>
                          </Selector>
                          <Selector value={selClip.tipoTransicion ?? "fundido"} disabled={!selClip.transicion} onChange={(e) => cambiarClip(selClip.id, { tipoTransicion: e.target.value as TipoTransicion })} aria-label="Tipo de transición">
                            {Object.entries(TRANSICIONES).map(([v, n]) => (
                              <option key={v} value={v}>
                                {n}
                              </option>
                            ))}
                          </Selector>
                        </div>
                      </Campo>
                    ) : null}
                    <Campo etiqueta="Efecto">
                      <Selector value={selClip.efecto ?? "ninguno"} onChange={(e) => cambiarClip(selClip.id, { efecto: e.target.value as Efecto })}>
                        {Object.entries(EFECTOS).map(([v, n]) => (
                          <option key={v} value={v}>
                            {n}
                          </option>
                        ))}
                      </Selector>
                    </Campo>
                    <div className="rounded-xl border border-borde p-2">
                      <p className="mb-1 font-medium">Quitar marca de agua</p>
                      <p className="mb-2 text-tenue">Solo para videos tuyos o con permiso del dueño. Quitar la marca de un video ajeno puede violar sus derechos de autor.</p>
                      <label className="mb-2 flex items-start gap-2">
                        <input type="checkbox" className="mt-0.5 accent-acento" checked={permisoMarca} onChange={(e) => setPermisoMarca(e.target.checked)} />
                        <span>Confirmo que el video es mío o tengo permiso.</span>
                      </label>
                      <div className="flex flex-wrap gap-1">
                        <Boton tamano="sm" variante={zonaModo ? "primario" : "secundario"} disabled={!permisoMarca} onClick={() => setZonaModo(!zonaModo)}>
                          {zonaModo ? "Dibuja el cuadro en el video…" : "Marcar la zona"}
                        </Boton>
                        {(selClip.difuminar ?? []).length ? (
                          <Boton tamano="sm" variante="fantasma" icono={Trash2} onClick={() => cambiarClip(selClip.id, { difuminar: [] })}>
                            Quitar zonas ({selClip.difuminar!.length})
                          </Boton>
                        ) : null}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 font-medium">Filtros</p>
                      <div className="mb-2 flex flex-wrap gap-1">
                        {PRESETS.map(([n, f]) => (
                          <Boton key={n} tamano="sm" variante="fantasma" onClick={() => cambiarClip(selClip.id, { filtros: { ...f } })}>
                            {n}
                          </Boton>
                        ))}
                      </div>
                      {(
                        [
                          ["brillo", "Brillo", 0.3, 2, 0.05],
                          ["contraste", "Contraste", 0.3, 2, 0.05],
                          ["saturacion", "Saturación", 0, 3, 0.05],
                          ["desenfoque", "Desenfoque", 0, 12, 0.5],
                        ] as const
                      ).map(([k, n, mn, mx, st]) => (
                        <Campo key={k} etiqueta={`${n}: ${selClip.filtros[k]}`}>
                          <input type="range" min={mn} max={mx} step={st} value={selClip.filtros[k]} onChange={(e) => cambiarClip(selClip.id, { filtros: { ...selClip.filtros, [k]: Number(e.target.value) } })} className="w-full accent-acento" />
                        </Campo>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Boton tamano="icono" variante="fantasma" icono={RotateCw} aria-label="Girar 90°" title="Girar 90°" onClick={() => cambiarClip(selClip.id, { giro: (selClip.giro + 90) % 360 })} />
                      <Boton tamano="icono" variante={selClip.voltearH ? "primario" : "fantasma"} icono={FlipHorizontal2} aria-label="Voltear horizontal" onClick={() => cambiarClip(selClip.id, { voltearH: !selClip.voltearH })} />
                      <Boton tamano="icono" variante={selClip.voltearV ? "primario" : "fantasma"} icono={FlipVertical2} aria-label="Voltear vertical" onClick={() => cambiarClip(selClip.id, { voltearV: !selClip.voltearV })} />
                      <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} aria-label="Mover antes" onClick={() => mover(selClip.id, -1)} />
                      <Boton tamano="icono" variante="fantasma" icono={ArrowRight} aria-label="Mover después" onClick={() => mover(selClip.id, 1)} />
                      <Boton tamano="icono" variante="fantasma" icono={Copy} aria-label="Duplicar" onClick={() => duplicar(selClip)} />
                      <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar clip" onClick={borrarSeleccion} />
                    </div>
                  </div>
                ) : null}
                {selAudio ? (
                  <div className="space-y-3 text-xs">
                    <p className="truncate font-medium">{medioDe(selAudio.medioId)?.nombre}</p>
                    <Campo etiqueta={`Empieza en (s): ${selAudio.inicio.toFixed(1)}`}>
                      <input type="range" min={0} max={Math.max(total, 1)} step={0.1} value={selAudio.inicio} onChange={(e) => cambiarAudio(selAudio.id, { inicio: Number(e.target.value) })} className="w-full accent-acento" />
                    </Campo>
                    <Campo etiqueta={`Volumen: ${Math.round(selAudio.volumen * 100)}%`}>
                      <input type="range" min={0} max={2} step={0.05} value={selAudio.volumen} onChange={(e) => cambiarAudio(selAudio.id, { volumen: Number(e.target.value) })} className="w-full accent-acento" />
                    </Campo>
                    <Campo etiqueta={`Hasta (s): ${selAudio.salida.toFixed(1)}`}>
                      <input type="range" min={selAudio.entrada + 0.5} max={medioDe(selAudio.medioId)?.duracion ?? 10} step={0.1} value={selAudio.salida} onChange={(e) => cambiarAudio(selAudio.id, { salida: Number(e.target.value) })} className="w-full accent-acento" />
                    </Campo>
                    <Boton tamano="sm" variante="fantasma" icono={Trash2} onClick={borrarSeleccion}>
                      Quitar música
                    </Boton>
                  </div>
                ) : null}
                {selTexto ? (
                  <div className="space-y-3 text-xs">
                    <Campo etiqueta="Texto">
                      <textarea value={selTexto.texto} onChange={(e) => cambiarTexto(selTexto.id, { texto: e.target.value })} rows={2} maxLength={200} className="w-full rounded-xl border border-borde bg-fondo p-2 text-sm" />
                    </Campo>
                    <div className="grid grid-cols-2 gap-2">
                      <Campo etiqueta={`Sale en (s): ${selTexto.inicio.toFixed(1)}`}>
                        <input type="range" min={0} max={Math.max(total, 1)} step={0.1} value={selTexto.inicio} onChange={(e) => cambiarTexto(selTexto.id, { inicio: Number(e.target.value) })} className="w-full accent-acento" />
                      </Campo>
                      <Campo etiqueta={`Dura (s): ${selTexto.duracion.toFixed(1)}`}>
                        <input type="range" min={0.5} max={30} step={0.1} value={selTexto.duracion} onChange={(e) => cambiarTexto(selTexto.id, { duracion: Number(e.target.value) })} className="w-full accent-acento" />
                      </Campo>
                      <Campo etiqueta="Izquierda ↔ derecha">
                        <input type="range" min={0.05} max={0.95} step={0.01} value={selTexto.x} onChange={(e) => cambiarTexto(selTexto.id, { x: Number(e.target.value) })} className="w-full accent-acento" />
                      </Campo>
                      <Campo etiqueta="Arriba ↕ abajo">
                        <input type="range" min={0.05} max={0.95} step={0.01} value={selTexto.y} onChange={(e) => cambiarTexto(selTexto.id, { y: Number(e.target.value) })} className="w-full accent-acento" />
                      </Campo>
                    </div>
                    <Campo etiqueta={`Tamaño: ${selTexto.tam}`}>
                      <input type="range" min={2} max={25} step={0.5} value={selTexto.tam} onChange={(e) => cambiarTexto(selTexto.id, { tam: Number(e.target.value) })} className="w-full accent-acento" />
                    </Campo>
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="color" value={selTexto.color} onChange={(e) => cambiarTexto(selTexto.id, { color: e.target.value })} className="h-8 w-10 rounded border border-borde bg-transparent" aria-label="Color" />
                      <Boton tamano="sm" variante={selTexto.negrita ? "primario" : "fantasma"} onClick={() => cambiarTexto(selTexto.id, { negrita: !selTexto.negrita })}>
                        <b>N</b>
                      </Boton>
                      <Boton tamano="sm" variante={selTexto.fondo ? "primario" : "fantasma"} onClick={() => cambiarTexto(selTexto.id, { fondo: !selTexto.fondo })}>
                        Con fondo
                      </Boton>
                      <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar texto" onClick={borrarSeleccion} />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {herramienta === "proyecto" ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-tenue">Proyecto</p>
                <Selector className="w-full" value={formato} onChange={(e) => setFormato(e.target.value as Formato)} aria-label="Formato">
                  <option value="16:9">Horizontal 16:9</option>
                  <option value="9:16">Vertical 9:16 (TikTok)</option>
                  <option value="1:1">Cuadrado 1:1</option>
                  <option value="4:5">Retrato 4:5</option>
                </Selector>
                <Selector className="w-full" value={calidad} onChange={(e) => setCalidad(e.target.value as Calidad)} aria-label="Calidad">
                  {(Object.keys(CALIDADES) as Calidad[]).map((c) => (
                    <option key={c} value={c}>
                      {CALIDADES[c].texto}
                    </option>
                  ))}
                </Selector>
                <Selector className="w-full" value={String(fps)} onChange={(e) => setFps(Number(e.target.value) as 24 | 30 | 60)} aria-label="Cuadros por segundo">
                  <option value="24">24 fps (cine)</option>
                  <option value="30">30 fps</option>
                  <option value="60">60 fps (fluido)</option>
                </Selector>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={fundidos.entrada} onChange={(e) => setFundidos({ ...fundidos, entrada: e.target.checked })} /> Aparecer
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={fundidos.salida} onChange={(e) => setFundidos({ ...fundidos, salida: e.target.checked })} /> Terminar a negro
                </label>
              </div>
            ) : null}
          </aside>
        ) : null}
        <main className={cx("flex min-h-0 min-w-0 flex-1 flex-col gap-2 p-2", acostado ? "order-3" : "order-2 lg:order-3")}>
          <div className="min-h-0 flex-1">
            <div className="flex h-full min-h-0 items-center justify-center rounded-xl bg-black p-2">
              <div className="relative flex max-h-full max-w-full">
                <canvas
                  ref={lienzo}
                  width={W}
                  height={H}
                  className={cx("max-h-full max-w-full rounded object-contain", zonaModo && "cursor-crosshair touch-none")}
                  style={{ aspectRatio: `${W} / ${H}` }}
                  onPointerDown={(e) => {
                    if (!zonaModo) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    zonaInicio.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!zonaModo || !zonaInicio.current) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
                    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
                    const a = zonaInicio.current;
                    setZonaTemporal({ x: Math.min(a.x, x), y: Math.min(a.y, y), w: Math.abs(x - a.x), h: Math.abs(y - a.y) });
                  }}
                  onPointerUp={() => {
                    if (zonaModo && zonaTemporal && selClip && zonaTemporal.w > 0.01 && zonaTemporal.h > 0.01) {
                      cambiarClip(selClip.id, { difuminar: [...(selClip.difuminar ?? []), zonaTemporal] });
                      setZonaModo(false);
                      avisar("Zona marcada: se difumina en todo este clip");
                    }
                    zonaInicio.current = null;
                    setZonaTemporal(null);
                  }}
                />
                {zonaTemporal ? (
                  <span className="pointer-events-none absolute border-2 border-dashed border-acento bg-[color-mix(in_srgb,var(--acento)_20%,transparent)]" style={{ left: `${zonaTemporal.x * 100}%`, top: `${zonaTemporal.y * 100}%`, width: `${zonaTemporal.w * 100}%`, height: `${zonaTemporal.h * 100}%` }} />
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Boton tamano="icono" variante="fantasma" icono={SkipBack} aria-label="Al inicio" onClick={() => irA(0)} />
            <Boton tamano="icono" variante="primario" icono={reproduciendo ? Pause : Play} aria-label={reproduciendo ? "Pausar" : "Reproducir"} onClick={() => void alternarReproduccion()} />
            <span className="w-28 text-center font-mono text-xs text-tenue">
              {mmss(tiempo)} / {mmss(total)}
            </span>
            <input type="range" min={0} max={total} step={0.05} value={Math.min(tiempo, total)} onChange={(e) => irA(Number(e.target.value))} className="min-w-0 flex-1 accent-acento" aria-label="Posición" />
            <Boton tamano="sm" icono={Scissors} onClick={dividir}>
              Dividir
            </Boton>
            <Boton tamano="sm" icono={Type} onClick={agregarTexto}>
              Texto
            </Boton>
          </div>
          <section className="max-h-[42%] shrink-0 overflow-y-auto rounded-xl border border-borde bg-superficie p-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">Línea de tiempo</p>
              <label className="flex items-center gap-2 text-xs text-tenue">
                Zoom
                <input type="range" min={16} max={160} value={pps} onChange={(e) => setPps(Number(e.target.value))} className="w-24 accent-acento" />
              </label>
            </div>
            <div className="flex min-w-0">
              <div className="w-16 shrink-0 space-y-1 pr-2 text-[11px] font-medium text-tenue" aria-hidden="true">
                <div className="h-5" />
                <div className="flex h-12 items-center gap-1"><FileVideo className="h-3.5 w-3.5" />Video</div>
                <div className="flex h-8 items-center gap-1"><Type className="h-3.5 w-3.5" />Textos</div>
                <div className="flex h-8 items-center gap-1"><Music2 className="h-3.5 w-3.5" />Música</div>
              </div>
              <div className="min-w-0 flex-1">
              <div className="overflow-x-auto pb-2">
                <div className="relative space-y-1" style={{ width: ancho }}>
                  <div
                    className="relative h-5 cursor-pointer border-b border-borde text-[10px] text-tenue"
                    onPointerDown={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      irA((e.clientX - r.left) / pps);
                    }}
                  >
                    {Array.from({ length: Math.ceil(total) + 1 }, (_, s) => (
                      <span key={s} className="absolute top-0 border-l border-borde pl-0.5" style={{ left: s * pps }}>
                        {s % (pps < 30 ? 5 : 1) === 0 ? `${s}s` : ""}
                      </span>
                    ))}
                  </div>
                  <div className="relative h-12 rounded-lg bg-fondo" onPointerDown={(e) => { if (e.target === e.currentTarget) setSeleccion(null); }}>
                    {linea.map((p, i) => (
                      <button
                        key={p.clip.id}
                        type="button"
                        onClick={() => { setSeleccion({ tipo: "clip", id: p.clip.id }); irA(p.inicio + 0.01); }}
                        className={cx("absolute top-1 h-10 overflow-hidden rounded-md border px-1.5 text-left text-[11px] text-white", seleccion?.id === p.clip.id ? "border-white" : "border-transparent")}
                        style={{ left: p.inicio * pps, width: Math.max(8, (p.fin - p.inicio) * pps), background: colorDe(i) }}
                        title={medioDe(p.clip.medioId)?.nombre}
                      >
                        <span className="block truncate">{medioDe(p.clip.medioId)?.nombre}</span>
                        <span className="block truncate opacity-70">{p.clip.velocidad !== 1 ? `${p.clip.velocidad}x · ` : ""}{mmss(p.fin - p.inicio)}</span>
                      </button>
                    ))}
                    {!clips.length ? <p className="p-3 text-xs text-tenue">Video: agrega archivos y se acomodan aquí en orden.</p> : null}
                  </div>
                  <div className="relative h-8 rounded-lg bg-fondo">
                    {textos.map((t) => (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => { setSeleccion({ tipo: "texto", id: t.id }); arrastrar(e, t.inicio, (n) => cambiarTexto(t.id, { inicio: n })); }}
                        className={cx("absolute top-1 h-6 cursor-grab truncate rounded-md border bg-amber-600 px-1.5 text-[11px] leading-6 text-white", seleccion?.id === t.id ? "border-white" : "border-transparent")}
                        style={{ left: t.inicio * pps, width: Math.max(10, t.duracion * pps) }}
                      >
                        {t.texto}
                      </div>
                    ))}
                    {!textos.length ? <p className="p-1.5 text-[11px] text-tenue">Textos</p> : null}
                  </div>
                  <div className="relative h-8 rounded-lg bg-fondo">
                    {audios.map((a) => (
                      <div
                        key={a.id}
                        role="button"
                        tabIndex={0}
                        onPointerDown={(e) => { setSeleccion({ tipo: "audio", id: a.id }); arrastrar(e, a.inicio, (n) => cambiarAudio(a.id, { inicio: n })); }}
                        className={cx("absolute top-1 h-6 cursor-grab truncate rounded-md border bg-emerald-700 px-1.5 text-[11px] leading-6 text-white", seleccion?.id === a.id ? "border-white" : "border-transparent")}
                        style={{ left: a.inicio * pps, width: Math.max(10, (a.salida - a.entrada) * pps) }}
                      >
                        ♪ {medioDe(a.medioId)?.nombre}
                      </div>
                    ))}
                    {!audios.length ? <p className="p-1.5 text-[11px] text-tenue">Música</p> : null}
                  </div>
                  <div className="pointer-events-none absolute bottom-0 top-0 w-px bg-red-500" style={{ left: tiempo * pps }} />
                </div>
              </div>
              </div>
            </div>
            <p className="hidden text-[11px] text-tenue lg:block">Espacio reproduce/pausa · S divide en la línea roja · Supr quita lo elegido. Arrastra textos y música para cambiar cuándo salen.</p>
          </section>
        </main>
      </div>
      {resultado ? (
        <Modal abierto titulo="Tu video está listo" alCerrar={() => { URL.revokeObjectURL(resultado.url); setResultado(null); }}>
          <div className="space-y-3">
            <video src={resultado.url} controls className="max-h-[50vh] w-full rounded-xl bg-black" />
            <Campo etiqueta="Nombre">
              <Entrada value={nombreVideo} onChange={(e) => setNombreVideo(e.target.value)} maxLength={80} />
            </Campo>
            <p className="text-xs text-tenue">
              {resultado.ext.toUpperCase()} · {fmtBytes(resultado.blob.size)}
            </p>
            <div className="flex flex-wrap gap-2">
              <Boton variante="primario" icono={Download} onClick={descargarVideo}>
                Descargar
              </Boton>
              <Boton icono={Save} cargando={guardando} onClick={() => void guardarEnCuenta()}>
                Guardar en mi cuenta
              </Boton>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
