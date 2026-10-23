/**
 * Sitios y apps: crea páginas y apps web con el editor visual, publícalas en
 * nombre.tudominio.com o tu dominio propio, y recibe formularios, pedidos y visitas.
 */
import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Crop,
  Database,
  Download,
  Eraser,
  ExternalLink,
  Globe,
  History,
  ImagePlus,
  Inbox,
  KeyRound,
  LayoutTemplate,
  Maximize2,
  Minimize2,
  Lock,
  MoreVertical,
  Wrench,
  Power,
  MessagesSquare,
  ShieldAlert,
  Plus,
  RefreshCw,
  Settings2,
  Smartphone,
  Sparkles,
  Trash2,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { subirImagenSitio } from "../components/EditorSitio";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Insignia, Interruptor, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { API_BASE, api, descargar } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { PUBLICA } from "../edicion";
import { queryClient, useMe, usePuede } from "../lib/consultas";
import { PLANTILLAS_SITIOS } from "../lib/plantillasSitios";
import { abrirExterno } from "../lib/plataforma";
import { dataUrlABlob, prepararIcono, revisarArchivoIcono } from "../lib/iconoSitio";
import { MODULOS_UI } from "../modulos";
import { useModoPagina } from "../lib/marco";
import { useNavigate } from "react-router-dom";
import { localeActual } from "../lib/idioma";

const EditorSitio = lazy(() => import("../components/EditorSitio").then((m) => ({ default: m.EditorSitio })));

interface Ajustes {
  titulo?: string;
  descripcion?: string;
  icono?: string;
  imagenCompartir?: string;
  whatsapp?: string;
  color?: string;
  moneda?: "MXN" | "USD" | "EUR";
  app?: boolean;
  nombreCorto?: string;
  servidores?: { id: string; nombre: string; direccion?: string }[];
  avisos?: boolean;
  pago?: string;
  comunidad?: { activa: boolean; oficial?: string };
  demo?: boolean;
  descargas?: boolean;
  estado?: EstadoSitio;
  mantenimiento?: { mensaje?: string; regreso?: string };
}
type EstadoSitio = "abierto" | "mantenimiento" | "cerrado";
interface Sitio {
  id: string;
  nombre: string;
  slug: string;
  dominio: string | null;
  url: string;
  publicado: boolean;
  publicadoEn: string | null;
  actualizado: string;
  ajustes: Ajustes;
  duenoId: string;
}
interface Archivo {
  id: string;
  nombre: string;
  tipo: string;
  tamano: number;
  url: string;
  urlPublica: string;
}

const aSlug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
const fecha = (f: string) => new Date(f).toLocaleString(localeActual(), { dateStyle: "medium", timeStyle: "short" });
const invalidar = (id?: string) => void queryClient.invalidateQueries({ queryKey: id ? ["sitios", id] : ["sitios"] });


const ESTADOS: Record<EstadoSitio, { texto: string; explica: string; icono: typeof Globe; tono: "ok" | "aviso" | "peligro" }> = {
  abierto: { texto: "Abierto", explica: "Todos ven tu sitio normal.", icono: Globe, tono: "ok" },
  mantenimiento: { texto: "En mantenimiento", explica: "Se ve la página «Volvemos pronto» con tu mensaje. No llegan formularios ni pedidos.", icono: Wrench, tono: "aviso" },
  cerrado: { texto: "Cerrado", explica: "Nadie lo ve, pero no se borra nada. Lo vuelves a abrir cuando quieras.", icono: Lock, tono: "peligro" },
};
const estadoDe = (s: Sitio): EstadoSitio => s.ajustes.estado ?? "abierto";
const urlIcono = (s: Sitio) => (s.ajustes.icono && /^[0-9a-f-]{36}$/.test(s.ajustes.icono) ? `${API_BASE}/api/sitios/${s.id}/archivos/${s.ajustes.icono}` : (s.ajustes.icono ?? null));
const cambiarAjustes = (s: Sitio, ajustes: Partial<Ajustes>) => api<Sitio>(`/api/sitios/${s.id}/ajustes`, { metodo: "PUT", cuerpo: { ajustes } });

function EstadoInsignia({ sitio }: { sitio: Sitio }) {
  if (!sitio.publicado) return <Insignia tono="neutro">Borrador</Insignia>;
  const e = ESTADOS[estadoDe(sitio)];
  return <Insignia tono={e.tono}>{estadoDe(sitio) === "abierto" ? "Publicado" : e.texto}</Insignia>;
}

function EstadoDelSitio({ sitio }: { sitio: Sitio }) {
  const [estado, setEstado] = useState<EstadoSitio>(estadoDe(sitio));
  const [mensaje, setMensaje] = useState(sitio.ajustes.mantenimiento?.mensaje ?? "");
  const [regreso, setRegreso] = useState(sitio.ajustes.mantenimiento?.regreso ?? "");
  const guardar = useMutation({
    mutationFn: (e: EstadoSitio) => cambiarAjustes(sitio, { estado: e, mantenimiento: { mensaje: mensaje.trim(), regreso: regreso.trim() } }),
    onSuccess: (_r, e) => {
      avisar(e === "abierto" ? "Tu sitio está abierto" : e === "mantenimiento" ? "Tu sitio está en mantenimiento" : "Tu sitio está cerrado (no se borró nada)");
      invalidar(sitio.id);
      invalidar();
    },
    onError: avisarError,
  });
  return (
    <Tarjeta titulo="Estado del sitio" icono={Power}>
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(ESTADOS) as EstadoSitio[]).map((id) => {
          const e = ESTADOS[id];
          const Icono = e.icono;
          const activo = estado === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setEstado(id)}
              className={cx("rounded-xl border p-3 text-left transition-colors", activo ? "border-acento bg-[color-mix(in_srgb,var(--acento)_12%,transparent)]" : "border-borde hover:bg-tarjeta")}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Icono className={cx("h-4 w-4", activo ? "text-acento" : "text-tenue")} />
                {e.texto}
              </span>
              <span className="mt-1 block text-xs text-tenue">{e.explica}</span>
            </button>
          );
        })}
      </div>
      {estado === "mantenimiento" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Campo etiqueta="Mensaje para tus visitantes">
            <AreaTexto rows={2} maxLength={300} value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder={`${sitio.nombre} está en mantenimiento. Estamos haciendo mejoras.`} />
          </Campo>
          <Campo etiqueta="¿Cuándo regresas? (opcional)">
            <Entrada maxLength={60} value={regreso} onChange={(e) => setRegreso(e.target.value)} placeholder="Lunes 9 a. m." />
          </Campo>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Boton variante="primario" cargando={guardar.isPending} disabled={!sitio.publicado} onClick={() => guardar.mutate(estado)}>
          Guardar estado
        </Boton>
        {!sitio.publicado ? <span className="text-xs text-tenue">Primero publica tu sitio.</span> : null}
      </div>
    </Tarjeta>
  );
}

