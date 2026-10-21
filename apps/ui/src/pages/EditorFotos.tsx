/**
 * Editor de fotos (tipo Photoshop ligero): capas, texto, formas, pincel, filtros, recorte, quitar fondo,
 * retoque con IA, deshacer/rehacer, proyectos guardados en tu cuenta y exportar PNG/JPG/WebP.
 * Usa fabric.js sobre un lienzo; todo se edita en tu dispositivo y solo se sube al guardar.
 */
import { useQuery } from "@tanstack/react-query";
import { Canvas, Circle, FabricImage, IText, Line, PencilBrush, Rect, Triangle, filters, type FabricObject } from "fabric";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Crop,
  Download,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  ImagePlus,
  Lock,
  LockOpen,
  Minus,
  MousePointer2,
  Paintbrush,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Scissors,
  Sparkles,
  Square,
  Trash2,
  Triangle as TrianguloIcono,
  Type as TextoIcono,
  Undo2,
  Circle as CirculoIcono,
  Eraser,
  Pipette,
  FilePlus2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { guardarBlob } from "../lib/guardar";
import { confirmar } from "../lib/confirmar";
import { queryClient } from "../lib/consultas";
import { fmtBytes } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";

type Objeto = FabricObject & { nombre?: string; ajustes?: Ajustes };
type Herramienta = "seleccionar" | "pincel" | "borrador" | "cuentagotas" | "texto" | "rectangulo" | "circulo" | "triangulo" | "linea";
interface Ajustes {
  brillo: number;
  contraste: number;
  saturacion: number;
  matiz: number;
  desenfoque: number;
  pixelar: number;
  grises: boolean;
  sepia: boolean;
  invertir: boolean;
}
const AJUSTES_INICIALES: Ajustes = { brillo: 0, contraste: 0, saturacion: 0, matiz: 0, desenfoque: 0, pixelar: 0, grises: false, sepia: false, invertir: false };
const PROPS = ["nombre", "ajustes"];
const FUENTES = ["Inter", "Montserrat", "Arial", "Georgia", "Courier New", "Impact", "Comic Sans MS", "system-ui"];
const TAMANOS = [
  { n: "Cuadrado 1080×1080", w: 1080, h: 1080 },
  { n: "Horizontal 1920×1080", w: 1920, h: 1080 },
  { n: "Vertical 1080×1920 (TikTok, Reels)", w: 1080, h: 1920 },
  { n: "Portada 1200×630", w: 1200, h: 630 },
  { n: "Retrato 1080×1350", w: 1080, h: 1350 },
  { n: "Pequeño 800×600", w: 800, h: 600 },
];
const MEZCLAS: [string, string][] = [
  ["source-over", "Normal"],
  ["multiply", "Multiplicar"],
  ["screen", "Trama"],
  ["overlay", "Superponer"],
  ["darken", "Oscurecer"],
  ["lighten", "Aclarar"],
  ["difference", "Diferencia"],
];

const esImagen = (o: FabricObject | undefined | null): o is FabricImage & Objeto => Boolean(o) && o!.type?.toLowerCase() === "image";
const nombreDe = (o: Objeto): string => o.nombre ?? (esImagen(o) ? "Imagen" : o.type === "i-text" || o.type === "itext" ? `Texto: ${(o as IText).text?.slice(0, 16) ?? ""}` : o.type === "rect" ? "Rectángulo" : o.type === "circle" ? "Círculo" : o.type === "triangle" ? "Triángulo" : o.type === "line" ? "Línea" : o.type === "path" ? "Trazo" : "Objeto");

function aplicarFiltros(img: FabricImage & Objeto, a: Ajustes): void {
  img.ajustes = a;
  const lista = [];
  if (a.brillo) lista.push(new filters.Brightness({ brightness: a.brillo }));
  if (a.contraste) lista.push(new filters.Contrast({ contrast: a.contraste }));
  if (a.saturacion) lista.push(new filters.Saturation({ saturation: a.saturacion }));
  if (a.matiz) lista.push(new filters.HueRotation({ rotation: a.matiz }));
  if (a.desenfoque) lista.push(new filters.Blur({ blur: a.desenfoque }));
  if (a.pixelar > 1) lista.push(new filters.Pixelate({ blocksize: a.pixelar }));
  if (a.grises) lista.push(new filters.Grayscale());
  if (a.sepia) lista.push(new filters.Sepia());
  if (a.invertir) lista.push(new filters.Invert());
  img.filters = lista;
  img.applyFilters();
}

const aBlob = async (url: string): Promise<Blob> => (await fetch(url)).blob();

interface Guardado {
  id: string;
  tipo: "foto" | "imagen";
  nombre: string;
  tamano: number;
  miniatura: string;
  actualizado: string;
  url: string;
}

// ---------------------------------------------------------------- abrir