function IconoDelSitio({ sitio }: { sitio: Sitio }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [idea, setIdea] = useState("");
  const [propuestas, setPropuestas] = useState<string[]>([]);
  const [elegida, setElegida] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | undefined>();
  const actual = urlIcono(sitio);
  const crear = useMutation({
    mutationFn: () => api<{ imagenes: string[] }>(`/api/sitios/${sitio.id}/icono-ia`, { metodo: "POST", cuerpo: { idea } }),
    onSuccess: (r) => {
      setPropuestas((p) => [...r.imagenes, ...p].slice(0, 4));
      setElegida(r.imagenes[0] ?? null);
    },
    onError: avisarError,
  });
  const poner = useMutation({
    mutationFn: async (origen: Blob) => {
      const { archivo, aviso: a } = await prepararIcono(origen);
      setAviso(a);
      const subido = await subirImagenSitio(sitio.id, archivo, "icono");
      await cambiarAjustes(sitio, { icono: subido.id });
    },
    onSuccess: () => {
      avisar("Ícono listo");
      setPropuestas([]);
      setElegida(null);
      invalidar(sitio.id);
      invalidar();
    },
    onError: avisarError,
  });
  const vista = elegida ?? actual;
  return (
    <Tarjeta titulo="Ícono del sitio" icono={Sparkles}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <p className="text-xs text-tenue">
            Es la imagen que sale en la pestaña del navegador y en la pantalla del celular si instalan tu sitio como app. Lo mejor: <b className="text-texto">cuadrada, de 512×512 o más</b>, en <b className="text-texto">JPG o PNG</b>, menos de 2 MB, con un dibujo simple y algo de aire en las orillas. Si no es cuadrada, la recortamos al centro y la dejamos del tamaño que pide la página.
          </p>
          <div className="space-y-2 rounded-xl border border-borde p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-acento" /> Hacerlo con la IA
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Entrada value={idea} maxLength={300} onChange={(e) => setIdea(e.target.value)} placeholder="Idea (opcional): un pan con un sombrero" />
              <Boton variante="primario" icono={Sparkles} cargando={crear.isPending} onClick={() => crear.mutate()}>
                {propuestas.length ? "Otra propuesta" : "Proponer ícono"}
              </Boton>
            </div>
            {propuestas.length ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {propuestas.map((p) => (
                    <button key={p} type="button" onClick={() => setElegida(p)} className={cx("overflow-hidden rounded-xl border-2", elegida === p ? "border-acento" : "border-transparent")}>
                      <img src={p} alt="Propuesta de ícono" className="aspect-square w-full object-cover" />
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Boton variante="primario" icono={Check} disabled={!elegida} cargando={poner.isPending} onClick={async () => elegida && poner.mutate(await dataUrlABlob(elegida))}>
                    Aprobar y usar este
                  </Boton>
                  <Boton variante="fantasma" onClick={() => (setPropuestas([]), setElegida(null))}>
                    Descartar
                  </Boton>
                </div>
              </>
            ) : null}
            <p className="text-[11px] text-tenue">La IA solo propone: no se cambia nada hasta que tocas «Aprobar». Usa tu clave de Gemini de Ajustes → Servicios y claves.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Boton icono={Upload} cargando={poner.isPending} onClick={() => entrada.current?.click()}>
              Subir mi imagen (JPG o PNG)
            </Boton>
            {aviso ? <span className="text-xs text-aviso">{aviso}</span> : null}
          </div>
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const r = revisarArchivoIcono(f);
              if (!r.ok) return avisar(r.aviso ?? "Imagen no válida", "error");
              poner.mutate(f);
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <div className="rounded-2xl p-4 text-center" style={{ background: "linear-gradient(160deg, #1d2b53, #7e2553)" }}>
            <div className="mx-auto h-16 w-16 overflow-hidden rounded-[18px] bg-white/10 shadow-lg">{vista ? <img src={vista} alt="" className="h-full w-full object-cover" /> : <Globe className="m-4 h-8 w-8 text-white/70" />}</div>
            <p className="mt-2 truncate text-xs text-white">{sitio.ajustes.nombreCorto || sitio.nombre}</p>
            <p className="text-[10px] text-white/60">En el celular</p>
          </div>
          <div className="rounded-2xl border border-borde p-3">
            <div className="flex items-center gap-2 rounded-t-lg bg-fondo px-2 py-1.5">
              <span className="h-4 w-4 shrink-0 overflow-hidden rounded">{vista ? <img src={vista} alt="" className="h-full w-full object-cover" /> : <Globe className="h-4 w-4 text-tenue" />}</span>
              <span className="truncate text-[11px]">{sitio.ajustes.titulo || sitio.nombre}</span>
            </div>
            <p className="mt-2 text-center text-[10px] text-tenue">En la pestaña del navegador</p>
          </div>
        </div>
      </div>
    </Tarjeta>
  );
}

function MenuEstado({ sitio }: { sitio: Sitio }) {
  const [abierto, setAbierto] = useState(false);
  const cambiar = useMutation({
    mutationFn: (e: EstadoSitio) => cambiarAjustes(sitio, { estado: e }),
    onSuccess: (_r, e) => {
      avisar(e === "abierto" ? "Sitio abierto" : e === "mantenimiento" ? "Sitio en mantenimiento" : "Sitio cerrado (no se borró nada)");
      invalidar();
    },
    onError: avisarError,
  });
  if (!sitio.publicado) return null;
  const actual = estadoDe(sitio);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <Boton tamano="icono" variante="fantasma" icono={MoreVertical} aria-label="Opciones del sitio" onClick={() => setAbierto((v) => !v)} />
      {abierto ? (
        <div className="absolute right-0 top-9 z-20 w-56 overflow-hidden rounded-xl border border-borde bg-superficie py-1 shadow-xl" onMouseLeave={() => setAbierto(false)}>
          {(Object.keys(ESTADOS) as EstadoSitio[])
            .filter((e) => e !== actual)
            .map((e) => {
              const Icono = ESTADOS[e].icono;
              return (
                <button
                  key={e}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-tarjeta"
                  onClick={() => {
                    setAbierto(false);
                    cambiar.mutate(e);
                  }}
                >
                  <Icono className="h-4 w-4 text-tenue" />
                  {e === "abierto" ? "Volver a abrir" : e === "mantenimiento" ? "Poner en mantenimiento" : "Cerrar sin borrar"}
                </button>
              );
            })}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- crear
function Crear({ alCrear, alCerrar }: { alCrear: (s: Sitio) => void; alCerrar: () => void }) {
  const [nombre, setNombre] = useState("");
  const [slug, setSlug] = useState("");
  const [tocado, setTocado] = useState(false);
  const [plantilla, setPlantilla] = useState("pasteleria");
  const [descripcionIa, setDescripcionIa] = useState("");
  const crear = useMutation({
    mutationFn: async () => {
      let base = PLANTILLAS_SITIOS.find((p) => p.id === plantilla);
      if (plantilla === "ia") {
        const r = await api<{ html: string; css: string }>("/api/sitios/ia", { cuerpo: { descripcion: descripcionIa } });
        base = { id: "ia", nombre: "IA", descripcion: "", emoji: "", ...r };
      }
      return api<Sitio>("/api/sitios", { cuerpo: { nombre, slug, ...(base ? { plantilla: { html: base.html, css: base.css, ...(base.tablas ? { tablas: base.tablas } : {}) } } : {}) } });
    },
    onSuccess: alCrear,
    onError: avisarError,
  });
  return (
    <Modal abierto titulo="Nuevo sitio o app" alCerrar={alCerrar} ancho="max-w-3xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <Entrada
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                if (!tocado) setSlug(aSlug(e.target.value));
              }}
              placeholder="Pastelería Dulce Hogar"
            />
          </Campo>
          <Campo etiqueta="Dirección">
            <div className="flex items-center gap-1">
              <Entrada
                value={slug}
                onChange={(e) => {
                  setTocado(true);
                  setSlug(aSlug(e.target.value));
                }}
                placeholder="dulcehogar"
              />
              <span className="shrink-0 text-xs text-tenue">.<DominioSitios /></span>
            </div>
          </Campo>
        </div>
        <p className="text-sm font-medium">Empieza con una plantilla</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[...PLANTILLAS_SITIOS, { id: "ia", nombre: "Hazlo con IA", descripcion: "Describe tu página y la IA hace el primer diseño.", emoji: "✨", html: "", css: "" }].map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlantilla(p.id)}
              className={cx("rounded-xl border p-3 text-left transition-colors", plantilla === p.id ? "border-acento bg-tarjeta" : "border-borde hover:bg-tarjeta")}
            >
              <div className="text-2xl">{p.emoji}</div>
              <p className="mt-1 text-sm font-medium">{p.nombre}</p>
              <p className="line-clamp-3 text-[11px] text-tenue">{p.descripcion}</p>
            </button>
          ))}
        </div>
        {plantilla === "ia" ? (
          <AreaTexto rows={4} value={descripcionIa} onChange={(e) => setDescripcionIa(e.target.value)} placeholder="Ej. Página para la pastelería de mi mamá: fondo rosa, menú de pasteles con precios, galería, horario y botón de WhatsApp." />
        ) : null}
        <Boton
          variante="primario"
          className="w-full"
          cargando={crear.isPending}
          disabled={!nombre.trim() || slug.length < 2 || (plantilla === "ia" && descripcionIa.trim().length < 5)}
          onClick={() => crear.mutate()}
        >
          {crear.isPending && plantilla === "ia" ? "La IA está diseñando…" : "Crear"}
        </Boton>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- imágenes
function Recortar({ archivo, sitio, alListo, alCerrar }: { archivo: Archivo; sitio: string; alListo: () => void; alCerrar: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [proporcion, setProporcion] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  useEffect(() => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => setImg(i);
    i.src = `${API_BASE}${archivo.url}`;
  }, [archivo.url]);
  useEffect(() => {
    if (!img || !canvas.current) return;
    const ancho = Math.min(1600, img.width);
    const alto = Math.round(ancho / proporcion);
    const c = canvas.current;
    c.width = ancho;
    c.height = alto;
    // Recorte centrado en (x%, y%) con el zoom elegido.
    const escala = Math.max(ancho / img.width, alto / img.height) * zoom;
    const w = ancho / escala;
    const h = alto / escala;
    const sx = Math.min(Math.max((img.width - w) * (x / 100), 0), img.width - w);
    const sy = Math.min(Math.max((img.height - h) * (y / 100), 0), img.height - h);
    c.getContext("2d")?.drawImage(img, sx, sy, w, h, 0, 0, ancho, alto);
  }, [img, proporcion, zoom, x, y]);
  const guardar = async () => {
    const b = await new Promise<Blob | null>((ok) => canvas.current?.toBlob(ok, "image/webp", 0.88));
    if (!b) return;
    try {
      await subirImagenSitio(sitio, b, `${archivo.nombre}-recorte`);
      avisar("Recorte guardado como imagen nueva");
      alListo();
    } catch (err) {
      avisarError(err);
    }
  };
  return (
    <Modal abierto titulo="Recortar imagen" alCerrar={alCerrar} ancho="max-w-2xl">
      <div className="space-y-3">
        <canvas ref={canvas} className="max-h-[50vh] w-full rounded-xl bg-fondo object-contain" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Forma">
            <Selector value={String(proporcion)} onChange={(e) => setProporcion(Number(e.target.value))}>
              <option value="1">Cuadrada 1:1</option>
              <option value={String(16 / 9)}>Horizontal 16:9</option>
              <option value={String(4 / 3)}>4:3</option>
              <option value={String(9 / 16)}>Vertical 9:16</option>
              <option value={String(1200 / 630)}>Para compartir (1200×630)</option>
            </Selector>
          </Campo>
          <Campo etiqueta={`Zoom ${zoom.toFixed(1)}×`}>
            <input type="range" min={1} max={3} step={0.1} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" />
          </Campo>
          <Campo etiqueta="Mover a los lados">
            <input type="range" min={0} max={100} value={x} onChange={(e) => setX(Number(e.target.value))} className="w-full" />
          </Campo>
          <Campo etiqueta="Mover arriba / abajo">
            <input type="range" min={0} max={100} value={y} onChange={(e) => setY(Number(e.target.value))} className="w-full" />
          </Campo>
        </div>
        <Boton variante="primario" icono={Check} onClick={() => void guardar()}>
          Guardar recorte
        </Boton>
      </div>
    </Modal>
  );
}

function Imagenes({ sitio }: { sitio: Sitio }) {
  const ref = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ["sitios", sitio.id, "archivos"], queryFn: () => api<Archivo[]>(`/api/sitios/${sitio.id}/archivos`) });
  const [subiendo, setSubiendo] = useState(false);
  const [recortar, setRecortar] = useState<Archivo | null>(null);
  const [fondo, setFondo] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const recargar = () => void q.refetch();
  const subir = async (lista: FileList | null) => {
    setSubiendo(true);
    try {
      for (const f of Array.from(lista ?? [])) await subirImagenSitio(sitio.id, f);
      avisar("Imágenes subidas (optimizadas a WebP)");
    } catch (err) {
      avisarError(err);
    } finally {
      setSubiendo(false);
      recargar();
    }
  };
  const quitarFondo = async (a: Archivo) => {
    setFondo(a.id);
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const b = await removeBackground(`${API_BASE}${a.url}`);
      await subirImagenSitio(sitio.id, b, `${a.nombre}-sin-fondo`);
      avisar("Listo: se guardó una copia sin fondo");
      recargar();
    } catch (err) {
      avisarError(err);
    } finally {
      setFondo(null);
    }
  };
  const crearIa = useMutation({
    mutationFn: async () => {
      const r = await api<{ imagenes: string[] }>("/api/ia-creativa/imagen", { cuerpo: { prompt, proporcion: "16:9" } });
      for (const src of r.imagenes) await subirImagenSitio(sitio.id, await (await fetch(src)).blob(), "nano-banana");
    },
    onSuccess: () => {
      avisar("Imagen creada y guardada en tu sitio");
      setPrompt("");
      recargar();
    },
    onError: avisarError,
  });
  const borrar = async (a: Archivo) => {
    if (!(await confirmar({ titulo: "Borrar imagen", mensaje: "Si una página la usa, dejará de verse." }))) return;
    await api(`/api/sitios/${sitio.id}/archivos/${a.id}`, { metodo: "DELETE" }).catch(avisarError);
    recargar();
  };
  return (
    <div className="space-y-4">
      <Tarjeta titulo="Imágenes del sitio" icono={ImagePlus} acciones={<Boton tamano="sm" variante="primario" icono={Upload} cargando={subiendo} onClick={() => ref.current?.click()}>Subir</Boton>}>
        <input ref={ref} type="file" accept="image/*" multiple hidden onChange={(e) => void subir(e.target.files)} />
        <p className="mb-3 text-xs text-tenue">Se optimizan solas para que el sitio cargue rápido. En el editor aparecen al tocar dos veces una imagen.</p>
        <ErrorCaja error={q.error} />
        {q.data && !q.data.length ? <Vacio icono={ImagePlus} texto="Sube tus fotos o crea una con IA." /> : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {q.data?.map((a) => (
            <div key={a.id} className="space-y-1 rounded-xl border border-borde p-2">
              <img src={`${API_BASE}${a.url}`} alt={a.nombre} loading="lazy" className="aspect-square w-full rounded-lg bg-fondo object-cover" style={{ backgroundImage: "repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%)", backgroundSize: "16px 16px" }} />
              <p className="truncate text-xs">{a.nombre}</p>
              <div className="flex flex-wrap gap-0.5">
                <Boton tamano="icono" variante="fantasma" icono={Crop} title="Recortar" aria-label="Recortar" onClick={() => setRecortar(a)} />
                <Boton tamano="icono" variante="fantasma" icono={Eraser} title="Quitar fondo" aria-label="Quitar fondo" cargando={fondo === a.id} onClick={() => void quitarFondo(a)} />
                <Boton
                  tamano="icono"
                  variante="fantasma"
                  icono={Copy}
                  title="Copiar dirección"
                  aria-label="Copiar dirección"
                  onClick={() => void navigator.clipboard.writeText(`${sitio.url}${a.urlPublica}`).then(() => avisar("Dirección copiada", "info"))}
                />
                <Boton tamano="icono" variante="fantasma" icono={Trash2} title="Borrar" aria-label="Borrar" onClick={() => void borrar(a)} />
              </div>
            </div>
          ))}
        </div>
      </Tarjeta>
      <Tarjeta titulo="Crear imagen con IA (Nano Banana)" icono={Sparkles}>
        <div className="flex flex-wrap gap-2">
          <Entrada className="min-w-0 flex-1" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ej. Pastel de fresas sobre mesa de madera, luz suave, foto profesional" />
          <Boton variante="primario" icono={Sparkles} cargando={crearIa.isPending} disabled={prompt.trim().length < 3} onClick={() => crearIa.mutate()}>
            Crear
          </Boton>
        </div>
        <p className="mt-2 text-xs text-tenue">Necesita GEMINI_API_KEY (Ajustes → Servicios y claves).</p>
      </Tarjeta>
      {recortar ? <Recortar archivo={recortar} sitio={sitio.id} alCerrar={() => setRecortar(null)} alListo={() => { setRecortar(null); recargar(); }} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- mensajes y pedidos
interface Entrada {
  id: string;
  tipo: "formulario" | "pedido";
  formulario: string;
  datos: Record<string, unknown> & { items?: { nombre: string; precio: number; cantidad: number }[]; total?: number; cliente?: Record<string, string> };
  leida: boolean;
  creado: string;
}
/** De un pedido a un cliente con cobro recurrente (Clientes y cobros): queda con fecha de pago y recordatorios. */
function CobroDePedido({ sitio, entrada, alCerrar }: { sitio: Sitio; entrada: Entrada; alCerrar: () => void }) {
  const items = entrada.datos.items ?? [];
  const sumar = (m: number) => {
    const d = new Date();
    d.setMonth(d.getMonth() + m);
    return d.toISOString().slice(0, 10);
  };
  const [f, setF] = useState({ concepto: items.map((i) => `${i.cantidad > 1 ? `${i.cantidad} × ` : ""}${i.nombre}`).join(", ").slice(0, 190) || "Servicio", monto: String(entrada.datos.total ?? 0), frecuencia: "mensual", proximoCobro: sumar(1) });
  const crear = useMutation({
    mutationFn: () => api(`/api/sitios/${sitio.id}/entradas/${entrada.id}/cobro`, { cuerpo: { ...f, monto: Number(f.monto) } }),
    onSuccess: () => {
      avisar("Listo: el cliente y su cobro ya están en «Clientes y cobros»");
      void queryClient.invalidateQueries({ queryKey: ["sitios", sitio.id, "entradas"] });
      alCerrar();
    },
    onError: avisarError,
  });
  return (
    <Modal abierto titulo="Crear cliente y cobro" alCerrar={alCerrar}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          crear.mutate();
        }}
      >
        <p className="rounded-xl bg-fondo p-2 text-xs text-tenue">Crea al cliente con los datos del pedido y un cobro que te recuerda cuándo pagar (lo ves en Clientes y cobros y en el calendario). Cuando pague, márcalo allá.</p>
        <Campo etiqueta="Concepto">
          <Entrada value={f.concepto} onChange={(e) => setF({ ...f, concepto: e.target.value })} maxLength={200} required />
        </Campo>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo etiqueta="Monto">
            <Entrada type="number" min={0} step="0.01" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} required />
          </Campo>
          <Campo etiqueta="Se cobra">
            <Selector value={f.frecuencia} onChange={(e) => setF({ ...f, frecuencia: e.target.value })}>
              <option value="mensual">Cada mes</option>
              <option value="trimestral">Cada 3 meses</option>
              <option value="anual">Cada año</option>
              <option value="unico">Una sola vez</option>
            </Selector>
          </Campo>
          <Campo etiqueta="Próximo cobro">
            <Entrada type="date" value={f.proximoCobro} onChange={(e) => setF({ ...f, proximoCobro: e.target.value })} required />
          </Campo>
        </div>
        <Boton type="submit" variante="primario" cargando={crear.isPending} disabled={!(Number(f.monto) > 0) || !f.concepto.trim()}>
          Crear cliente y cobro
        </Boton>
      </form>
    </Modal>
  );
}

function Mensajes({ sitio }: { sitio: Sitio }) {
  const puedeCobrar = usePuede("clientes", "escritura");
  const [cobrando, setCobrando] = useState<Entrada | null>(null);
  const q = useQuery({ queryKey: ["sitios", sitio.id, "entradas"], queryFn: () => api<Entrada[]>(`/api/sitios/${sitio.id}/entradas`), refetchInterval: 30_000 });
  const [filtro, setFiltro] = useState<"todos" | "formulario" | "pedido">("todos");
  const accion = async (fn: () => Promise<unknown>) => {
    await fn().catch(avisarError);
    void q.refetch();
  };
  const lista = (q.data ?? []).filter((e) => filtro === "todos" || e.tipo === filtro);
  return (
    <div className="space-y-3">
      <Pestanas valor={filtro} alCambiar={setFiltro} opciones={[{ id: "todos", texto: "Todo" }, { id: "formulario", texto: "Formularios" }, { id: "pedido", texto: "Pedidos" }]} />
      <ErrorCaja error={q.error} />
      {q.data && !lista.length ? <Vacio icono={Inbox} texto="Aquí llegan los formularios y pedidos de tu sitio (y te aviso al celular)." /> : null}
      {lista.map((e) => (
        <Tarjeta
          key={e.id}
          titulo={e.tipo === "pedido" ? `🛒 Pedido · $${(e.datos.total ?? 0).toFixed(2)}` : `✉️ ${e.formulario}`}
          acciones={
            <div className="flex items-center gap-1">
              {!e.leida ? <Insignia tono="aviso">Nuevo</Insignia> : null}
              <Boton tamano="icono" variante="fantasma" icono={Check} aria-label="Marcar como leído" onClick={() => void accion(() => api(`/api/sitios/${sitio.id}/entradas/${e.id}`, { metodo: "PATCH", cuerpo: { leida: !e.leida } }))} />
              <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={() => void accion(() => api(`/api/sitios/${sitio.id}/entradas/${e.id}`, { metodo: "DELETE" }))} />
            </div>
          }
        >
          <p className="mb-2 text-xs text-tenue">{fecha(e.creado)}</p>
          {e.tipo === "pedido" && puedeCobrar ? (
            <div className="mb-2">
              {e.datos["cobro"] ? (
                <Insignia tono="ok">Cobro creado en Clientes y cobros</Insignia>
              ) : (
                <Boton tamano="sm" variante="primario" onClick={() => setCobrando(e)}>
                  Crear cliente y cobro
                </Boton>
              )}
            </div>
          ) : null}
          {e.tipo === "pedido" ? (
            <div className="space-y-1 text-sm">
              {e.datos.items?.map((i, n) => (
                <p key={n}>
                  {i.cantidad} × {i.nombre} · ${(i.precio * i.cantidad).toFixed(2)}
                </p>
              ))}
              <p className="text-tenue">
                {Object.entries(e.datos.cliente ?? {})
                  .filter(([, v]) => v)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(" · ")}
              </p>
            </div>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {Object.entries(e.datos).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-tenue">{k}</dt>
                  <dd className="break-words">{String(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </Tarjeta>
      ))}
      {cobrando ? <CobroDePedido sitio={sitio} entrada={cobrando} alCerrar={() => setCobrando(null)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- tablas de datos
interface Tabla {
  nombre: string;
  columnas: { nombre: string; tipo: "texto" | "numero" | "imagen" | "enlace" }[];
  filas: Record<string, string | number>[];
}
function Datos({ sitio }: { sitio: Sitio }) {
  const q = useQuery({ queryKey: ["sitios", sitio.id, "tablas"], queryFn: () => api<Tabla[]>(`/api/sitios/${sitio.id}/tablas`) });
  const [edicion, setEdicion] = useState<Tabla | null>(null);
  useEffect(() => {
    if (!edicion && q.data?.[0]) setEdicion(structuredClone(q.data[0]));
  }, [q.data, edicion]);
  const guardar = useMutation({
    mutationFn: (t: Tabla) => api(`/api/sitios/${sitio.id}/tablas/${t.nombre}`, { metodo: "PUT", cuerpo: { columnas: t.columnas, filas: t.filas } }),
    onSuccess: () => {
      avisar("Guardado: el sitio ya muestra los datos nuevos");
      void q.refetch();
    },
    onError: avisarError,
  });
  const nueva = () => {
    const nombre = aSlug(window.prompt("Nombre de la tabla (ej. productos, menu, precios)") ?? "").replace(/-/g, "_");
    if (!nombre) return;
    setEdicion({ nombre, columnas: [{ nombre: "nombre", tipo: "texto" }, { nombre: "precio", tipo: "numero" }, { nombre: "imagen", tipo: "imagen" }], filas: [] });
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(q.data ?? []).map((t) => (
          <Boton key={t.nombre} tamano="sm" variante={edicion?.nombre === t.nombre ? "primario" : "secundario"} onClick={() => setEdicion(structuredClone(t))}>
            {t.nombre}
          </Boton>
        ))}
        <Boton tamano="sm" icono={Plus} onClick={nueva}>
          Nueva tabla
        </Boton>
      </div>
      <p className="text-xs text-tenue">
        Pon el bloque «Lista desde tabla» en tu página con el nombre de la tabla: cada fila sale como tarjeta. Las columnas «nombre» y «precio» funcionan con el carrito.
      </p>
      {edicion ? (
        <Tarjeta titulo={`Tabla «${edicion.nombre}»`} icono={Database}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {edicion.columnas.map((c, i) => (
                    <th key={i} className="p-1 text-left">
                      <div className="flex gap-1">
                        <Entrada className="h-8 min-w-24 text-xs" value={c.nombre} onChange={(e) => {
                          const n = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
                          setEdicion({ ...edicion, columnas: edicion.columnas.map((x, j) => (j === i ? { ...x, nombre: n } : x)), filas: edicion.filas.map((f) => { const { [c.nombre]: v, ...resto } = f; return { ...resto, [n]: v ?? "" }; }) });
                        }} />
                        <Selector className="h-8 w-24 text-xs" value={c.tipo} onChange={(e) => setEdicion({ ...edicion, columnas: edicion.columnas.map((x, j) => (j === i ? { ...x, tipo: e.target.value as Tabla["columnas"][number]["tipo"] } : x)) })}>
                          <option value="texto">Texto</option>
                          <option value="numero">Número</option>
                          <option value="imagen">Imagen</option>
                          <option value="enlace">Enlace</option>
                        </Selector>
                      </div>
                    </th>
                  ))}
                  <th>
                    <Boton tamano="icono" variante="fantasma" icono={Plus} aria-label="Agregar columna" onClick={() => setEdicion({ ...edicion, columnas: [...edicion.columnas, { nombre: `campo${edicion.columnas.length + 1}`, tipo: "texto" }] })} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {edicion.filas.map((f, i) => (
                  <tr key={i}>
                    {edicion.columnas.map((c) => (
                      <td key={c.nombre} className="p-1">
                        <Entrada
                          className="h-8 text-xs"
                          type={c.tipo === "numero" ? "number" : "text"}
                          value={String(f[c.nombre] ?? "")}
                          onChange={(e) => setEdicion({ ...edicion, filas: edicion.filas.map((x, j) => (j === i ? { ...x, [c.nombre]: c.tipo === "numero" ? Number(e.target.value) : e.target.value } : x)) })}
                          placeholder={c.tipo === "imagen" ? "https://… o /_archivos/…" : ""}
                        />
                      </td>
                    ))}
                    <td>
                      <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar fila" onClick={() => setEdicion({ ...edicion, filas: edicion.filas.filter((_, j) => j !== i) })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Boton icono={Plus} onClick={() => setEdicion({ ...edicion, filas: [...edicion.filas, Object.fromEntries(edicion.columnas.map((c) => [c.nombre, c.tipo === "numero" ? 0 : ""]))] })}>
              Agregar fila
            </Boton>
            <Boton variante="primario" cargando={guardar.isPending} onClick={() => guardar.mutate(edicion)}>
              Guardar tabla
            </Boton>
            <Boton
              variante="fantasma"
              icono={Trash2}
              onClick={async () => {
                if (await confirmar({ titulo: "Borrar tabla", mensaje: `Se borra «${edicion.nombre}» con todas sus filas.` })) {
                  await api(`/api/sitios/${sitio.id}/tablas/${edicion.nombre}`, { metodo: "DELETE" }).catch(avisarError);
                  setEdicion(null);
                  void q.refetch();
                }
              }}
            >
              Borrar tabla
            </Boton>
          </div>
        </Tarjeta>
      ) : (
        <Vacio icono={Database} texto="Crea una tabla (productos, menú, precios…) y el sitio la mostrará sola. Cambias un precio aquí y cambia en la página." />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- cuentas del sitio
function Cuentas({ sitio }: { sitio: Sitio }) {
  const q = useQuery({ queryKey: ["sitios", sitio.id, "cuentas"], queryFn: () => api<{ id: string; correo: string; nombre: string; creado: string }[]>(`/api/sitios/${sitio.id}/cuentas`) });
  const [d, setD] = useState({ correo: "", nombre: "", clave: "" });
  const crear = useMutation({
    mutationFn: () => api(`/api/sitios/${sitio.id}/cuentas`, { cuerpo: d }),
    onSuccess: () => {
      avisar("Cuenta lista. Pásale su correo y contraseña.");
      setD({ correo: "", nombre: "", clave: "" });
      void q.refetch();
    },
    onError: avisarError,
  });
  const pgMsjS = usePaginado(q.data, 12);
  return (
    <div className="space-y-4">
      <Tarjeta titulo="Cuentas del área privada" icono={Users}>
        <p className="mb-3 text-sm text-tenue">
          Marca una página como «Privada» en el editor y solo podrán verla estas cuentas (por ejemplo, tus clientes). Pon el bloque «Iniciar sesión» o compárteles el enlace de la página.
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Entrada value={d.correo} onChange={(e) => setD({ ...d, correo: e.target.value })} placeholder="Correo" type="email" />
          <Entrada value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="Nombre" />
          <Entrada value={d.clave} onChange={(e) => setD({ ...d, clave: e.target.value })} placeholder="Contraseña (8+)" type="password" />
          <Boton variante="primario" icono={Plus} cargando={crear.isPending} disabled={!d.correo || d.clave.length < 8} onClick={() => crear.mutate()}>
            Crear
          </Boton>
        </div>
        <ul className="mt-3 divide-y divide-borde">
          {pgMsjS.visibles.map((m) => (
            <li key={m.id} className="flex items-center gap-2 py-2 text-sm">
              <KeyRound className="h-4 w-4 text-tenue" />
              <span className="min-w-0 flex-1 truncate">
                {m.nombre ? `${m.nombre} · ` : ""}
                {m.correo}
              </span>
              <Boton
                tamano="icono"
                variante="fantasma"
                icono={Trash2}
                aria-label="Quitar"
                onClick={async () => {
                  await api(`/api/sitios/${sitio.id}/cuentas/${m.id}`, { metodo: "DELETE" }).catch(avisarError);
                  void q.refetch();
                }}
              />
            </li>
          ))}
        </ul>
        {pgMsjS.paginas}
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------- estadísticas
function Estadisticas({ sitio }: { sitio: Sitio }) {
  const [dias, setDias] = useState(30);
  const q = useQuery({
    queryKey: ["sitios", sitio.id, "estadisticas", dias],
    queryFn: () => api<{ serie: { dia: string; visitas: number }[]; total: number; paginas: { clave: string; total: number }[]; clics: { clave: string; total: number }[]; origenes: { clave: string; total: number }[] }>(`/api/sitios/${sitio.id}/estadisticas?dias=${dias}`),
  });
  const lista = (titulo: string, datos: { clave: string; total: number }[] | undefined, vacio: string) => (
    <Tarjeta titulo={titulo}>
      {!datos?.length ? <p className="text-sm text-tenue">{vacio}</p> : null}
      <ul className="space-y-1 text-sm">
        {datos?.map((d) => (
          <li key={d.clave} className="flex justify-between gap-2">
            <span className="truncate">{d.clave}</span>
            <span className="font-medium">{d.total}</span>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Selector className="w-auto" value={dias} onChange={(e) => setDias(Number(e.target.value))}>
          <option value={7}>Últimos 7 días</option>
          <option value={30}>Últimos 30 días</option>
          <option value={90}>Últimos 90 días</option>
        </Selector>
        <span className="text-sm text-tenue">{q.data?.total ?? 0} visitas</span>
      </div>
      <Tarjeta titulo="Visitas por día" icono={BarChart3}>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={q.data?.serie ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,.2)" />
              <XAxis dataKey="dia" tickFormatter={(d: string) => d.slice(5)} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={30} />
              <Tooltip />
              <Line type="monotone" dataKey="visitas" stroke="var(--acento)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Tarjeta>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {lista("Páginas más vistas", q.data?.paginas, "Sin visitas todavía.")}
        {lista("Botones más tocados", q.data?.clics, "Sin clics todavía.")}
        {lista("De dónde llegan", q.data?.origenes, "Directo o sin datos.")}
      </div>
      <p className="text-xs text-tenue">Estadísticas privadas: sin Google Analytics ni cookies de rastreo; solo tú las ves.</p>
    </div>
  );
}

// ---------------------------------------------------------------- diagnóstico de la dirección
interface Diagnostico {
  host: string;
  url: string;
  pasos: { id: string; ok: boolean; detalle: string }[];
  listo: boolean;
  cloudflare: boolean;
  dnsFalta: boolean;
}

/** ¿Por qué mi sitio publicado no abre? Revisa publicación, DNS y HTTPS y ofrece arreglarlo con Cloudflare. */
function Conexion({ sitio }: { sitio: Sitio }) {
  const q = useQuery({ queryKey: ["sitios", sitio.id, "diagnostico"], queryFn: () => api<Diagnostico>(`/api/sitios/${sitio.id}/diagnostico`), staleTime: 0, retry: false });
  const maestra = usePuede("sitios", "administrar");
  const arreglar = useMutation({
    mutationFn: () => api<{ resultado: "creado" | "existia" | "comodin" }>(`/api/sitios/${sitio.id}/dns`, { cuerpo: {} }),
    onSuccess: (r) => {
      avisar(
        r.resultado === "creado"
          ? "Registro DNS creado en Cloudflare. Tarda unos minutos en verse (si el celular dice que no existe, espera ~15 min o prueba con datos móviles)."
          : "El registro ya existe en Cloudflare: solo falta que se propague (unos minutos).",
      );
      void q.refetch();
    },
    onError: avisarError,
  });
  const d = q.data;
  return (
    <Tarjeta
      titulo="¿Abre desde internet?"
      icono={Cloud}
      acciones={
        <Boton tamano="sm" variante="fantasma" icono={RefreshCw} cargando={q.isFetching} onClick={() => void q.refetch()}>
          Revisar
        </Boton>
      }
    >
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando texto="Revisando publicación, DNS y HTTPS…" /> : null}
      {d ? (
        <>
          <ul className="space-y-1.5 text-sm">
            {d.pasos.map((p) => (
              <li key={p.id} className="flex items-start gap-2">
                {p.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-peligro" />}
                <span className={p.ok ? "text-tenue" : ""}>{p.detalle}</span>
              </li>
            ))}
          </ul>
          {d.listo ? (
            <Boton className="mt-3" tamano="sm" icono={ExternalLink} onClick={() => abrirExterno(d.url)}>
              Abrir {d.host}
            </Boton>
          ) : null}
          {d.dnsFalta ? (
            d.cloudflare ? (
              maestra ? (
                <Boton className="mt-3" variante="primario" icono={Cloud} cargando={arreglar.isPending} onClick={() => arreglar.mutate()}>
                  Crear el registro de {d.host} en Cloudflare
                </Boton>
              ) : (
                <p className="mt-3 text-xs text-tenue">Pídele a la cuenta maestra que cree el registro DNS.</p>
              )
            ) : (
              <p className="mt-3 text-xs text-tenue">
                Para que Mi Setup lo haga solo: Ajustes → Servicios y claves → Cloudflare (pega tu token). A mano: en Cloudflare crea un registro A con nombre {sitio.dominio ? sitio.dominio : "*"} hacia la IP del VPS, con la nube gris.
              </p>
            )
          ) : null}
          {!d.listo && !d.dnsFalta ? (
            <p className="mt-3 text-xs text-tenue">Si el DNS ya apunta bien y HTTPS no responde, en el VPS corre: docker compose restart caddy</p>
          ) : null}
        </>
      ) : null}
    </Tarjeta>
  );
}

// ---------------------------------------------------------------- ajustes
/** Dominio de los sitios de este servidor (lo dice el servidor: cada instalación tiene el suyo). */
function DominioSitios() {
  const q = useQuery({ queryKey: ["sitios", "dominio"], queryFn: () => api<{ dominio: string }>("/api/sitios/dominio"), staleTime: Infinity });
  return <>{q.data?.dominio ?? "…"}</>;
}

function AjustesSitio({ sitio, alBorrar }: { sitio: Sitio; alBorrar: () => void }) {
  const [nombre, setNombre] = useState(sitio.nombre);
  const [slug, setSlug] = useState(sitio.slug);
  const [dominio, setDominio] = useState(sitio.dominio ?? "");
  const [a, setA] = useState<Ajustes>(sitio.ajustes);
  const [editor, setEditor] = useState("");
  const verPtero = usePuede("pterodactyl") && !PUBLICA;
  const esMaestra = useMe().data?.usuario.role === "maestra";
  const actualizarOficial = useMutation({
    mutationFn: () => api<{ publicado: boolean }>(`/api/sitios/${sitio.id}/oficial/actualizar`, { metodo: "POST" }),
    onSuccess: (r) => {
      avisar(r.publicado ? "Sitio oficial actualizado y publicado" : "Sitio oficial actualizado (sin publicar)");
      invalidar(sitio.id);
      invalidar();
    },
    onError: avisarError,
  });
  const archivos = useQuery({ queryKey: ["sitios", sitio.id, "archivos"], queryFn: () => api<Archivo[]>(`/api/sitios/${sitio.id}/archivos`) });
  const ptero = useQuery({ queryKey: ["ptero", "servidores"], queryFn: () => api<{ id: string; nombre: string; direccion?: string }[]>("/api/ptero/servidores"), enabled: verPtero, retry: false });
  const editores = useQuery({ queryKey: ["sitios", sitio.id, "editores"], queryFn: () => api<{ id: string; correo: string; nombre: string }[]>(`/api/sitios/${sitio.id}/editores`) });
  const versiones = useQuery({ queryKey: ["sitios", sitio.id, "versiones"], queryFn: () => api<{ id: string; nota: string; creado: string }[]>(`/api/sitios/${sitio.id}/versiones`) });
  const pgVer = usePaginado(versiones.data, 12);
  const guardar = useMutation({
    mutationFn: () => api<Sitio>(`/api/sitios/${sitio.id}/ajustes`, { metodo: "PUT", cuerpo: { nombre, slug, dominio: dominio.trim() || null, ajustes: a } }),
    onSuccess: () => {
      avisar("Ajustes guardados");
      invalidar();
    },
    onError: avisarError,
  });
  const selectorImagen = (valor: string | undefined, alElegir: (v: string) => void) => (
    <Selector value={valor ?? ""} onChange={(e) => alElegir(e.target.value)}>
      <option value="">Ninguna</option>
      {archivos.data?.map((x) => (
        <option key={x.id} value={x.id}>
          {x.nombre}
        </option>
      ))}
    </Selector>
  );
  return (
    <div className="space-y-4">
      <EstadoDelSitio sitio={sitio} />
      <IconoDelSitio sitio={sitio} />
      {sitio.publicado ? <Conexion sitio={sitio} /> : null}
      <Tarjeta titulo="Nombre y dirección" icono={Globe}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>
          <Campo etiqueta="Dirección (subdominio)">
            <div className="flex items-center gap-1">
              <Entrada value={slug} onChange={(e) => setSlug(aSlug(e.target.value))} />
              <span className="shrink-0 text-xs text-tenue">.<DominioSitios /></span>
            </div>
          </Campo>
          <Campo etiqueta="Dominio propio (opcional)">
            <Entrada value={dominio} onChange={(e) => setDominio(e.target.value)} placeholder="pasteleriadulce.com" />
          </Campo>
        </div>
        <p className="mt-2 text-xs text-tenue">
          Dominio propio: en tu proveedor (Cloudflare, GoDaddy…) crea un registro A hacia la IP de tu VPS (en Cloudflare con la nube gris). El candado HTTPS se pone solo al publicar.
        </p>
      </Tarjeta>
      <Tarjeta titulo="Cómo se ve al compartir y en Google (SEO)" icono={LayoutTemplate}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo etiqueta="Título">
            <Entrada value={a.titulo ?? ""} onChange={(e) => setA({ ...a, titulo: e.target.value })} />
          </Campo>
          <Campo etiqueta="Descripción (Google y WhatsApp)">
            <AreaTexto rows={2} value={a.descripcion ?? ""} onChange={(e) => setA({ ...a, descripcion: e.target.value })} maxLength={300} />
          </Campo>
          <Campo etiqueta="Imagen al compartir el enlace">{selectorImagen(a.imagenCompartir, (v) => setA({ ...a, imagenCompartir: v }))}</Campo>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Ventas y avisos" icono={Inbox}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Campo etiqueta="WhatsApp para pedidos (con lada, ej. 5218112345678)">
            <Entrada value={a.whatsapp ?? ""} onChange={(e) => setA({ ...a, whatsapp: e.target.value.replace(/\D/g, "") })} />
          </Campo>
          <Campo etiqueta="Color principal">
            <Entrada type="color" value={a.color || "#16a34a"} onChange={(e) => setA({ ...a, color: e.target.value })} />
          </Campo>
          <Campo etiqueta="Moneda">
            <Selector value={a.moneda ?? "MXN"} onChange={(e) => setA({ ...a, moneda: e.target.value as Ajustes["moneda"] })}>
              <option value="MXN">Pesos (MXN)</option>
              <option value="USD">Dólares (USD)</option>
              <option value="EUR">Euros (EUR)</option>
            </Selector>
          </Campo>
        </div>
        <div className="mt-3">
          <Campo etiqueta="Cómo pagan tus clientes (se les muestra al enviar su pedido)" ayuda="Ej. Transferencia a la CLABE 0123…, o paga en OXXO a nombre de…, o tu enlace de PayPal.">
            <AreaTexto rows={3} maxLength={700} value={a.pago ?? ""} onChange={(e) => setA({ ...a, pago: e.target.value })} placeholder="Instrucciones de pago" />
          </Campo>
        </div>
        <div className="mt-3">
          <Interruptor activo={a.avisos !== false} alCambiar={(v) => setA({ ...a, avisos: v })} etiqueta="Avisarme al celular cuando llegue un mensaje o pedido" />
        </div>
      </Tarjeta>
      {sitio.slug === "misetup" && esMaestra && !PUBLICA ? (
        <Tarjeta titulo="Sitio oficial" icono={RefreshCw}>
          <p className="mb-3 text-sm text-tenue">Pone la wiki, las capturas, el logo y la versión al día con esta versión de Mi Setup. Si ya está publicado, lo nuevo se publica también.</p>
          <Boton
            variante="primario"
            icono={RefreshCw}
            cargando={actualizarOficial.isPending}
            onClick={() => void confirmar({ titulo: "Actualizar el sitio oficial", mensaje: "Se reemplazan sus páginas por las de esta versión. Lo que hayas cambiado a mano en el editor se pierde (queda en el historial de versiones)." }).then((ok) => ok && actualizarOficial.mutate())}
          >
            Actualizar con esta versión
          </Boton>
        </Tarjeta>
      ) : null}
      <Tarjeta titulo="Comunidad" icono={MessagesSquare}>
        <Interruptor
          activo={Boolean(a.comunidad?.activa)}
          alCambiar={(v) => setA({ ...a, comunidad: { ...a.comunidad, activa: v } })}
          etiqueta="Que los visitantes suban proyectos y comenten (bloque «Comunidad» del editor)"
        />
        {a.comunidad?.activa ? (
          <div className="mt-3 space-y-2">
            <Campo etiqueta="Tu nombre oficial (nadie más lo puede usar)" ayuda="Cuando respondes desde aquí sale con este nombre y la marca «Oficial».">
              <Entrada value={a.comunidad.oficial ?? ""} maxLength={40} placeholder="JokeerYT" onChange={(e) => setA({ ...a, comunidad: { activa: true, oficial: e.target.value || undefined } })} />
            </Campo>
            <p className="text-xs text-tenue">Se bloquean insultos y groserías. Cada .zip (y cada repositorio de GitHub) se revisa con antivirus y no aparece hasta que lo apruebas.</p>
          </div>
        ) : null}
        {esMaestra && !PUBLICA ? (
          <div className="mt-3 space-y-2">
            <Interruptor activo={Boolean(a.descargas)} alCambiar={(v) => setA({ ...a, descargas: v })} etiqueta="Mostrar las apps para descargar (bloque «Descargas»: la nueva y las 2 anteriores)" />
            <Interruptor activo={Boolean(a.demo)} alCambiar={(v) => setA({ ...a, demo: v })} etiqueta="Mostrar la demo de Mi Setup en /demo (sin datos reales)" />
          </div>
        ) : null}
      </Tarjeta>
      <Tarjeta titulo="App instalable" icono={Smartphone}>
        <Interruptor activo={Boolean(a.app)} alCambiar={(v) => setA({ ...a, app: v })} etiqueta="Que se pueda instalar como app (Agregar a pantalla de inicio)" />
        {a.app ? (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Nombre corto (bajo el ícono, máx. 12)">
              <Entrada value={a.nombreCorto ?? ""} maxLength={12} onChange={(e) => setA({ ...a, nombreCorto: e.target.value })} />
            </Campo>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-tenue">El ícono de la app es el favicon (usa una imagen cuadrada de 512×512).</p>
        {sitio.publicado ? (
          <Boton className="mt-3" icono={ExternalLink} onClick={() => abrirExterno(`https://www.pwabuilder.com/report?site=${encodeURIComponent(sitio.url)}`)}>
            Convertir en APK (PWABuilder)
          </Boton>
        ) : null}
      </Tarjeta>
      {verPtero && ptero.data?.length ? (
        <Tarjeta titulo="Servidores para el bloque «Estado de servidores»">
          <div className="space-y-2">
            {ptero.data.map((p) => {
              const elegido = a.servidores?.find((x) => x.id === p.id);
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <label className="flex min-w-40 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={Boolean(elegido)}
                      onChange={(e) =>
                        setA({ ...a, servidores: e.target.checked ? [...(a.servidores ?? []), { id: p.id, nombre: p.nombre, direccion: "" }] : (a.servidores ?? []).filter((x) => x.id !== p.id) })
                      }
                    />
                    {p.nombre}
                  </label>
                  {elegido ? (
                    <Entrada
                      className="h-8 max-w-60 text-xs"
                      value={elegido.direccion ?? ""}
                      placeholder="Dirección para jugadores (play.tuserver.net)"
                      onChange={(e) => setA({ ...a, servidores: (a.servidores ?? []).map((x) => (x.id === p.id ? { ...x, direccion: e.target.value } : x)) })}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </Tarjeta>
      ) : null}
      <Boton variante="primario" cargando={guardar.isPending} onClick={() => guardar.mutate()}>
        Guardar ajustes
      </Boton>

      <Tarjeta titulo="Quién puede editar" icono={Users}>
        <div className="flex flex-wrap gap-2">
          <Entrada className="min-w-0 flex-1" type="email" value={editor} onChange={(e) => setEditor(e.target.value)} placeholder="Correo de su cuenta de Mi Setup (tu mamá, tu primo…)" />
          <Boton
            icono={Plus}
            disabled={!editor.includes("@")}
            onClick={async () => {
              try {
                await api(`/api/sitios/${sitio.id}/editores`, { cuerpo: { correo: editor } });
                setEditor("");
                void editores.refetch();
                avisar("Listo: ya puede editar este sitio");
              } catch (err) {
                avisarError(err);
              }
            }}
          >
            Invitar
          </Boton>
        </div>
        <p className="mt-1 text-xs text-tenue">Necesita permiso de «Sitios y apps» (Cuentas y permisos). Solo edita este sitio; no ve tus otras cosas.</p>
        <ul className="mt-2 divide-y divide-borde">
          {editores.data?.map((u) => (
            <li key={u.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {u.nombre} · {u.correo}
              </span>
              <Boton
                tamano="icono"
                variante="fantasma"
                icono={Trash2}
                aria-label="Quitar"
                onClick={async () => {
                  await api(`/api/sitios/${sitio.id}/editores/${u.id}`, { metodo: "DELETE" }).catch(avisarError);
                  void editores.refetch();
                }}
              />
            </li>
          ))}
        </ul>
      </Tarjeta>

      <Tarjeta titulo="Historial de publicaciones" icono={History}>
        {!versiones.data?.length ? <p className="text-sm text-tenue">Cada vez que publicas se guarda una copia (las últimas 30).</p> : null}
        <ul className="max-h-60 divide-y divide-borde overflow-auto">
          {pgVer.visibles.map((v, i) => (
            <li key={v.id} className="flex items-center gap-2 py-1.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{v.nota || fecha(v.creado)}</span>
              {i === 0 ? (
                <Insignia tono="ok">Actual</Insignia>
              ) : (
                <Boton
                  tamano="sm"
                  variante="fantasma"
                  onClick={async () => {
                    if (await confirmar({ titulo: "Regresar a esta versión", mensaje: "El sitio publicado y tu borrador vuelven a como estaban en esa publicación." })) {
                      await api(`/api/sitios/${sitio.id}/versiones/${v.id}/restaurar`, { cuerpo: {} }).catch(avisarError);
                      invalidar();
                      avisar("Versión restaurada");
                    }
                  }}
                >
                  Restaurar
                </Boton>
              )}
            </li>
          ))}
        </ul>
        {pgVer.paginas}
      </Tarjeta>

      <Tarjeta titulo="Más opciones" icono={Settings2}>
        <div className="flex flex-wrap gap-2">
          <Boton icono={Download} disabled={!sitio.publicado} onClick={() => void descargar(`/api/sitios/${sitio.id}/exportar`, `${sitio.slug}.zip`).catch(avisarError)}>
            Exportar en ZIP
          </Boton>
          <Boton icono={Download} onClick={() => void descargar(`/api/sitios/${sitio.id}/paquete`, `${sitio.slug}-mi-setup.zip`).catch(avisarError)}>
            Exportar todo (para importar en otro Mi Setup)
          </Boton>
          {sitio.publicado ? (
            <Boton
              onClick={async () => {
                if (await confirmar({ titulo: "Despublicar", mensaje: "El sitio dejará de verse en internet (tu diseño no se borra)." })) {
                  await api(`/api/sitios/${sitio.id}/despublicar`, { cuerpo: {} }).catch(avisarError);
                  invalidar();
                }
              }}
            >
              Despublicar
            </Boton>
          ) : null}
          <Boton
            variante="fantasma"
            icono={Trash2}
            className="text-peligro"
            onClick={async () => {
              if (await confirmar({ titulo: "Borrar sitio", mensaje: "Se borra el sitio con sus imágenes, mensajes, tablas y cuentas, y su registro DNS en Cloudflare (si lo creó Mi Setup).", peligroso: true, textoExacto: sitio.slug, boton: "Borrar" })) {
                try {
                  const r = await api<{ dns?: string[] }>(`/api/sitios/${sitio.id}`, { metodo: "DELETE" });
                  avisar(r.dns?.length ? `Sitio borrado. También se quitó su DNS: ${r.dns.join(", ")}` : "Sitio borrado");
                  alBorrar();
                } catch (err) {
                  avisarError(err);
                }
              }
            }}
          >
            Borrar sitio
          </Boton>
        </div>
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------- comunidad
interface ElementoComunidad {
  id: string;
  tipo: "proyecto" | "comentario";
  proyecto: string | null;
  autor: string;
  oficial: boolean;
  titulo: string;
  texto: string;
  enlace: string | null;
  estado: "pendiente" | "aprobado" | "rechazado";
  revision: "pendiente" | "limpio" | "infectado" | "error" | "sin_archivo";
  detalleRevision: string;
  tieneArchivo: boolean;
  archivoNombre: string | null;
  fecha: string;
}
const REVISION: Record<ElementoComunidad["revision"], { texto: string; tono: "ok" | "aviso" | "peligro" | "neutro" }> = {
  pendiente: { texto: "Revisando con antivirus…", tono: "neutro" },
  limpio: { texto: "Antivirus: sin virus", tono: "ok" },
  infectado: { texto: "Antivirus: ¡tiene virus!", tono: "peligro" },
  error: { texto: "Sin revisar", tono: "aviso" },
  sin_archivo: { texto: "Sin archivo", tono: "neutro" },
};

function Comunidad({ sitio }: { sitio: Sitio }) {
  const q = useQuery({
    queryKey: ["sitios", sitio.id, "comunidad"],
    queryFn: () => api<{ oficial: string; elementos: ElementoComunidad[] }>(`/api/sitios/${sitio.id}/comunidad`),
    refetchInterval: (c) => (c.state.data?.elementos.some((e) => e.revision === "pendiente") ? 4000 : 60_000),
  });
  const [filtro, setFiltro] = useState<"pendiente" | "aprobado" | "rechazado" | "comentarios">("pendiente");
  const [respuesta, setRespuesta] = useState<{ proyecto: string | null; texto: string } | null>(null);
  const accion = async (fn: () => Promise<unknown>) => {
    await fn().catch(avisarError);
    void q.refetch();
  };
  const todos = q.data?.elementos ?? [];
  const proyectos = todos.filter((e) => e.tipo === "proyecto");
  const lista = filtro === "comentarios" ? todos.filter((e) => e.tipo === "comentario") : proyectos.filter((e) => e.estado === filtro);
  const pendientes = proyectos.filter((e) => e.estado === "pendiente").length;
  const base = `/api/sitios/${sitio.id}/comunidad`;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pestanas
          valor={filtro}
          alCambiar={setFiltro}
          opciones={[
            { id: "pendiente", texto: `Por aprobar${pendientes ? ` (${pendientes})` : ""}` },
            { id: "aprobado", texto: "Aprobados" },
            { id: "rechazado", texto: "Rechazados" },
            { id: "comentarios", texto: "Comentarios" },
          ]}
        />
        <Boton tamano="sm" variante="secundario" icono={MessagesSquare} onClick={() => setRespuesta({ proyecto: null, texto: "" })}>
          Escribir como {q.data?.oficial ?? "autor oficial"}
        </Boton>
      </div>
      <ErrorCaja error={q.error} />
      {q.data && !lista.length ? <Vacio icono={MessagesSquare} texto={filtro === "pendiente" ? "No hay nada esperando tu aprobación." : "Aquí no hay nada todavía."} /> : null}
      {lista.map((e) => (
        <Tarjeta
          key={e.id}
          titulo={e.tipo === "proyecto" ? e.titulo : `💬 ${e.autor}${e.oficial ? " · Oficial" : ""}`}
          acciones={<Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={() => void accion(async () => (await confirmar({ titulo: "¿Borrar?", mensaje: "También se borran sus comentarios." })) && api(`${base}/${e.id}`, { metodo: "DELETE" }))} />}
        >
          <p className="mb-2 text-xs text-tenue">
            {e.tipo === "proyecto" ? `${e.autor}${e.oficial ? " (oficial)" : ""} · ` : ""}
            {fecha(e.fecha)}
            {e.proyecto ? ` · en «${proyectos.find((p) => p.id === e.proyecto)?.titulo ?? "un proyecto"}»` : ""}
          </p>
          {e.texto ? <p className="mb-2 whitespace-pre-wrap break-words text-sm">{e.texto}</p> : null}
          {e.tipo === "proyecto" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Insignia tono={REVISION[e.revision].tono}>{REVISION[e.revision].texto}</Insignia>
                {e.detalleRevision && e.revision !== "limpio" ? <span className="text-xs text-tenue">{e.detalleRevision}</span> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {e.enlace ? (
                  <Boton tamano="sm" variante="fantasma" icono={ExternalLink} onClick={() => abrirExterno(e.enlace!)}>
                    Ver en GitHub
                  </Boton>
                ) : null}
                {e.tieneArchivo && e.revision !== "infectado" ? (
                  <Boton tamano="sm" variante="fantasma" icono={Download} onClick={() => void descargar(`${base}/${e.id}/archivo`, e.archivoNombre ?? "proyecto.zip").catch(avisarError)}>
                    Bajar .zip
                  </Boton>
                ) : null}
                {e.revision === "error" ? (
                  <Boton tamano="sm" variante="secundario" icono={RefreshCw} onClick={() => void accion(() => api(`${base}/${e.id}/revisar`, { metodo: "POST" }))}>
                    Revisar otra vez
                  </Boton>
                ) : null}
                {e.estado !== "aprobado" ? (
                  <Boton tamano="sm" variante="primario" icono={CheckCircle2} disabled={e.revision !== "limpio"} onClick={() => void accion(() => api(`${base}/${e.id}/estado`, { metodo: "POST", cuerpo: { estado: "aprobado" } }))}>
                    Aprobar
                  </Boton>
                ) : (
                  <Boton tamano="sm" variante="secundario" icono={MessagesSquare} onClick={() => setRespuesta({ proyecto: e.id, texto: "" })}>
                    Responder
                  </Boton>
                )}
                {e.estado !== "rechazado" ? (
                  <Boton tamano="sm" variante="fantasma" icono={XCircle} onClick={() => void accion(() => api(`${base}/${e.id}/estado`, { metodo: "POST", cuerpo: { estado: "rechazado" } }))}>
                    Rechazar
                  </Boton>
                ) : null}
              </div>
              {e.revision === "infectado" ? (
                <p className="flex items-center gap-1 text-xs text-peligro">
                  <ShieldAlert className="h-4 w-4" /> El archivo se borró por seguridad. Recházalo o bórralo.
                </p>
              ) : null}
            </div>
          ) : null}
        </Tarjeta>
      ))}
      {respuesta ? (
        <Modal abierto titulo={respuesta.proyecto ? "Responder como autor oficial" : "Comentario oficial"} alCerrar={() => setRespuesta(null)}>
          <div className="space-y-3">
            <AreaTexto rows={4} maxLength={2000} value={respuesta.texto} onChange={(ev) => setRespuesta({ ...respuesta, texto: ev.target.value })} placeholder="Escribe tu respuesta" />
            <Boton
              variante="primario"
              disabled={!respuesta.texto.trim()}
              onClick={() =>
                void accion(async () => {
                  await api(`${base}/responder`, { metodo: "POST", cuerpo: { texto: respuesta.texto, proyecto: respuesta.proyecto } });
                  setRespuesta(null);
                  avisar("Publicado con la marca «Oficial»");
                })
              }
            >
              Publicar
            </Boton>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- detalle
type PestanaSitio = "editor" | "imagenes" | "mensajes" | "comunidad" | "datos" | "cuentas" | "estadisticas" | "ajustes";
function Detalle({ id, alVolver }: { id: string; alVolver: () => void }) {
  const q = useQuery({ queryKey: ["sitios", id], queryFn: () => api<Sitio & { borrador: Record<string, unknown> }>(`/api/sitios/${id}`) });
  const [pestana, setPestana] = useState<PestanaSitio>("editor");
  const [completa, setCompleta] = useState(false);
  useModoPagina(completa && pestana === "editor" ? "completa" : "normal");
  const entradas = useQuery({ queryKey: ["sitios", id, "entradas"], queryFn: () => api<{ leida: boolean }[]>(`/api/sitios/${id}/entradas`), refetchInterval: 60_000 });
  const nuevos = (entradas.data ?? []).filter((e) => !e.leida).length;
  const s = q.data;
  const editable = useMemo(() => (s ? { id: s.id, nombre: s.nombre, url: s.url, publicado: s.publicado, borrador: s.borrador } : null), [s?.id]);
  if (q.isLoading) return <Cargando />;
  if (!s || !editable) return <ErrorCaja error={q.error} />;
  if (completa && pestana === "editor")
    return (
      <div className="flex h-full min-h-0 flex-col safe-top">
        <div className="flex shrink-0 items-center gap-2 border-b border-borde bg-superficie px-2 py-1.5">
          <Boton tamano="sm" variante="fantasma" icono={Minimize2} onClick={() => setCompleta(false)}>
            Salir de pantalla completa
          </Boton>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{s.nombre}</span>
          <EstadoInsignia sitio={s} />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <Suspense fallback={<Cargando texto="Abriendo el editor…" />}>
            <EditorSitio
              sitio={editable}
              alPublicar={(url) => {
                invalidar(id);
                invalidar();
                if (url) avisar(`Publicado en ${url.replace(/^https?:\/\//, "")}`);
              }}
            />
          </Suspense>
        </div>
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} aria-label="Volver" onClick={alVolver} />
        <h2 className="text-lg font-semibold">{s.nombre}</h2>
        <EstadoInsignia sitio={s} />
        <button type="button" className="truncate text-xs text-tenue underline" onClick={() => abrirExterno(s.url)}>
          {s.url.replace(/^https?:\/\//, "")}
        </button>
        {s.publicado ? (
          <button type="button" className="text-xs text-acento underline" onClick={() => setPestana("ajustes")}>
            ¿No abre? Revisar
          </button>
        ) : null}
        {pestana === "editor" ? (
          <Boton className="ml-auto" tamano="sm" variante="fantasma" icono={Maximize2} onClick={() => setCompleta(true)}>
            Pantalla completa
          </Boton>
        ) : null}
      </div>
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "editor", texto: "Editor" },
          { id: "imagenes", texto: "Imágenes" },
          { id: "mensajes", texto: `Mensajes y pedidos${nuevos ? ` (${nuevos})` : ""}` },
          ...(s.ajustes.comunidad?.activa ? [{ id: "comunidad" as const, texto: "Comunidad" }] : []),
          { id: "datos", texto: "Datos" },
          { id: "cuentas", texto: "Cuentas" },
          { id: "estadisticas", texto: "Estadísticas" },
          { id: "ajustes", texto: "Ajustes" },
        ]}
      />
      {pestana === "editor" ? (
        <Suspense fallback={<Cargando texto="Abriendo el editor…" />}>
          <EditorSitio
            sitio={editable}
            alPublicar={(url) => {
              invalidar(id);
              invalidar();
              if (url) avisar(`Publicado en ${url.replace(/^https?:\/\//, "")}`);
            }}
          />
        </Suspense>
      ) : null}
      {pestana === "imagenes" ? <Imagenes sitio={s} /> : null}
      {pestana === "mensajes" ? <Mensajes sitio={s} /> : null}
      {pestana === "comunidad" ? <Comunidad sitio={s} /> : null}
      {pestana === "datos" ? <Datos sitio={s} /> : null}
      {pestana === "cuentas" ? <Cuentas sitio={s} /> : null}
      {pestana === "estadisticas" ? <Estadisticas sitio={s} /> : null}
      {pestana === "ajustes" ? <AjustesSitio key={s.actualizado} sitio={s} alBorrar={alVolver} /> : null}
    </div>
  );
}

export default function Sitios() {
  const [params, setParams] = useSearchParams();
  const elegido = params.get("sitio");
  const [crear, setCrear] = useState(false);
  const puede = usePuede("sitios", "escritura");
  const q = useQuery({ queryKey: ["sitios"], queryFn: () => api<Sitio[]>("/api/sitios") });
  const abrir = (id: string | null) => setParams(id ? { sitio: id } : {});
  const archivoImportar = useRef<HTMLInputElement>(null);
  const importar = useMutation({
    mutationFn: (f: File) => {
      const datos = new FormData();
      datos.append("archivo", f);
      return api<Sitio>("/api/sitios/importar", { formulario: datos });
    },
    onSuccess: (s) => {
      avisar("Sitio importado. Revísalo y publícalo cuando quieras.");
      invalidar();
      abrir(s.id);
    },
    onError: avisarError,
  });

  const pgSit = usePaginado(q.data, 12);
  const navegar = useNavigate();
  const esMaestra = useMe().data?.usuario.role === "maestra";
  const puedeNegocio = usePuede("clientes");
  const verNegocio = puedeNegocio && (PUBLICA || !esMaestra);
  if (elegido) return <Detalle id={elegido} alVolver={() => abrir(null)} />;
  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Sitios y apps"
        descripcion="Diseña páginas y apps arrastrando bloques y publícalas en tu dominio con un botón."
        acciones={
          puede ? (
            <>
              <Boton icono={Upload} cargando={importar.isPending} onClick={() => archivoImportar.current?.click()}>
                Importar sitio
              </Boton>
              <Boton variante="primario" icono={Plus} onClick={() => setCrear(true)}>
                Nuevo sitio
              </Boton>
            </>
          ) : null
        }
      />
      <input
        ref={archivoImportar}
        type="file"
        accept=".zip,.html,.htm,application/zip,text/html"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) importar.mutate(f);
        }}
      />
      <p className="-mt-2 text-xs text-tenue">«Importar sitio» acepta lo que exportas con «Exportar todo», o un sitio que ya tengas hecho (.zip con sus páginas .html o un .html suelto).</p>
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data && !q.data.length ? <Vacio icono={Globe} texto="Crea tu primer sitio: la página de la pastelería, la de tu servidor de Minecraft o tu link in bio." /> : null}
      {verNegocio ? (
        <div className="flex gap-1 rounded-xl border border-borde bg-superficie p-1 text-sm sm:w-fit">
          <span className="flex-1 rounded-lg bg-tarjeta px-3 py-1.5 text-center font-medium sm:flex-none">Sitios y apps</span>
          <button type="button" className="flex-1 rounded-lg px-3 py-1.5 text-tenue hover:text-texto sm:flex-none" onClick={() => navegar(MODULOS_UI.clientes.ruta)}>
            Negocio y cobros
          </button>
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {pgSit.visibles.map((s) => {
          const estado = estadoDe(s);
          const icono = urlIcono(s);
          const tapado = s.publicado && estado !== "abierto";
          const Aviso = ESTADOS[estado].icono;
          return (
            <div key={s.id} role="button" tabIndex={0} onClick={() => abrir(s.id)} onKeyDown={(e) => e.key === "Enter" && abrir(s.id)} className="group cursor-pointer overflow-hidden rounded-tarjeta border border-borde bg-superficie transition-colors hover:border-acento">
              <div className="relative h-32 overflow-hidden" style={{ background: `linear-gradient(135deg, ${s.ajustes.color || "#7c5cff"}, color-mix(in srgb, ${s.ajustes.color || "#7c5cff"} 30%, #0b0a10))` }}>
                <div className="absolute inset-x-4 top-4 rounded-lg bg-white/90 p-2 shadow-lg">
                  <div className="mb-1.5 flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#ff6b81]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#f5c451]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-[#3ddc84]" />
                  </div>
                  <p className="truncate text-xs font-bold text-[#111]">{s.ajustes.titulo || s.nombre}</p>
                  <div className="mt-1 h-1.5 w-2/3 rounded bg-[#ddd]" />
                  <div className="mt-1 h-1.5 w-1/2 rounded bg-[#e9e9e9]" />
                </div>
                {tapado ? (
                  <div className="absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,#0b0a10_70%,transparent)] text-center text-white">
                    <span>
                      <Aviso className="mx-auto h-6 w-6" />
                      <span className="mt-1 block text-xs font-semibold">{estado === "mantenimiento" ? "Volvemos pronto" : "Cerrado"}</span>
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-3 p-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-tarjeta">{icono ? <img src={icono} alt="" className="h-full w-full object-cover" /> : <Globe className="h-4 w-4 text-tenue" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{s.nombre}</span>
                    <EstadoInsignia sitio={s} />
                  </span>
                  <span className="block truncate text-xs text-tenue">{s.url.replace(/^https?:\/\//, "")} · {fecha(s.actualizado)}</span>
                </span>
                {puede ? <MenuEstado sitio={s} /> : null}
              </div>
            </div>
          );
        })}
      </div>
      {pgSit.paginas}
      {crear ? (
        <Crear
          alCerrar={() => setCrear(false)}
          alCrear={(s) => {
            setCrear(false);
            invalidar();
            abrir(s.id);
          }}
        />
      ) : null}
    </div>
  );
}