function Abrir({ alCerrar, alAbrirProyecto, alAgregarImagen, alSubir }: { alCerrar: () => void; alAbrirProyecto: (g: Guardado) => void; alAgregarImagen: (url: string, nombre: string) => void; alSubir: (f: File) => void }) {
  const [tab, setTab] = useState<"foto" | "imagen">("foto");
  const q = useQuery({ queryKey: ["estudio", tab], queryFn: () => api<Guardado[]>(`/api/estudio/proyectos?tipo=${tab}`) });
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <Modal abierto titulo="Abrir" alCerrar={alCerrar}>
      <div className="space-y-3">
        <Boton icono={ImagePlus} onClick={() => entrada.current?.click()}>
          Foto de mi dispositivo
        </Boton>
        <input ref={entrada} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && alSubir(e.target.files[0])} />
        <div className="flex gap-2 text-sm">
          <button type="button" onClick={() => setTab("foto")} className={cx("rounded-full border px-3 py-1", tab === "foto" ? "border-acento bg-tarjeta" : "border-borde")}>
            Mis proyectos
          </button>
          <button type="button" onClick={() => setTab("imagen")} className={cx("rounded-full border px-3 py-1", tab === "imagen" ? "border-acento bg-tarjeta" : "border-borde")}>
            Imágenes guardadas
          </button>
        </div>
        <ErrorCaja error={q.error} />
        {q.isLoading ? <Cargando /> : null}
        {q.data?.length === 0 ? <Vacio icono={FolderOpen} texto={tab === "foto" ? "Todavía no guardas proyectos." : "Todavía no guardas imágenes."} /> : null}
        <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">
          {q.data?.map((g) => (
            <div key={g.id} className="group relative rounded-xl border border-borde p-1">
              <button type="button" className="block w-full text-left" onClick={() => (tab === "foto" ? alAbrirProyecto(g) : alAgregarImagen(`${API_BASE}${g.url}`, g.nombre))}>
                {g.miniatura ? <img src={g.miniatura} alt="" className="aspect-square w-full rounded-lg bg-fondo object-cover" /> : <div className="aspect-square rounded-lg bg-fondo" />}
                <p className="mt-1 truncate text-xs">{g.nombre}</p>
                <p className="text-[10px] text-tenue">{fmtBytes(g.tamano)}</p>
              </button>
              <button
                type="button"
                aria-label={`Borrar ${g.nombre}`}
                className="absolute right-2 top-2 hidden rounded-full bg-black/60 p-1 text-white group-hover:block"
                onClick={async () => {
                  if (!(await confirmar({ titulo: "Borrar", mensaje: `${g.nombre} se borra para siempre.`, peligroso: true, boton: "Borrar" }))) return;
                  await api(`/api/estudio/proyectos/${g.id}`, { metodo: "DELETE" }).catch(avisarError);
                  void q.refetch();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- editor

export default function EditorFotos() {
  const contenedor = useRef<HTMLDivElement>(null);
  const elemento = useRef<HTMLCanvasElement>(null);
  const lienzo = useRef<Canvas | null>(null);
  const historial = useRef<string[]>([]);
  const posicion = useRef(-1);
  const cargando = useRef(false);
  const recorte = useRef<Rect | null>(null);
  const herramientaRef = useRef<Herramienta>("seleccionar");
  const dibujo = useRef({ color: "#ef4444", grosor: 8 });
  const tomarColor = useRef<(hex: string) => void>(() => undefined);

  const [tam, setTam] = useState({ w: 1080, h: 1080 });
  const [zoom, setZoom] = useState(0.5);
  const [herramienta, setHerramienta] = useState<Herramienta>("seleccionar");
  const [color, setColor] = useState("#ef4444");
  const [grosor, setGrosor] = useState(8);
  const [, redibujar] = useState(0);
  const [seleccion, setSeleccion] = useState<Objeto | null>(null);
  const [capas, setCapas] = useState<Objeto[]>([]);
  const [panel, setPanel] = useState<"propiedades" | "capas">("propiedades");
  const [modal, setModal] = useState<null | "nuevo" | "abrir" | "guardar" | "exportar" | "ia">(null);
  const [nombre, setNombre] = useState("Sin título");
  const [proyectoId, setProyectoId] = useState<string | undefined>();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [formato, setFormato] = useState<"png" | "jpeg" | "webp">("png");
  const [calidad, setCalidad] = useState(0.92);
  const [promptIa, setPromptIa] = useState("");
  const [nuevoTam, setNuevoTam] = useState({ w: 1080, h: 1080, fondo: "#ffffff", transparente: false });
  const [recortando, setRecortando] = useState(false);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  const [puedeRehacer, setPuedeRehacer] = useState(false);

  const refrescarCapas = useCallback(() => {
    const c = lienzo.current;
    if (!c) return;
    setCapas([...c.getObjects()].reverse() as Objeto[]);
    setSeleccion((c.getActiveObject() as Objeto | undefined) ?? null);
    redibujar((n) => n + 1);
  }, []);

  const foto = useCallback(() => {
    const c = lienzo.current;
    if (!c || cargando.current) return;
    const json = JSON.stringify(c.toObject(PROPS));
    historial.current = [...historial.current.slice(0, posicion.current + 1), json].slice(-40);
    posicion.current = historial.current.length - 1;
    setPuedeDeshacer(posicion.current > 0);
    setPuedeRehacer(false);
  }, []);

  const ajustarZoom = useCallback((ancho: number, alto: number) => {
    const r = contenedor.current;
    if (!r) return;
    const z = Math.min(1, (r.clientWidth - 24) / ancho, (window.innerHeight * 0.7) / alto);
    setZoom(Math.max(0.05, z));
  }, []);

  // Crear el lienzo una sola vez.
  useEffect(() => {
    const c = new Canvas(elemento.current!, { width: 1080, height: 1080, backgroundColor: "#ffffff", preserveObjectStacking: true, selection: true });
    lienzo.current = c;
    const cambio = () => {
      foto();
      refrescarCapas();
    };
    c.on("object:modified", cambio);
    c.on("object:added", cambio);
    c.on("object:removed", cambio);
    c.on("selection:created", refrescarCapas);
    c.on("selection:updated", refrescarCapas);
    c.on("selection:cleared", refrescarCapas);
    c.on("path:created", (e) => {
      if (herramientaRef.current !== "borrador") return;
      const trazo = (e as unknown as { path: Objeto }).path;
      trazo.set({ globalCompositeOperation: "destination-out", selectable: false });
      trazo.nombre = "Borrador";
      c.requestRenderAll();
    });
    c.on("mouse:down", (e) => {
      const h = herramientaRef.current;
      if (h === "cuentagotas") {
        const p = c.getViewportPoint(e.e);
        const escala = c.getRetinaScaling();
        const px = c.getContext().getImageData(Math.round(p.x * escala), Math.round(p.y * escala), 1, 1).data;
        const hex = `#${[px[0]!, px[1]!, px[2]!].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        tomarColor.current(hex);
        return;
      }
      if (h === "texto" && !e.target) {
        const p = c.getScenePoint(e.e);
        const t = new IText("Texto", { left: p.x, top: p.y, fontSize: 64, fill: dibujo.current.color, fontFamily: "Inter" }) as IText & Objeto;
        c.add(t);
        c.setActiveObject(t);
        t.enterEditing();
        t.selectAll();
        setHerramienta("seleccionar");
      }
    });
    foto();
    refrescarCapas();
    ajustarZoom(1080, 1080);
    const alCambiarVentana = () => ajustarZoom(c.getWidth() / (c.getZoom() || 1), c.getHeight() / (c.getZoom() || 1));
    window.addEventListener("resize", alCambiarVentana);
    return () => {
      window.removeEventListener("resize", alCambiarVentana);
      void c.dispose();
      lienzo.current = null;
    };
  }, []);

  // El zoom escala la vista; las medidas del diseño no cambian.
  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    c.setDimensions({ width: tam.w * zoom, height: tam.h * zoom });
    c.setZoom(zoom);
    c.requestRenderAll();
  }, [zoom, tam]);

  useEffect(() => {
    herramientaRef.current = herramienta;
    const c = lienzo.current;
    if (!c) return;
    c.isDrawingMode = herramienta === "pincel" || herramienta === "borrador";
    if (c.isDrawingMode) {
      const b = new PencilBrush(c);
      // El borrador pinta «hacia afuera»: lo que toca se vuelve transparente.
      b.color = herramienta === "borrador" ? "rgba(0,0,0,1)" : dibujo.current.color;
      b.width = dibujo.current.grosor;
      c.freeDrawingBrush = b;
    }
    c.defaultCursor = herramienta === "texto" ? "text" : herramienta === "cuentagotas" ? "crosshair" : "default";
  }, [herramienta]);

  tomarColor.current = (hex) => {
    setColor(hex);
    setHerramienta("pincel");
    avisar(`Color tomado: ${hex}`);
  };
  useEffect(() => {
    dibujo.current = { color, grosor };
    const c = lienzo.current;
    if (c?.freeDrawingBrush && herramientaRef.current !== "borrador") {
      c.freeDrawingBrush.color = color;
      c.freeDrawingBrush.width = grosor;
    }
  }, [color, grosor]);

  const restaurar = async (json: string) => {
    const c = lienzo.current!;
    cargando.current = true;
    try {
      await c.loadFromJSON(json);
      const w = Number((JSON.parse(json) as { width?: number }).width) || tam.w;
      void w;
      c.requestRenderAll();
    } finally {
      cargando.current = false;
    }
    refrescarCapas();
  };
  const deshacer = async () => {
    if (posicion.current <= 0) return;
    posicion.current -= 1;
    await restaurar(historial.current[posicion.current]!);
    setPuedeDeshacer(posicion.current > 0);
    setPuedeRehacer(true);
  };
  const rehacer = async () => {
    if (posicion.current >= historial.current.length - 1) return;
    posicion.current += 1;
    await restaurar(historial.current[posicion.current]!);
    setPuedeDeshacer(true);
    setPuedeRehacer(posicion.current < historial.current.length - 1);
  };

  const activo = (): Objeto | null => (lienzo.current?.getActiveObject() as Objeto | undefined) ?? null;
  const cambiar = (props: Record<string, unknown>) => {
    const o = activo();
    if (!o) return;
    o.set(props);
    lienzo.current?.requestRenderAll();
    refrescarCapas();
  };
  const confirmarCambio = () => {
    lienzo.current?.fire("object:modified", { target: activo() ?? undefined } as never);
  };

  const nuevoLienzo = (w: number, h: number, fondo: string | null) => {
    const c = lienzo.current!;
    cargando.current = true;
    c.clear();
    c.backgroundColor = fondo ?? "";
    cargando.current = false;
    setTam({ w, h });
    ajustarZoom(w, h);
    historial.current = [];
    posicion.current = -1;
    setProyectoId(undefined);
    setNombre("Sin título");
    foto();
    refrescarCapas();
    setModal(null);
  };

  const agregarImagen = async (url: string, nombreImagen: string, comoFondo = false) => {
    const c = lienzo.current!;
    try {
      const img = (await FabricImage.fromURL(url, { crossOrigin: "anonymous" })) as FabricImage & Objeto;
      img.nombre = nombreImagen.slice(0, 40);
      if (comoFondo && c.getObjects().length === 0) {
        setTam({ w: img.width, h: img.height });
        ajustarZoom(img.width, img.height);
        c.setDimensions({ width: img.width * zoom, height: img.height * zoom });
      } else {
        const escala = Math.min(1, (tam.w * 0.9) / img.width, (tam.h * 0.9) / img.height);
        img.scale(escala);
        img.set({ left: (tam.w - img.width * escala) / 2, top: (tam.h - img.height * escala) / 2 });
      }
      c.add(img);
      c.setActiveObject(img);
      c.requestRenderAll();
    } catch {
      avisarError(new Error("No se pudo abrir esa imagen"));
    }
  };
  const subirArchivo = (f: File) => {
    const url = URL.createObjectURL(f);
    const vacio = (lienzo.current?.getObjects().length ?? 0) === 0;
    void agregarImagen(url, f.name.replace(/\.[^.]+$/, ""), vacio).then(() => setModal(null));
  };

  const agregarForma = (h: Herramienta) => {
    const c = lienzo.current!;
    const base = { left: tam.w / 2 - 150, top: tam.h / 2 - 100, fill: color, stroke: "#000000", strokeWidth: 0 };
    let o: Objeto;
    if (h === "rectangulo") o = new Rect({ ...base, width: 300, height: 200, rx: 12, ry: 12 }) as Objeto;
    else if (h === "circulo") o = new Circle({ ...base, radius: 130 }) as Objeto;
    else if (h === "triangulo") o = new Triangle({ ...base, width: 300, height: 260 }) as Objeto;
    else o = new Line([tam.w / 2 - 200, tam.h / 2, tam.w / 2 + 200, tam.h / 2], { stroke: color, strokeWidth: 10, strokeLineCap: "round" }) as Objeto;
    c.add(o);
    c.setActiveObject(o);
    setHerramienta("seleccionar");
  };

  const elegirHerramienta = (h: Herramienta) => {
    if (h === "rectangulo" || h === "circulo" || h === "triangulo" || h === "linea") return agregarForma(h);
    setHerramienta(h);
  };

  // ---- recorte
  const iniciarRecorte = () => {
    const c = lienzo.current!;
    if (recorte.current) return;
    const r = new Rect({ left: tam.w * 0.1, top: tam.h * 0.1, width: tam.w * 0.8, height: tam.h * 0.8, fill: "rgba(59,130,246,0.15)", stroke: "#3b82f6", strokeWidth: 3, strokeDashArray: [12, 8], excludeFromExport: true, lockRotation: true, transparentCorners: false }) as Rect;
    r.set("nombre", "Recorte");
    cargando.current = true;
    c.add(r);
    cargando.current = false;
    c.setActiveObject(r);
    recorte.current = r;
    setRecortando(true);
    refrescarCapas();
  };
  const cancelarRecorte = () => {
    const c = lienzo.current!;
    if (recorte.current) {
      cargando.current = true;
      c.remove(recorte.current);
      cargando.current = false;
    }
    recorte.current = null;
    setRecortando(false);
    refrescarCapas();
  };
  const aplicarRecorte = async () => {
    const c = lienzo.current!;
    const r = recorte.current;
    if (!r) return;
    const caja = { left: Math.max(0, r.left), top: Math.max(0, r.top), width: Math.min(tam.w - r.left, r.getScaledWidth()), height: Math.min(tam.h - r.top, r.getScaledHeight()) };
    cancelarRecorte();
    const antes = { zoom: c.getZoom(), w: c.getWidth(), h: c.getHeight() };
    c.setZoom(1);
    c.setDimensions({ width: tam.w, height: tam.h });
    const url = c.toDataURL({ format: "png", multiplier: 1, ...caja });
    c.setZoom(antes.zoom);
    c.setDimensions({ width: antes.w, height: antes.h });
    cargando.current = true;
    c.clear();
    c.backgroundColor = "";
    cargando.current = false;
    setTam({ w: Math.round(caja.width), h: Math.round(caja.height) });
    ajustarZoom(caja.width, caja.height);
    const img = (await FabricImage.fromURL(url)) as FabricImage & Objeto;
    img.nombre = "Recorte";
    img.set({ left: 0, top: 0 });
    c.add(img);
    c.requestRenderAll();
    avisar("Recortado (las capas se unieron en una imagen)");
  };

  // ---- exportar y guardar
  const salida = (tipo: "png" | "jpeg" | "webp", q: number, ancho?: number): string => {
    const c = lienzo.current!;
    const antes = { zoom: c.getZoom(), w: c.getWidth(), h: c.getHeight() };
    if (recorte.current) cancelarRecorte();
    c.discardActiveObject();
    c.setZoom(1);
    c.setDimensions({ width: tam.w, height: tam.h });
    const url = c.toDataURL({ format: tipo, quality: q, multiplier: ancho ? Math.min(1, ancho / tam.w) : 1 });
    c.setZoom(antes.zoom);
    c.setDimensions({ width: antes.w, height: antes.h });
    c.requestRenderAll();
    return url;
  };
  const miniatura = () => salida("jpeg", 0.6, 180);

  const descargarLocal = async () => {
    const url = salida(formato, calidad);
    const blob = await aBlob(url);
    await guardarBlob(blob, `${nombre.replace(/[^\w.-]+/g, "_")}.${formato === "jpeg" ? "jpg" : formato}`).catch(avisarError);
    setModal(null);
  };

  const subirEstudio = async (tipo: "foto" | "imagen") => {
    setOcupado("Guardando…");
    try {
      const datos = new FormData();
      // Los campos de texto van antes del archivo.
      datos.append("tipo", tipo);
      datos.append("nombre", nombre.trim() || "Sin título");
      if (tipo === "foto" && proyectoId) datos.append("id", proyectoId);
      datos.append("miniatura", miniatura());
      if (tipo === "foto") {
        datos.append("archivo", new Blob([JSON.stringify({ ...lienzo.current!.toObject(PROPS), ancho: tam.w, alto: tam.h })], { type: "application/json" }), "proyecto.json");
      } else {
        datos.append("archivo", await aBlob(salida(formato, calidad)), `imagen.${formato === "jpeg" ? "jpg" : formato}`);
      }
      const r = await api<Guardado>("/api/estudio/proyectos", { formulario: datos });
      if (tipo === "foto") setProyectoId(r.id);
      void queryClient.invalidateQueries({ queryKey: ["estudio"] });
      avisar(tipo === "foto" ? "Proyecto guardado" : "Imagen guardada en tu biblioteca");
      setModal(null);
      return r;
    } catch (err) {
      avisarError(err);
      return null;
    } finally {
      setOcupado(null);
    }
  };

  const abrirProyecto = async (g: Guardado) => {
    setOcupado("Abriendo…");
    try {
      const datos = await api<{ ancho?: number; alto?: number } & Record<string, unknown>>(`/api/estudio/proyectos/${g.id}/datos`);
      const w = datos.ancho ?? 1080;
      const h = datos.alto ?? 1080;
      setTam({ w, h });
      ajustarZoom(w, h);
      historial.current = [];
      posicion.current = -1;
      await restaurar(JSON.stringify(datos));
      setNombre(g.nombre);
      setProyectoId(g.id);
      foto();
      setModal(null);
    } catch (err) {
      avisarError(err);
    } finally {
      setOcupado(null);
    }
  };

  // ---- quitar fondo e IA
  const quitarFondo = async () => {
    const o = activo();
    if (!esImagen(o)) return avisarError(new Error("Elige primero una imagen"));
    setOcupado("Quitando el fondo (la primera vez baja el modelo, ~40 MB)…");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const origen = o.toDataURL({ format: "png", multiplier: 1 / Math.max(o.scaleX ?? 1, 0.01) });
      const blob = await removeBackground(origen);
      const url = URL.createObjectURL(blob);
      const nueva = (await FabricImage.fromURL(url)) as FabricImage & Objeto;
      nueva.set({ left: o.left, top: o.top, angle: o.angle, scaleX: o.scaleX, scaleY: o.scaleY });
      nueva.nombre = `${nombreDe(o)} sin fondo`;
      o.set("visible", false);
      lienzo.current!.add(nueva);
      lienzo.current!.setActiveObject(nueva);
      avisar("Listo: queda como capa nueva (la original se ocultó)");
    } catch (err) {
      avisarError(err);
    } finally {
      setOcupado(null);
    }
  };
  const retocarIa = async () => {
    setOcupado("La IA está trabajando…");
    try {
      const base = salida("jpeg", 0.85, 1280);
      const r = await api<{ imagenes: string[] }>("/api/ia-creativa/imagen", { cuerpo: { prompt: promptIa, proporcion: tam.w === tam.h ? "1:1" : tam.w > tam.h ? "16:9" : "9:16", imagenes: [base] } });
      const url = r.imagenes[0];
      if (!url) throw new Error("La IA no devolvió imagen");
      const c = lienzo.current!;
      const img = (await FabricImage.fromURL(url)) as FabricImage & Objeto;
      img.nombre = "IA";
      const escala = Math.min(tam.w / img.width, tam.h / img.height);
      img.scale(escala);
      img.set({ left: (tam.w - img.width * escala) / 2, top: (tam.h - img.height * escala) / 2 });
      c.add(img);
      c.setActiveObject(img);
      setModal(null);
    } catch (err) {
      avisarError(err);
    } finally {
      setOcupado(null);
    }
  };

  const duplicar = async () => {
    const o = activo();
    if (!o) return;
    const copia = (await o.clone(PROPS)) as Objeto;
    copia.set({ left: (o.left ?? 0) + 30, top: (o.top ?? 0) + 30 });
    lienzo.current!.add(copia);
    lienzo.current!.setActiveObject(copia);
  };
  const borrar = () => {
    const c = lienzo.current!;
    for (const o of c.getActiveObjects()) c.remove(o);
    c.discardActiveObject();
    c.requestRenderAll();
  };
  const mover = (o: Objeto, arriba: boolean) => {
    const c = lienzo.current!;
    if (arriba) c.bringObjectForward(o);
    else c.sendObjectBackwards(o);
    c.requestRenderAll();
    foto();
    refrescarCapas();
  };

  // Teclado: Supr borra, Ctrl+Z / Ctrl+Y deshacen.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const objetivo = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(objetivo.tagName) || (activo() as IText | null)?.isEditing) return;
      if ((e.key === "Delete" || e.key === "Backspace") && activo()) {
        e.preventDefault();
        borrar();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void (e.shiftKey ? rehacer() : deshacer());
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        void rehacer();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        void duplicar();
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        // Atajos de Photoshop: V mover, B pincel, E borrador, I cuentagotas, T texto, R rectángulo, L línea.
        const atajos: Record<string, Herramienta> = { v: "seleccionar", b: "pincel", e: "borrador", i: "cuentagotas", t: "texto", r: "rectangulo", l: "linea" };
        const h = atajos[e.key.toLowerCase()];
        if (h) {
          e.preventDefault();
          elegirHerramienta(h);
        }
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  });
  useEffect(() => {
    const alPegar = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith("image/"));
      if (f && !/INPUT|TEXTAREA/.test((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        subirArchivo(f);
      }
    };
    window.addEventListener("paste", alPegar);
    return () => window.removeEventListener("paste", alPegar);
  });

  const sel = seleccion;
  const texto = sel && (sel.type === "i-text" || sel.type === "itext") ? (sel as IText) : null;
  const ajustes = sel && esImagen(sel) ? (sel.ajustes ?? AJUSTES_INICIALES) : null;
  const cambiarAjuste = (k: keyof Ajustes, v: number | boolean) => {
    if (!sel || !esImagen(sel)) return;
    aplicarFiltros(sel, { ...(sel.ajustes ?? AJUSTES_INICIALES), [k]: v });
    lienzo.current?.requestRenderAll();
    refrescarCapas();
  };

  const HERRAMIENTAS: { id: Herramienta; icono: typeof Square; texto: string; atajo?: string }[] = [
    { id: "seleccionar", icono: MousePointer2, texto: "Seleccionar y mover", atajo: "V" },
    { id: "pincel", icono: Paintbrush, texto: "Pincel", atajo: "B" },
    { id: "borrador", icono: Eraser, texto: "Borrador", atajo: "E" },
    { id: "cuentagotas", icono: Pipette, texto: "Cuentagotas (toma un color del lienzo)", atajo: "I" },
    { id: "texto", icono: TextoIcono, texto: "Texto (toca el lienzo)", atajo: "T" },
    { id: "rectangulo", icono: Square, texto: "Rectángulo", atajo: "R" },
    { id: "circulo", icono: CirculoIcono, texto: "Círculo" },
    { id: "triangulo", icono: TrianguloIcono, texto: "Triángulo" },
    { id: "linea", icono: Minus, texto: "Línea", atajo: "L" },
  ];

  return (
    <div className="space-y-3">
      <Encabezado titulo="Editor de fotos" descripcion="Capas, texto, formas, filtros, recorte, quitar fondo e IA. Guarda tus proyectos en tu cuenta." />
      <div className="flex flex-wrap items-center gap-1">
        <Boton tamano="sm" icono={FilePlus2} onClick={() => setModal("nuevo")}>
          Nuevo
        </Boton>
        <Boton tamano="sm" icono={FolderOpen} onClick={() => setModal("abrir")}>
          Abrir
        </Boton>
        <Boton tamano="sm" variante="primario" icono={Save} onClick={() => setModal("guardar")}>
          Guardar
        </Boton>
        <Boton tamano="sm" icono={Download} onClick={() => setModal("exportar")}>
          Exportar
        </Boton>
        <span className="mx-1 h-5 w-px bg-borde" />
        <Boton tamano="icono" variante="fantasma" icono={Undo2} aria-label="Deshacer" disabled={!puedeDeshacer} onClick={() => void deshacer()} />
        <Boton tamano="icono" variante="fantasma" icono={Redo2} aria-label="Rehacer" disabled={!puedeRehacer} onClick={() => void rehacer()} />
        <span className="mx-1 h-5 w-px bg-borde" />
        <Boton tamano="icono" variante="fantasma" icono={Minus} aria-label="Alejar" onClick={() => setZoom((z) => Math.max(0.05, z - 0.1))} />
        <span className="w-12 text-center text-xs text-tenue">{Math.round(zoom * 100)}%</span>
        <Boton tamano="icono" variante="fantasma" icono={Plus} aria-label="Acercar" onClick={() => setZoom((z) => Math.min(2, z + 0.1))} />
        <Boton tamano="sm" variante="fantasma" onClick={() => ajustarZoom(tam.w, tam.h)}>
          Ajustar
        </Boton>
        <span className="ml-auto truncate text-xs text-tenue">
          {nombre} · {tam.w}×{tam.h}
        </span>
      </div>
      {ocupado ? <p className="text-xs text-tenue">{ocupado}</p> : null}

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[auto_1fr_300px]">
      {/* Herramientas: barra vertical en PC (como Photoshop) y fila deslizable en el celular. */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-tarjeta border border-borde bg-superficie p-1.5 lg:h-fit lg:w-14 lg:flex-col lg:overflow-visible">
        {HERRAMIENTAS.map((h) => (
          <Boton key={h.id} tamano="icono" variante={herramienta === h.id ? "primario" : "fantasma"} icono={h.icono} aria-label={h.texto} title={`${h.texto}${h.atajo ? ` (${h.atajo})` : ""}`} onClick={() => elegirHerramienta(h.id)} />
        ))}
        <span className="mx-1 h-5 w-px shrink-0 bg-borde lg:mx-0 lg:my-1 lg:h-px lg:w-8" />
        <label className="flex shrink-0 items-center gap-1 text-xs text-tenue lg:flex-col" title="Color">
          <span className="lg:hidden">Color</span>
          <input type="color" value={color} onChange={(e) => { setColor(e.target.value); if (sel && !esImagen(sel)) cambiar({ fill: e.target.value }); }} className="h-7 w-9 cursor-pointer rounded border border-borde bg-transparent" />
        </label>
        {herramienta === "pincel" || herramienta === "borrador" ? (
          <label className="flex shrink-0 items-center gap-1 text-xs text-tenue lg:flex-col" title="Grosor">
            <span>{grosor}px</span>
            <input type="range" min={1} max={150} value={grosor} onChange={(e) => setGrosor(Number(e.target.value))} className="w-24 accent-acento lg:w-12" />
          </label>
        ) : null}
        <span className="mx-1 h-5 w-px shrink-0 bg-borde lg:mx-0 lg:my-1 lg:h-px lg:w-8" />
        <Boton tamano="icono" variante="fantasma" icono={ImagePlus} aria-label="Agregar imagen" title="Agregar imagen" onClick={() => setModal("abrir")} />
        <Boton tamano="icono" variante="fantasma" icono={Crop} aria-label="Recortar" title="Recortar" onClick={iniciarRecorte} />
        <Boton tamano="icono" variante="fantasma" icono={Scissors} aria-label="Quitar fondo" title="Quitar fondo de la imagen elegida" onClick={() => void quitarFondo()} />
        <Boton tamano="icono" variante="fantasma" icono={Sparkles} aria-label="Retocar con IA" title="Retocar con IA" onClick={() => setModal("ia")} />
        {recortando ? (
          <>
            <Boton tamano="sm" variante="primario" onClick={() => void aplicarRecorte()}>
              Aplicar recorte
            </Boton>
            <Boton tamano="sm" variante="fantasma" onClick={cancelarRecorte}>
              Cancelar
            </Boton>
          </>
        ) : null}
      </div>

        <div ref={contenedor} className="flex min-h-[40vh] items-start justify-center overflow-auto rounded-tarjeta border border-borde p-3" style={{ background: "repeating-conic-gradient(#2a2a2e 0% 25%, #232327 0% 50%) 0 0 / 20px 20px" }}>
          <div className="shadow-2xl">
            <canvas ref={elemento} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex gap-1 text-sm lg:hidden">
            <button type="button" onClick={() => setPanel("propiedades")} className={cx("flex-1 rounded-xl border px-3 py-1.5", panel === "propiedades" ? "border-acento bg-tarjeta" : "border-borde")}>
              Propiedades
            </button>
            <button type="button" onClick={() => setPanel("capas")} className={cx("flex-1 rounded-xl border px-3 py-1.5", panel === "capas" ? "border-acento bg-tarjeta" : "border-borde")}>
              Capas ({capas.length})
            </button>
          </div>

          <div className={cx(panel === "capas" ? "" : "hidden", "lg:block")}>
            <Tarjeta titulo="Capas">
              {capas.length === 0 ? <p className="text-xs text-tenue">Todavía no hay capas: agrega texto, formas o una imagen.</p> : null}
              <ul className="max-h-[50vh] space-y-1 overflow-auto">
                {capas.map((o, i) => (
                  <li key={i} className={cx("flex items-center gap-1 rounded-lg border px-2 py-1 text-xs", sel === o ? "border-acento bg-tarjeta" : "border-borde")}>
                    <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => { lienzo.current!.setActiveObject(o); refrescarCapas(); }}>
                      {nombreDe(o)}
                    </button>
                    <button type="button" aria-label="Mostrar u ocultar" onClick={() => { o.set("visible", !o.visible); lienzo.current!.requestRenderAll(); foto(); refrescarCapas(); }}>
                      {o.visible === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      aria-label="Bloquear"
                      onClick={() => {
                        const cerrado = !o.lockMovementX;
                        o.set({ lockMovementX: cerrado, lockMovementY: cerrado, lockRotation: cerrado, lockScalingX: cerrado, lockScalingY: cerrado, hasControls: !cerrado });
                        lienzo.current!.requestRenderAll();
                        refrescarCapas();
                      }}
                    >
                      {o.lockMovementX ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                    </button>
                    <button type="button" aria-label="Subir" disabled={i === 0} onClick={() => mover(o, true)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" aria-label="Bajar" disabled={i === capas.length - 1} onClick={() => mover(o, false)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </Tarjeta>
          </div>
          <div className={cx(panel === "capas" ? "hidden" : "", "lg:block")}>
            <Tarjeta titulo={sel ? nombreDe(sel) : "Propiedades"}>
              {!sel ? <p className="text-xs text-tenue">Elige algo del lienzo para cambiar su color, tamaño, filtros y más.</p> : null}
              {sel ? (
                <div className="space-y-3 text-xs">
                  <div className="flex flex-wrap gap-1">
                    <Boton tamano="icono" variante="fantasma" icono={Copy} aria-label="Duplicar (Ctrl+D)" title="Duplicar" onClick={() => void duplicar()} />
                    <Boton tamano="icono" variante="fantasma" icono={RotateCw} aria-label="Girar 90°" title="Girar 90°" onClick={() => { cambiar({ angle: ((sel.angle ?? 0) + 90) % 360 }); confirmarCambio(); }} />
                    <Boton tamano="icono" variante="fantasma" icono={FlipHorizontal2} aria-label="Voltear horizontal" title="Voltear horizontal" onClick={() => { cambiar({ flipX: !sel.flipX }); confirmarCambio(); }} />
                    <Boton tamano="icono" variante="fantasma" icono={FlipVertical2} aria-label="Voltear vertical" title="Voltear vertical" onClick={() => { cambiar({ flipY: !sel.flipY }); confirmarCambio(); }} />
                    <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar (Supr)" title="Borrar" onClick={borrar} />
                  </div>
                  <Campo etiqueta={`Opacidad: ${Math.round((sel.opacity ?? 1) * 100)}%`}>
                    <input type="range" min={0} max={1} step={0.05} value={sel.opacity ?? 1} onChange={(e) => cambiar({ opacity: Number(e.target.value) })} onPointerUp={confirmarCambio} className="w-full accent-acento" />
                  </Campo>
                  <Campo etiqueta="Mezcla">
                    <Selector value={sel.globalCompositeOperation ?? "source-over"} onChange={(e) => { cambiar({ globalCompositeOperation: e.target.value }); confirmarCambio(); }}>
                      {MEZCLAS.map(([v, n]) => (
                        <option key={v} value={v}>
                          {n}
                        </option>
                      ))}
                    </Selector>
                  </Campo>
                  {!esImagen(sel) && sel.type !== "path" && sel.type !== "line" ? (
                    <>
                      <Campo etiqueta="Relleno">
                        <input type="color" value={typeof sel.fill === "string" && sel.fill.startsWith("#") ? sel.fill : "#000000"} onChange={(e) => cambiar({ fill: e.target.value })} onBlur={confirmarCambio} className="h-8 w-full cursor-pointer rounded border border-borde bg-transparent" />
                      </Campo>
                      <Campo etiqueta={`Borde: ${sel.strokeWidth ?? 0}px`}>
                        <input type="range" min={0} max={40} value={sel.strokeWidth ?? 0} onChange={(e) => cambiar({ strokeWidth: Number(e.target.value) })} onPointerUp={confirmarCambio} className="w-full accent-acento" />
                      </Campo>
                      <Campo etiqueta="Color del borde">
                        <input type="color" value={typeof sel.stroke === "string" && sel.stroke.startsWith("#") ? sel.stroke : "#000000"} onChange={(e) => cambiar({ stroke: e.target.value })} onBlur={confirmarCambio} className="h-8 w-full cursor-pointer rounded border border-borde bg-transparent" />
                      </Campo>
                    </>
                  ) : null}
                  {sel.type === "line" || sel.type === "path" ? (
                    <>
                      <Campo etiqueta="Color">
                        <input type="color" value={typeof sel.stroke === "string" && sel.stroke.startsWith("#") ? sel.stroke : "#000000"} onChange={(e) => cambiar({ stroke: e.target.value })} onBlur={confirmarCambio} className="h-8 w-full cursor-pointer rounded border border-borde bg-transparent" />
                      </Campo>
                      <Campo etiqueta={`Grosor: ${sel.strokeWidth ?? 1}px`}>
                        <input type="range" min={1} max={80} value={sel.strokeWidth ?? 1} onChange={(e) => cambiar({ strokeWidth: Number(e.target.value) })} onPointerUp={confirmarCambio} className="w-full accent-acento" />
                      </Campo>
                    </>
                  ) : null}
                  {texto ? (
                    <>
                      <Campo etiqueta="Fuente">
                        <Selector value={texto.fontFamily ?? "Inter"} onChange={(e) => { cambiar({ fontFamily: e.target.value }); confirmarCambio(); }}>
                          {FUENTES.map((f) => (
                            <option key={f} value={f} style={{ fontFamily: f }}>
                              {f}
                            </option>
                          ))}
                        </Selector>
                      </Campo>
                      <Campo etiqueta={`Tamaño: ${Math.round(texto.fontSize ?? 32)}`}>
                        <input type="range" min={8} max={300} value={texto.fontSize ?? 32} onChange={(e) => cambiar({ fontSize: Number(e.target.value) })} onPointerUp={confirmarCambio} className="w-full accent-acento" />
                      </Campo>
                      <div className="flex gap-1">
                        <Boton tamano="sm" variante={texto.fontWeight === "bold" ? "primario" : "fantasma"} onClick={() => { cambiar({ fontWeight: texto.fontWeight === "bold" ? "normal" : "bold" }); confirmarCambio(); }}>
                          <b>N</b>
                        </Boton>
                        <Boton tamano="sm" variante={texto.fontStyle === "italic" ? "primario" : "fantasma"} onClick={() => { cambiar({ fontStyle: texto.fontStyle === "italic" ? "normal" : "italic" }); confirmarCambio(); }}>
                          <i>K</i>
                        </Boton>
                        <Boton tamano="sm" variante={texto.underline ? "primario" : "fantasma"} onClick={() => { cambiar({ underline: !texto.underline }); confirmarCambio(); }}>
                          <u>S</u>
                        </Boton>
                        {(["left", "center", "right"] as const).map((al) => (
                          <Boton key={al} tamano="sm" variante={texto.textAlign === al ? "primario" : "fantasma"} onClick={() => { cambiar({ textAlign: al }); confirmarCambio(); }}>
                            {al === "left" ? "⇤" : al === "center" ? "↔" : "⇥"}
                          </Boton>
                        ))}
                      </div>
                    </>
                  ) : null}
                  {ajustes ? (
                    <div className="space-y-2 border-t border-borde pt-3">
                      <p className="font-semibold">Ajustes de imagen</p>
                      {(
                        [
                          ["brillo", "Brillo", -1, 1, 0.05],
                          ["contraste", "Contraste", -1, 1, 0.05],
                          ["saturacion", "Saturación", -1, 1, 0.05],
                          ["matiz", "Matiz", -1, 1, 0.05],
                          ["desenfoque", "Desenfoque", 0, 1, 0.05],
                          ["pixelar", "Pixelar", 0, 40, 1],
                        ] as const
                      ).map(([k, n, mn, mx, st]) => (
                        <Campo key={k} etiqueta={`${n}: ${ajustes[k]}`}>
                          <input type="range" min={mn} max={mx} step={st} value={ajustes[k]} onChange={(e) => cambiarAjuste(k, Number(e.target.value))} onPointerUp={confirmarCambio} className="w-full accent-acento" />
                        </Campo>
                      ))}
                      <div className="flex flex-wrap gap-1">
                        {(
                          [
                            ["grises", "Blanco y negro"],
                            ["sepia", "Sepia"],
                            ["invertir", "Invertir"],
                          ] as const
                        ).map(([k, n]) => (
                          <Boton key={k} tamano="sm" variante={ajustes[k] ? "primario" : "fantasma"} onClick={() => { cambiarAjuste(k, !ajustes[k]); confirmarCambio(); }}>
                            {n}
                          </Boton>
                        ))}
                        <Boton tamano="sm" variante="fantasma" onClick={() => { if (esImagen(sel)) { aplicarFiltros(sel, AJUSTES_INICIALES); lienzo.current?.requestRenderAll(); refrescarCapas(); confirmarCambio(); } }}>
                          Quitar filtros
                        </Boton>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Tarjeta>
          </div>
        </div>
      </div>

      {modal === "nuevo" ? (
        <Modal abierto titulo="Lienzo nuevo" alCerrar={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-1">
              {TAMANOS.map((t) => (
                <button key={t.n} type="button" onClick={() => setNuevoTam({ ...nuevoTam, w: t.w, h: t.h })} className={cx("rounded-xl border px-3 py-2 text-left text-sm", nuevoTam.w === t.w && nuevoTam.h === t.h ? "border-acento bg-tarjeta" : "border-borde")}>
                  {t.n}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Ancho (px)">
                <Entrada type="number" min={16} max={6000} value={nuevoTam.w} onChange={(e) => setNuevoTam({ ...nuevoTam, w: Number(e.target.value) })} />
              </Campo>
              <Campo etiqueta="Alto (px)">
                <Entrada type="number" min={16} max={6000} value={nuevoTam.h} onChange={(e) => setNuevoTam({ ...nuevoTam, h: Number(e.target.value) })} />
              </Campo>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                Fondo
                <input type="color" value={nuevoTam.fondo} onChange={(e) => setNuevoTam({ ...nuevoTam, fondo: e.target.value, transparente: false })} className="h-8 w-10 rounded border border-borde bg-transparent" />
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={nuevoTam.transparente} onChange={(e) => setNuevoTam({ ...nuevoTam, transparente: e.target.checked })} /> Transparente
              </label>
            </div>
            <Boton variante="primario" onClick={() => nuevoLienzo(Math.min(6000, Math.max(16, nuevoTam.w)), Math.min(6000, Math.max(16, nuevoTam.h)), nuevoTam.transparente ? null : nuevoTam.fondo)}>
              Crear lienzo
            </Boton>
          </div>
        </Modal>
      ) : null}

      {modal === "abrir" ? <Abrir alCerrar={() => setModal(null)} alAbrirProyecto={(g) => void abrirProyecto(g)} alAgregarImagen={(u, n) => void agregarImagen(u, n).then(() => setModal(null))} alSubir={subirArchivo} /> : null}

      {modal === "guardar" ? (
        <Modal abierto titulo="Guardar proyecto" alCerrar={() => setModal(null)}>
          <div className="space-y-3">
            <Campo etiqueta="Nombre">
              <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />
            </Campo>
            <p className="text-xs text-tenue">Se guarda en tu cuenta con todas sus capas para seguir editando en la PC o el celular.{proyectoId ? " Esto actualiza el proyecto abierto." : ""}</p>
            <div className="flex flex-wrap gap-2">
              <Boton variante="primario" icono={Save} cargando={Boolean(ocupado)} onClick={() => void subirEstudio("foto")}>
                Guardar proyecto
              </Boton>
              <Boton icono={Download} cargando={Boolean(ocupado)} onClick={() => void subirEstudio("imagen")}>
                Guardar también como imagen
              </Boton>
            </div>
          </div>
        </Modal>
      ) : null}

      {modal === "exportar" ? (
        <Modal abierto titulo="Exportar imagen" alCerrar={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Campo etiqueta="Formato">
                <Selector value={formato} onChange={(e) => setFormato(e.target.value as typeof formato)}>
                  <option value="png">PNG (con transparencia)</option>
                  <option value="jpeg">JPG (más liviano)</option>
                  <option value="webp">WebP</option>
                </Selector>
              </Campo>
              <Campo etiqueta={`Calidad: ${Math.round(calidad * 100)}%`}>
                <input type="range" min={0.3} max={1} step={0.02} value={calidad} onChange={(e) => setCalidad(Number(e.target.value))} className="w-full accent-acento" disabled={formato === "png"} />
              </Campo>
            </div>
            <Campo etiqueta="Nombre del archivo">
              <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} />
            </Campo>
            <div className="flex flex-wrap gap-2">
              <Boton variante="primario" icono={Download} onClick={() => void descargarLocal()}>
                Descargar
              </Boton>
              <Boton
                icono={Save}
                cargando={Boolean(ocupado)}
                onClick={async () => {
                  const r = await subirEstudio("imagen");
                  if (r) abrirExterno(`${API_BASE}${r.url}`);
                }}
              >
                Guardar en mi biblioteca y abrir
              </Boton>
            </div>
            <p className="text-xs text-tenue">En el celular, si «Descargar» no baja el archivo, usa «Guardar en mi biblioteca y abrir»: se abre la imagen y la guardas desde ahí.</p>
          </div>
        </Modal>
      ) : null}

      {modal === "ia" ? (
        <Modal abierto titulo="Retocar con IA (Nano Banana)" alCerrar={() => setModal(null)}>
          <div className="space-y-3">
            <p className="text-xs text-tenue">La IA recibe tu imagen completa y lo que pidas, y devuelve una versión nueva como capa. Necesita la clave de Gemini en Ajustes → Servicios.</p>
            <Campo etiqueta="¿Qué quieres cambiar?">
              <Entrada value={promptIa} onChange={(e) => setPromptIa(e.target.value)} placeholder="Ponle un fondo de playa al atardecer" maxLength={400} />
            </Campo>
            <Boton variante="primario" icono={Sparkles} cargando={Boolean(ocupado)} disabled={promptIa.trim().length < 3} onClick={() => void retocarIa()}>
              Retocar
            </Boton>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
