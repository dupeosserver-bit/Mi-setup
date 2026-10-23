import { useQuery } from "@tanstack/react-query";
import { Canvas, Circle, FabricImage, IText, Line, PencilBrush, Rect, Shadow, Triangle, filters, type FabricObject } from "fabric";
import {
  ArrowDown,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUp,
  Circle as CirculoIcono,
  Copy,
  Crop,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FilePlus2,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Hand,
  History,
  ImagePlus,
  Layers,
  Lock,
  LockOpen,
  Minus,
  MousePointer2,
  PaintBucket,
  Paintbrush,
  Pipette,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Triangle as TrianguloIcono,
  Type as TextoIcono,
  Undo2,
  X,
  ZoomIn,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as EventoPuntero, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePaginado } from "../components/Paginas";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient } from "../lib/consultas";
import { fmtBytes } from "../lib/formato";
import { FORMAS, MEZCLAS, TAMANOS, agregarPaso, colorConOpacidad, desenfoqueDeDureza, medidaValida, nombreMezcla, siguienteZoom, type Herramienta, type PasoHistorial } from "../lib/fotos";
import { guardarBlob } from "../lib/guardar";
import { useForma, useModoPagina } from "../lib/marco";
import { abrirExterno } from "../lib/plataforma";

type Objeto = FabricObject & { nombre?: string; ajustes?: Ajustes };
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
const CUADROS = "repeating-conic-gradient(#2a2a2e 0% 25%, #232327 0% 50%) 0 0 / 20px 20px";

const esImagen = (o: FabricObject | undefined | null): o is FabricImage & Objeto => Boolean(o) && o!.type?.toLowerCase() === "image";
const esTexto = (o: FabricObject | undefined | null): o is IText & Objeto => Boolean(o) && (o!.type === "i-text" || o!.type === "itext");
const nombreDe = (o: Objeto): string =>
  o.nombre ?? (esImagen(o) ? "Imagen" : esTexto(o) ? `Texto «${(o as IText).text?.slice(0, 16) ?? ""}»` : o.type === "rect" ? "Rectángulo" : o.type === "circle" ? "Círculo" : o.type === "triangle" ? "Triángulo" : o.type === "line" ? "Línea" : o.type === "path" ? "Trazo" : "Objeto");
const iconoDe = (o: Objeto): LucideIcon => (esImagen(o) ? ImagePlus : esTexto(o) ? TextoIcono : o.type === "rect" ? Square : o.type === "circle" ? CirculoIcono : o.type === "triangle" ? TrianguloIcono : o.type === "line" ? Minus : Paintbrush);

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

type Arranque = { tipo: "nuevo"; w: number; h: number; fondo: string | null } | { tipo: "proyecto"; g: Guardado } | { tipo: "archivo"; f: File } | { tipo: "imagen"; url: string; nombre: string };

const HERRAMIENTAS: { id: Herramienta; icono: LucideIcon; texto: string; atajo?: string }[] = [
  { id: "seleccionar", icono: MousePointer2, texto: "Seleccionar y mover", atajo: "V" },
  { id: "recortar", icono: Crop, texto: "Recortar", atajo: "C" },
  { id: "pincel", icono: Paintbrush, texto: "Pincel", atajo: "B" },
  { id: "borrador", icono: Eraser, texto: "Borrador", atajo: "E" },
  { id: "texto", icono: TextoIcono, texto: "Texto (toca el lienzo)", atajo: "T" },
  { id: "rectangulo", icono: Square, texto: "Rectángulo", atajo: "R" },
  { id: "circulo", icono: CirculoIcono, texto: "Círculo" },
  { id: "triangulo", icono: TrianguloIcono, texto: "Triángulo" },
  { id: "linea", icono: Minus, texto: "Línea", atajo: "L" },
  { id: "cuentagotas", icono: Pipette, texto: "Cuentagotas (toma un color del lienzo)", atajo: "I" },
  { id: "relleno", icono: PaintBucket, texto: "Relleno (pinta una capa o el fondo)", atajo: "G" },
  { id: "mano", icono: Hand, texto: "Mano (mueve la vista)", atajo: "H" },
  { id: "zoom", icono: ZoomIn, texto: "Zoom (toca para acercar, con Alt alejas)", atajo: "Z" },
];

// ---------------------------------------------------------------- menús de arriba

type OpcionMenu = { texto: string; atajo?: string; accion: () => void; apagado?: boolean } | "-";

function MenuArriba({ texto, opciones }: { texto: string; opciones: OpcionMenu[] }) {
  const boton = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!pos) return;
    const cerrar = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-menu-fotos]")) setPos(null);
    };
    window.addEventListener("pointerdown", cerrar);
    return () => window.removeEventListener("pointerdown", cerrar);
  }, [pos]);
  const abrir = () => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    setPos(pos ? null : { x: Math.min(r.left, window.innerWidth - 240), y: r.bottom + 4 });
  };
  return (
    <>
      <button ref={boton} type="button" data-menu-fotos onClick={abrir} className={cx("shrink-0 rounded-lg px-2.5 py-1 text-sm", pos ? "bg-tarjeta text-texto" : "text-tenue hover:bg-tarjeta hover:text-texto")}>
        {texto}
      </button>
      {pos
        ? createPortal(
            <div data-menu-fotos className="fixed z-[70] w-56 rounded-xl border border-borde bg-superficie p-1 shadow-2xl" style={{ left: pos.x, top: pos.y }} role="menu">
              {opciones.map((o, i) =>
                o === "-" ? (
                  <div key={`s${i}`} className="my-1 h-px bg-borde" />
                ) : (
                  <button
                    key={o.texto}
                    type="button"
                    role="menuitem"
                    disabled={o.apagado}
                    onClick={() => {
                      setPos(null);
                      o.accion();
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-sm hover:bg-tarjeta disabled:opacity-40"
                  >
                    <span>{o.texto}</span>
                    {o.atajo ? <span className="font-mono text-[11px] text-tenue">{o.atajo}</span> : null}
                  </button>
                ),
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// ---------------------------------------------------------------- abrir

function Abrir({ alCerrar, alAbrirProyecto, alAgregarImagen, alSubir }: { alCerrar: () => void; alAbrirProyecto: (g: Guardado) => void; alAgregarImagen: (url: string, nombre: string) => void; alSubir: (f: File) => void }) {
  const [tab, setTab] = useState<"foto" | "imagen">("foto");
  const q = useQuery({ queryKey: ["estudio", tab], queryFn: () => api<Guardado[]>(`/api/estudio/proyectos?tipo=${tab}`) });
  const entrada = useRef<HTMLInputElement>(null);
  const { visibles, paginas } = usePaginado(q.data, 9);
  return (
    <Modal abierto titulo="Abrir" alCerrar={alCerrar}>
      <div className="space-y-3">
        <Boton icono={ImagePlus} onClick={() => entrada.current?.click()}>
          Foto de mi dispositivo
        </Boton>
        <input ref={entrada} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && alSubir(e.target.files[0])} />
        <Pestanas
          valor={tab}
          alCambiar={setTab}
          opciones={[
            { id: "foto", texto: "Mis proyectos" },
            { id: "imagen", texto: "Imágenes guardadas" },
          ]}
        />
        <ErrorCaja error={q.error} />
        {q.isLoading ? <Cargando /> : null}
        {q.data?.length === 0 ? <Vacio icono={FolderOpen} texto={tab === "foto" ? "Todavía no guardas proyectos." : "Todavía no guardas imágenes."} /> : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {visibles.map((g) => (
            <button key={g.id} type="button" className="rounded-xl border border-borde p-1 text-left hover:border-acento" onClick={() => (tab === "foto" ? alAbrirProyecto(g) : alAgregarImagen(`${API_BASE}${g.url}`, g.nombre))}>
              {g.miniatura ? <img src={g.miniatura} alt="" className="aspect-square w-full rounded-lg bg-fondo object-cover" /> : <div className="aspect-square rounded-lg bg-fondo" />}
              <p className="mt-1 truncate text-xs">{g.nombre}</p>
              <p className="text-[10px] text-tenue">{fmtBytes(g.tamano)}</p>
            </button>
          ))}
        </div>
        {paginas}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- galería

function MuestraTamano({ w, h }: { w: number; h: number }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-fondo">
      <i className="block rounded-[3px] border-2 border-acento" style={{ aspectRatio: `${w}/${h}`, [w >= h ? "width" : "height"]: "70%" }} />
    </span>
  );
}

function Galeria({ alAbrir }: { alAbrir: (a: Arranque) => void }) {
  const [tab, setTab] = useState<"foto" | "imagen">("foto");
  const [buscar, setBuscar] = useState("");
  const [nuevo, setNuevo] = useState({ w: 1080, h: 1080, fondo: "#ffffff", transparente: false });
  const entrada = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ["estudio", tab], queryFn: () => api<Guardado[]>(`/api/estudio/proyectos?tipo=${tab}`) });
  const filtrados = q.data?.filter((g) => g.nombre.toLowerCase().includes(buscar.trim().toLowerCase()));
  const { visibles, paginas } = usePaginado(filtrados, 12);
  const crear = () => alAbrir({ tipo: "nuevo", w: medidaValida(nuevo.w), h: medidaValida(nuevo.h), fondo: nuevo.transparente ? null : nuevo.fondo });

  return (
    <div>
      <Encabezado
        titulo="Editor de fotos"
        descripcion="Crea, retoca y exporta tus imágenes con capas, pinceles, filtros e IA. Todo queda en tu biblioteca."
        acciones={
          <>
            <Boton icono={FolderOpen} onClick={() => entrada.current?.click()}>
              Abrir foto
            </Boton>
            <Boton variante="primario" icono={FilePlus2} onClick={() => alAbrir({ tipo: "nuevo", w: 1080, h: 1080, fondo: "#ffffff" })}>
              Lienzo nuevo
            </Boton>
          </>
        }
      />
      <input ref={entrada} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && alAbrir({ tipo: "archivo", f: e.target.files[0] })} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Tarjeta titulo="Lienzo nuevo" icono={FilePlus2} className="h-fit">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {TAMANOS.map((t) => (
              <button
                key={t.n}
                type="button"
                onClick={() => setNuevo({ ...nuevo, w: t.w, h: t.h })}
                className={cx("flex items-center gap-3 rounded-xl border px-2.5 py-2 text-left", nuevo.w === t.w && nuevo.h === t.h ? "border-acento bg-tarjeta" : "border-borde hover:bg-tarjeta")}
              >
                <MuestraTamano w={t.w} h={t.h} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{t.n}</span>
                  <span className="block text-xs text-tenue">
                    {t.w}×{t.h}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <Campo etiqueta="Ancho (px)">
              <Entrada type="number" min={16} max={6000} value={nuevo.w} onChange={(e) => setNuevo({ ...nuevo, w: Number(e.target.value) })} />
            </Campo>
            <span className="pb-2.5 text-tenue">×</span>
            <Campo etiqueta="Alto (px)">
              <Entrada type="number" min={16} max={6000} value={nuevo.h} onChange={(e) => setNuevo({ ...nuevo, h: Number(e.target.value) })} />
            </Campo>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              Fondo
              <input type="color" value={nuevo.fondo} onChange={(e) => setNuevo({ ...nuevo, fondo: e.target.value, transparente: false })} className="h-8 w-10 cursor-pointer rounded border border-borde bg-transparent" />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={nuevo.transparente} onChange={(e) => setNuevo({ ...nuevo, transparente: e.target.checked })} /> Transparente
            </label>
          </div>
          <Boton variante="primario" icono={Plus} className="mt-3 w-full" onClick={crear}>
            Crear lienzo
          </Boton>
        </Tarjeta>
        <Tarjeta
          titulo={
            <span className="flex gap-1">
              {(
                [
                  ["foto", "Proyectos", Layers],
                  ["imagen", "Mis imágenes", ImagePlus],
                ] as const
              ).map(([id, texto, Icono]) => (
                <button key={id} type="button" onClick={() => setTab(id)} className={cx("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm", tab === id ? "bg-tarjeta text-texto" : "text-tenue hover:text-texto")}>
                  <Icono className="h-4 w-4" />
                  {texto}
                </button>
              ))}
            </span>
          }
          acciones={
            <label className="flex w-full items-center gap-2 rounded-xl border border-borde bg-fondo px-3 sm:w-56">
              <Search className="h-4 w-4 text-tenue" />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" />
            </label>
          }
        >
          <ErrorCaja error={q.error} />
          {q.isLoading ? <Cargando /> : null}
          {filtrados?.length === 0 ? <Vacio icono={tab === "foto" ? Layers : ImagePlus} texto={buscar ? "No hay nada con ese nombre." : tab === "foto" ? "Todavía no guardas proyectos. Crea un lienzo o abre una foto." : "Todavía no guardas imágenes."} /> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visibles.map((g) => (
              <div key={g.id} className="group relative">
                <button type="button" className="block w-full text-left" onClick={() => alAbrir(tab === "foto" ? { tipo: "proyecto", g } : { tipo: "imagen", url: `${API_BASE}${g.url}`, nombre: g.nombre })}>
                  <span className="block aspect-[4/3] overflow-hidden rounded-xl border border-borde bg-fondo" style={{ background: CUADROS }}>
                    {g.miniatura ? <img src={g.miniatura} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" /> : null}
                  </span>
                  <span className="mt-1.5 block truncate text-sm font-medium">{g.nombre}</span>
                  <span className="block text-xs text-tenue">
                    {fmtBytes(g.tamano)} · {new Date(g.actualizado).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Borrar ${g.nombre}`}
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
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
          {paginas}
        </Tarjeta>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- piezas del editor

function Deslizador({ etiqueta, valor, min, max, paso = 1, sufijo = "", alCambiar, alSoltar }: { etiqueta: string; valor: number; min: number; max: number; paso?: number; sufijo?: string; alCambiar: (v: number) => void; alSoltar?: () => void }) {
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs text-tenue">
      <span className="shrink-0">{etiqueta}</span>
      <input type="range" min={min} max={max} step={paso} value={valor} onChange={(e) => alCambiar(Number(e.target.value))} onPointerUp={alSoltar} className="w-20 min-w-0 accent-acento sm:w-24" />
      <span className="w-12 shrink-0 text-right font-mono text-texto">
        {paso < 1 ? valor.toFixed(2) : valor}
        {sufijo}
      </span>
    </label>
  );
}

function Seccion({ titulo, icono: Icono, children, className }: { titulo: string; icono: LucideIcon; children: ReactNode; className?: string }) {
  return (
    <section className={cx("min-h-0 border-b border-borde", className)}>
      <h3 className="flex items-center gap-2 px-3 pb-1.5 pt-3 text-[11px] font-bold uppercase tracking-wider text-tenue">
        <Icono className="h-3.5 w-3.5" />
        {titulo}
      </h3>
      <div className="px-3 pb-3">{children}</div>
    </section>
  );
}

const colorHex = (v: unknown, otro = "#000000") => (typeof v === "string" && v.startsWith("#") ? v : otro);

// ---------------------------------------------------------------- editor

function Editor({ arranque, alSalir }: { arranque: Arranque; alSalir: () => void }) {
  const forma = useForma();
  const ancho = forma === "pc";
  const area = useRef<HTMLDivElement>(null);
  const elemento = useRef<HTMLCanvasElement>(null);
  const lienzo = useRef<Canvas | null>(null);
  const historial = useRef<PasoHistorial[]>([]);
  const posicion = useRef(-1);
  const cargando = useRef(false);
  const recorte = useRef<Rect | null>(null);
  const herramientaRef = useRef<Herramienta>("seleccionar");
  const pincelRef = useRef({ color: "#ef4444", grosor: 12, dureza: 100, opacidad: 100, mezcla: "source-over" });
  const tomarColor = useRef<(hex: string) => void>(() => undefined);
  const arrastre = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);

  const [tam, setTam] = useState({ w: 1080, h: 1080 });
  const [zoom, setZoom] = useState(0.5);
  const [herramienta, setHerramienta] = useState<Herramienta>("seleccionar");
  const [frente, setFrente] = useState("#ef4444");
  const [fondoColor, setFondoColor] = useState("#ffffff");
  const [grosor, setGrosor] = useState(12);
  const [dureza, setDureza] = useState(100);
  const [opacidadPincel, setOpacidadPincel] = useState(100);
  const [mezclaPincel, setMezclaPincel] = useState("source-over");
  const [, redibujar] = useState(0);
  const [seleccion, setSeleccion] = useState<Objeto | null>(null);
  const [capas, setCapas] = useState<Objeto[]>([]);
  const [pasos, setPasos] = useState<string[]>([]);
  const [pos, setPos] = useState(-1);
  const [hoja, setHoja] = useState<null | "capas" | "ajustes" | "historial">(null);
  const [modal, setModal] = useState<null | "nuevo" | "abrir" | "guardar" | "exportar" | "ia">(null);
  const [nombre, setNombre] = useState("Sin título");
  const [proyectoId, setProyectoId] = useState<string | undefined>();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [formato, setFormato] = useState<"png" | "jpeg" | "webp">("png");
  const [calidad, setCalidad] = useState(0.92);
  const [promptIa, setPromptIa] = useState("");
  const [nuevoTam, setNuevoTam] = useState({ w: 1080, h: 1080, fondo: "#ffffff", transparente: false });
  const [recortando, setRecortando] = useState(false);
  const [sucio, setSucio] = useState(false);

  const refrescarCapas = useCallback(() => {
    const c = lienzo.current;
    if (!c) return;
    setCapas([...c.getObjects()].reverse() as Objeto[]);
    setSeleccion((c.getActiveObject() as Objeto | undefined) ?? null);
    redibujar((n) => n + 1);
  }, []);

  const foto = useCallback((etiqueta: string) => {
    const c = lienzo.current;
    if (!c || cargando.current) return;
    const r = agregarPaso(historial.current, posicion.current, { json: JSON.stringify(c.toObject(PROPS)), etiqueta });
    historial.current = r.lista;
    posicion.current = r.posicion;
    setPasos(r.lista.map((p) => p.etiqueta));
    setPos(r.posicion);
    if (r.lista.length > 1) setSucio(true);
  }, []);

  const autoAjuste = useRef(true);
  const ajustarZoom = useCallback((w: number, h: number) => {
    autoAjuste.current = true;
    const r = area.current;
    if (!r || r.clientWidth < 80 || r.clientHeight < 80) return;
    const z = Math.min(1, (r.clientWidth - 48) / w, (r.clientHeight - 48) / h);
    setZoom(Math.max(0.05, Math.round(z * 100) / 100));
  }, []);
  const zoomManual = (z: number | ((antes: number) => number)) => {
    autoAjuste.current = false;
    setZoom(z);
  };

  const restaurar = async (json: string) => {
    const c = lienzo.current!;
    cargando.current = true;
    try {
      await c.loadFromJSON(json);
      c.requestRenderAll();
    } finally {
      cargando.current = false;
    }
    refrescarCapas();
  };
  const irAPaso = async (i: number) => {
    if (i < 0 || i >= historial.current.length || i === posicion.current) return;
    posicion.current = i;
    setPos(i);
    await restaurar(historial.current[i]!.json);
  };
  const deshacer = () => void irAPaso(posicion.current - 1);
  const rehacer = () => void irAPaso(posicion.current + 1);

  const reiniciarHistorial = (etiqueta: string) => {
    historial.current = [];
    posicion.current = -1;
    foto(etiqueta);
    setSucio(false);
  };

  const nuevoLienzo = (w: number, h: number, fondo: string | null) => {
    const c = lienzo.current!;
    cargando.current = true;
    c.clear();
    c.backgroundColor = fondo ?? "";
    cargando.current = false;
    setTam({ w, h });
    ajustarZoom(w, h);
    setProyectoId(undefined);
    setNombre("Sin título");
    reiniciarHistorial("Lienzo nuevo");
    refrescarCapas();
    setModal(null);
  };

  const agregarImagen = async (url: string, nombreImagen: string, comoFondo = false) => {
    const c = lienzo.current!;
    try {
      const img = (await FabricImage.fromURL(url, { crossOrigin: "anonymous" })) as FabricImage & Objeto;
      img.nombre = nombreImagen.slice(0, 40);
      if (comoFondo && c.getObjects().length === 0) {
        cargando.current = true;
        c.backgroundColor = "";
        cargando.current = false;
        setTam({ w: img.width, h: img.height });
        ajustarZoom(img.width, img.height);
        setNombre(nombreImagen.slice(0, 80));
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

  const abrirProyecto = async (g: Guardado) => {
    setOcupado("Abriendo…");
    try {
      const datos = await api<{ ancho?: number; alto?: number } & Record<string, unknown>>(`/api/estudio/proyectos/${g.id}/datos`);
      const w = datos.ancho ?? 1080;
      const h = datos.alto ?? 1080;
      setTam({ w, h });
      ajustarZoom(w, h);
      await restaurar(JSON.stringify(datos));
      setNombre(g.nombre);
      setProyectoId(g.id);
      reiniciarHistorial("Abrir proyecto");
      setModal(null);
    } catch (err) {
      avisarError(err);
    } finally {
      setOcupado(null);
    }
  };

  const activo = (): Objeto | null => (lienzo.current?.getActiveObject() as Objeto | undefined) ?? null;

  useEffect(() => {
    const c = new Canvas(elemento.current!, { width: 1080, height: 1080, backgroundColor: "#ffffff", preserveObjectStacking: true, selection: true });
    lienzo.current = c;
    const nombreEvento = (e: unknown) => {
      const o = (e as { target?: Objeto }).target;
      return o ? nombreDe(o) : "capa";
    };
    c.on("object:added", (e) => {
      if ((e.target as Objeto | undefined)?.type === "path" && c.isDrawingMode) return;
      foto(`Agregar ${nombreEvento(e)}`);
      refrescarCapas();
    });
    c.on("object:modified", (e) => {
      foto(`Cambiar ${nombreEvento(e)}`);
      refrescarCapas();
    });
    c.on("object:removed", (e) => {
      foto(`Borrar ${nombreEvento(e)}`);
      refrescarCapas();
    });
    c.on("selection:created", refrescarCapas);
    c.on("selection:updated", refrescarCapas);
    c.on("selection:cleared", refrescarCapas);
    c.on("path:created", (e) => {
      const trazo = (e as unknown as { path: Objeto }).path;
      if (herramientaRef.current === "borrador") {
        trazo.set({ globalCompositeOperation: "destination-out", selectable: false });
        trazo.nombre = "Borrador";
      } else {
        trazo.set({ globalCompositeOperation: pincelRef.current.mezcla });
        trazo.nombre = "Pincel";
      }
      c.requestRenderAll();
      foto(trazo.nombre);
      refrescarCapas();
    });
    c.on("mouse:down", (e) => {
      const h = herramientaRef.current;
      if (h === "cuentagotas") {
        const p = c.getViewportPoint(e.e);
        const escala = c.getRetinaScaling();
        const px = c.getContext().getImageData(Math.round(p.x * escala), Math.round(p.y * escala), 1, 1).data;
        tomarColor.current(`#${[px[0]!, px[1]!, px[2]!].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
        return;
      }
      if (h === "relleno") {
        const o = e.target as Objeto | undefined;
        const color = pincelRef.current.color;
        if (!o) {
          c.backgroundColor = color;
          c.requestRenderAll();
          foto("Cambiar fondo");
          return;
        }
        if (esImagen(o)) return avisar("Para cambiar una imagen usa Ajustes y filtros", "info");
        o.set(o.type === "line" || o.type === "path" ? { stroke: color } : { fill: color });
        c.requestRenderAll();
        c.fire("object:modified", { target: o } as never);
        return;
      }
      if (h === "texto" && !e.target) {
        const p = c.getScenePoint(e.e);
        const t = new IText("Texto", { left: p.x, top: p.y, fontSize: 64, fill: pincelRef.current.color, fontFamily: "Inter" }) as IText & Objeto;
        c.add(t);
        c.setActiveObject(t);
        t.enterEditing();
        t.selectAll();
        setHerramienta("seleccionar");
      }
    });

    const empezar = async () => {
      if (arranque.tipo === "nuevo") nuevoLienzo(arranque.w, arranque.h, arranque.fondo);
      else if (arranque.tipo === "proyecto") await abrirProyecto(arranque.g);
      else {
        nuevoLienzo(1080, 1080, "#ffffff");
        if (arranque.tipo === "archivo") await agregarImagen(URL.createObjectURL(arranque.f), arranque.f.name.replace(/\.[^.]+$/, ""), true);
        else await agregarImagen(arranque.url, arranque.nombre, true);
        reiniciarHistorial("Abrir imagen");
      }
    };
    void empezar();
    return () => {
      void c.dispose();
      lienzo.current = null;
    };
  }, []);

  useEffect(() => {
    const r = area.current;
    if (!r) return;
    const obs = new ResizeObserver(() => {
      if (autoAjuste.current) ajustarZoom(tam.w, tam.h);
    });
    obs.observe(r);
    return () => obs.disconnect();
  }, [tam, ajustarZoom]);

  useEffect(() => {
    const c = lienzo.current;
    if (!c) return;
    c.setDimensions({ width: tam.w * zoom, height: tam.h * zoom });
    c.setZoom(zoom);
    c.requestRenderAll();
  }, [zoom, tam]);

  const ponerPincel = useCallback(() => {
    const c = lienzo.current;
    if (!c) return;
    const h = herramientaRef.current;
    c.isDrawingMode = h === "pincel" || h === "borrador";
    if (!c.isDrawingMode) return;
    const p = pincelRef.current;
    const b = new PencilBrush(c);
    b.color = h === "borrador" ? "rgba(0,0,0,1)" : colorConOpacidad(p.color, p.opacidad);
    b.width = p.grosor;
    const blur = desenfoqueDeDureza(p.grosor, p.dureza);
    b.shadow = blur > 0 ? new Shadow({ blur, color: h === "borrador" ? "rgba(0,0,0,1)" : colorConOpacidad(p.color, p.opacidad), offsetX: 0, offsetY: 0, affectStroke: true }) : null;
    c.freeDrawingBrush = b;
  }, []);

  useEffect(() => {
    herramientaRef.current = herramienta;
    const c = lienzo.current;
    if (!c) return;
    ponerPincel();
    const libre = herramienta === "seleccionar" || herramienta === "recortar" || herramienta === "relleno";
    c.selection = herramienta === "seleccionar";
    c.skipTargetFind = !libre && herramienta !== "texto";
    c.defaultCursor = herramienta === "texto" ? "text" : herramienta === "cuentagotas" || herramienta === "relleno" ? "crosshair" : "default";
  }, [herramienta, ponerPincel]);

  useEffect(() => {
    pincelRef.current = { color: frente, grosor, dureza, opacidad: opacidadPincel, mezcla: mezclaPincel };
    ponerPincel();
  }, [frente, grosor, dureza, opacidadPincel, mezclaPincel, ponerPincel]);

  tomarColor.current = (hex) => {
    setFrente(hex);
    avisar(`Color tomado: ${hex}`);
  };

  const cambiar = (props: Record<string, unknown>) => {
    const o = activo();
    if (!o) return;
    o.set(props);
    lienzo.current?.requestRenderAll();
    refrescarCapas();
  };
  const confirmarCambio = () => {
    const o = activo();
    if (o) lienzo.current?.fire("object:modified", { target: o } as never);
  };

  const agregarForma = (h: Herramienta) => {
    const c = lienzo.current!;
    const base = { left: tam.w / 2 - 150, top: tam.h / 2 - 100, fill: frente, stroke: fondoColor, strokeWidth: 0 };
    let o: Objeto;
    if (h === "rectangulo") o = new Rect({ ...base, width: 300, height: 200, rx: 12, ry: 12 }) as Objeto;
    else if (h === "circulo") o = new Circle({ ...base, radius: 130 }) as Objeto;
    else if (h === "triangulo") o = new Triangle({ ...base, width: 300, height: 260 }) as Objeto;
    else o = new Line([tam.w / 2 - 200, tam.h / 2, tam.w / 2 + 200, tam.h / 2], { stroke: frente, strokeWidth: 10, strokeLineCap: "round" }) as Objeto;
    c.add(o);
    c.setActiveObject(o);
    setHerramienta("seleccionar");
  };

  const iniciarRecorte = () => {
    const c = lienzo.current!;
    if (recorte.current) return;
    const r = new Rect({ left: tam.w * 0.1, top: tam.h * 0.1, width: tam.w * 0.8, height: tam.h * 0.8, fill: "rgba(180,151,255,0.12)", stroke: "#b497ff", strokeWidth: 3, strokeDashArray: [12, 8], excludeFromExport: true, lockRotation: true, transparentCorners: false }) as Rect;
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
    setHerramienta((h) => (h === "recortar" ? "seleccionar" : h));
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
    avisar("Recortado: las capas se unieron en una imagen");
  };

  const elegirHerramienta = (h: Herramienta) => {
    if (FORMAS.includes(h)) return agregarForma(h);
    if (h !== "recortar" && recorte.current) cancelarRecorte();
    if (h === "recortar") iniciarRecorte();
    setHerramienta(h);
  };

  const salida = (tipo: "png" | "jpeg" | "webp", q: number, anchoMax?: number): string => {
    const c = lienzo.current!;
    const antes = { zoom: c.getZoom(), w: c.getWidth(), h: c.getHeight() };
    if (recorte.current) cancelarRecorte();
    c.discardActiveObject();
    c.setZoom(1);
    c.setDimensions({ width: tam.w, height: tam.h });
    const url = c.toDataURL({ format: tipo, quality: q, multiplier: anchoMax ? Math.min(1, anchoMax / tam.w) : 1 });
    c.setZoom(antes.zoom);
    c.setDimensions({ width: antes.w, height: antes.h });
    c.requestRenderAll();
    return url;
  };

  const descargarLocal = async () => {
    const blob = await aBlob(salida(formato, calidad));
    await guardarBlob(blob, `${nombre.replace(/[^\w.-]+/g, "_")}.${formato === "jpeg" ? "jpg" : formato}`).catch(avisarError);
    setModal(null);
  };

  const subirEstudio = async (tipo: "foto" | "imagen") => {
    setOcupado("Guardando…");
    try {
      const datos = new FormData();
      datos.append("tipo", tipo);
      datos.append("nombre", nombre.trim() || "Sin título");
      if (tipo === "foto" && proyectoId) datos.append("id", proyectoId);
      datos.append("miniatura", salida("jpeg", 0.6, 180));
      if (tipo === "foto") datos.append("archivo", new Blob([JSON.stringify({ ...lienzo.current!.toObject(PROPS), ancho: tam.w, alto: tam.h })], { type: "application/json" }), "proyecto.json");
      else datos.append("archivo", await aBlob(salida(formato, calidad)), `imagen.${formato === "jpeg" ? "jpg" : formato}`);
      const r = await api<Guardado>("/api/estudio/proyectos", { formulario: datos });
      if (tipo === "foto") {
        setProyectoId(r.id);
        setSucio(false);
      }
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

  const quitarFondo = async () => {
    const o = activo();
    if (!esImagen(o)) return avisarError(new Error("Elige primero una imagen"));
    setOcupado("Quitando el fondo (la primera vez baja el modelo, ~40 MB)…");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(o.toDataURL({ format: "png", multiplier: 1 / Math.max(o.scaleX ?? 1, 0.01) }));
      const nueva = (await FabricImage.fromURL(URL.createObjectURL(blob))) as FabricImage & Objeto;
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
      const img = (await FabricImage.fromURL(url)) as FabricImage & Objeto;
      img.nombre = "IA";
      const escala = Math.min(tam.w / img.width, tam.h / img.height);
      img.scale(escala);
      img.set({ left: (tam.w - img.width * escala) / 2, top: (tam.h - img.height * escala) / 2 });
      lienzo.current!.add(img);
      lienzo.current!.setActiveObject(img);
      setModal(null);
      avisar("La IA propone esta versión como capa nueva. Si no te gusta, deshaz o bórrala.");
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
    foto(arriba ? "Subir capa" : "Bajar capa");
    refrescarCapas();
  };
  const alternarVisible = (o: Objeto) => {
    o.set("visible", !o.visible);
    lienzo.current!.requestRenderAll();
    foto(o.visible ? "Mostrar capa" : "Ocultar capa");
    refrescarCapas();
  };
  const alternarBloqueo = (o: Objeto) => {
    const cerrado = !o.lockMovementX;
    o.set({ lockMovementX: cerrado, lockMovementY: cerrado, lockRotation: cerrado, lockScalingX: cerrado, lockScalingY: cerrado, hasControls: !cerrado });
    lienzo.current!.requestRenderAll();
    refrescarCapas();
  };
  const transformar = (props: Record<string, unknown>) => {
    cambiar(props);
    confirmarCambio();
  };
  const intercambiarColores = () => {
    setFrente(fondoColor);
    setFondoColor(frente);
  };
  const colorFrente = (hex: string) => {
    setFrente(hex);
    const o = activo();
    if (o && !esImagen(o) && herramienta === "seleccionar") {
      cambiar(o.type === "line" || o.type === "path" ? { stroke: hex } : { fill: hex });
    }
  };

  const salir = async () => {
    if (sucio && !(await confirmar({ titulo: "Salir del editor", mensaje: "Lo que no guardaste se pierde.", boton: "Salir", peligroso: true }))) return;
    alSalir();
  };

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const objetivo = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(objetivo.tagName) || (activo() as IText | null)?.isEditing) return;
      const k = e.key.toLowerCase();
      if ((e.key === "Delete" || e.key === "Backspace") && activo()) {
        e.preventDefault();
        borrar();
      } else if ((e.ctrlKey || e.metaKey) && k === "z") {
        e.preventDefault();
        if (e.shiftKey) rehacer();
        else deshacer();
      } else if ((e.ctrlKey || e.metaKey) && k === "y") {
        e.preventDefault();
        rehacer();
      } else if ((e.ctrlKey || e.metaKey) && k === "d") {
        e.preventDefault();
        void duplicar();
      } else if ((e.ctrlKey || e.metaKey) && k === "s") {
        e.preventDefault();
        setModal("guardar");
      } else if ((e.ctrlKey || e.metaKey) && (k === "+" || k === "=")) {
        e.preventDefault();
        zoomManual((z) => siguienteZoom(z, true));
      } else if ((e.ctrlKey || e.metaKey) && k === "-") {
        e.preventDefault();
        zoomManual((z) => siguienteZoom(z, false));
      } else if ((e.ctrlKey || e.metaKey) && k === "0") {
        e.preventDefault();
        ajustarZoom(tam.w, tam.h);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (k === "x") return intercambiarColores();
        if (k === "d") {
          setFrente("#000000");
          setFondoColor("#ffffff");
          return;
        }
        if (k === "escape" && recorte.current) return cancelarRecorte();
        if (k === "enter" && recorte.current) return void aplicarRecorte();
        const h = HERRAMIENTAS.find((t) => t.atajo?.toLowerCase() === k);
        if (h) {
          e.preventDefault();
          elegirHerramienta(h.id);
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
  const texto = esTexto(sel) ? sel : null;
  const ajustes = sel && esImagen(sel) ? (sel.ajustes ?? AJUSTES_INICIALES) : null;
  const cambiarAjuste = (k: keyof Ajustes, v: number | boolean) => {
    if (!sel || !esImagen(sel)) return;
    aplicarFiltros(sel, { ...(sel.ajustes ?? AJUSTES_INICIALES), [k]: v });
    lienzo.current?.requestRenderAll();
    refrescarCapas();
  };
  const filtroRapido = (k: "grises" | "sepia" | "invertir" | null) => {
    if (!sel || !esImagen(sel)) return avisar("Elige primero una imagen", "info");
    const base = sel.ajustes ?? AJUSTES_INICIALES;
    aplicarFiltros(sel, { ...base, grises: k === "grises", sepia: k === "sepia", invertir: k === "invertir" });
    lienzo.current?.requestRenderAll();
    refrescarCapas();
    confirmarCambio();
  };

  const tecla = (t: string) => `Ctrl+${t}`;
  const menus: [string, OpcionMenu[]][] = [
    [
      "Archivo",
      [
        { texto: "Nuevo…", accion: () => setModal("nuevo") },
        { texto: "Abrir…", accion: () => setModal("abrir") },
        "-",
        { texto: "Guardar proyecto", atajo: tecla("S"), accion: () => setModal("guardar") },
        { texto: "Exportar imagen…", accion: () => setModal("exportar") },
        "-",
        { texto: "Salir del editor", accion: () => void salir() },
      ],
    ],
    [
      "Editar",
      [
        { texto: "Deshacer", atajo: tecla("Z"), accion: deshacer, apagado: pos <= 0 },
        { texto: "Rehacer", atajo: tecla("Y"), accion: rehacer, apagado: pos >= pasos.length - 1 },
        "-",
        { texto: "Duplicar", atajo: tecla("D"), accion: () => void duplicar(), apagado: !sel },
        { texto: "Borrar", atajo: "Supr", accion: borrar, apagado: !sel },
      ],
    ],
    [
      "Imagen",
      [
        { texto: "Recortar", atajo: "C", accion: () => elegirHerramienta("recortar") },
        { texto: "Girar 90°", accion: () => sel && transformar({ angle: ((sel.angle ?? 0) + 90) % 360 }), apagado: !sel },
        { texto: "Voltear horizontal", accion: () => sel && transformar({ flipX: !sel.flipX }), apagado: !sel },
        { texto: "Voltear vertical", accion: () => sel && transformar({ flipY: !sel.flipY }), apagado: !sel },
        "-",
        { texto: "Quitar fondo", accion: () => void quitarFondo(), apagado: !esImagen(sel) },
      ],
    ],
    [
      "Capa",
      [
        { texto: "Agregar imagen…", accion: () => setModal("abrir") },
        { texto: "Subir capa", accion: () => sel && mover(sel, true), apagado: !sel },
        { texto: "Bajar capa", accion: () => sel && mover(sel, false), apagado: !sel },
        { texto: sel?.visible === false ? "Mostrar capa" : "Ocultar capa", accion: () => sel && alternarVisible(sel), apagado: !sel },
        { texto: sel?.lockMovementX ? "Desbloquear capa" : "Bloquear capa", accion: () => sel && alternarBloqueo(sel), apagado: !sel },
      ],
    ],
    [
      "Filtro",
      [
        { texto: "Blanco y negro", accion: () => filtroRapido("grises") },
        { texto: "Sepia", accion: () => filtroRapido("sepia") },
        { texto: "Invertir", accion: () => filtroRapido("invertir") },
        { texto: "Quitar filtros", accion: () => filtroRapido(null) },
        "-",
        { texto: "Retocar con IA…", accion: () => setModal("ia") },
      ],
    ],
    [
      "Ver",
      [
        { texto: "Acercar", atajo: tecla("+"), accion: () => zoomManual((z) => siguienteZoom(z, true)) },
        { texto: "Alejar", atajo: tecla("-"), accion: () => zoomManual((z) => siguienteZoom(z, false)) },
        { texto: "Ajustar a la pantalla", atajo: tecla("0"), accion: () => ajustarZoom(tam.w, tam.h) },
        { texto: "Tamaño real (100 %)", accion: () => zoomManual(1) },
      ],
    ],
  ];

  const enDibujo = herramienta === "pincel" || herramienta === "borrador";
  const barraOpciones = (
    <div className="flex min-w-0 items-center gap-3 overflow-x-auto px-3 py-1.5 [scrollbar-width:none]">
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
        {(() => {
          const h = HERRAMIENTAS.find((t) => t.id === herramienta)!;
          return (
            <>
              <h.icono className="h-4 w-4 text-acento" />
              {h.texto.split(" (")[0]}
            </>
          );
        })()}
      </span>
      <span className="h-5 w-px shrink-0 bg-borde" />
      {enDibujo ? (
        <>
          <Deslizador etiqueta="Tamaño" valor={grosor} min={1} max={200} sufijo=" px" alCambiar={setGrosor} />
          <Deslizador etiqueta="Dureza" valor={dureza} min={0} max={100} sufijo=" %" alCambiar={setDureza} />
          {herramienta === "pincel" ? (
            <>
              <Deslizador etiqueta="Opacidad" valor={opacidadPincel} min={5} max={100} sufijo=" %" alCambiar={setOpacidadPincel} />
              <label className="flex shrink-0 items-center gap-2 text-xs text-tenue">
                Mezcla
                <Selector value={mezclaPincel} onChange={(e) => setMezclaPincel(e.target.value)} className="h-8 w-32 text-xs">
                  {MEZCLAS.map(([v, n]) => (
                    <option key={v} value={v}>
                      {n}
                    </option>
                  ))}
                </Selector>
              </label>
            </>
          ) : null}
        </>
      ) : null}
      {herramienta === "recortar" ? (
        <>
          <span className="shrink-0 text-xs text-tenue">Mueve y estira el cuadro; luego aplica.</span>
          <Boton tamano="sm" variante="primario" disabled={!recortando} onClick={() => void aplicarRecorte()}>
            Aplicar recorte
          </Boton>
          <Boton tamano="sm" variante="fantasma" onClick={cancelarRecorte}>
            Cancelar
          </Boton>
        </>
      ) : null}
      {herramienta === "cuentagotas" ? <span className="shrink-0 text-xs text-tenue">Toca el lienzo para tomar ese color.</span> : null}
      {herramienta === "relleno" ? <span className="shrink-0 text-xs text-tenue">Toca una capa para pintarla o el fondo para cambiarlo.</span> : null}
      {herramienta === "mano" ? <span className="shrink-0 text-xs text-tenue">Arrastra para moverte por el lienzo.</span> : null}
      {herramienta === "zoom" ? (
        <>
          <span className="shrink-0 text-xs text-tenue">Toca para acercar; con Alt alejas.</span>
          <Boton tamano="sm" variante="fantasma" onClick={() => ajustarZoom(tam.w, tam.h)}>
            Ajustar
          </Boton>
          <Boton tamano="sm" variante="fantasma" onClick={() => zoomManual(1)}>
            100 %
          </Boton>
        </>
      ) : null}
      {herramienta === "texto" ? <span className="shrink-0 text-xs text-tenue">Toca el lienzo donde quieras el texto.</span> : null}
      {herramienta === "seleccionar" && sel ? (
        <>
          <Deslizador etiqueta="Opacidad" valor={Math.round((sel.opacity ?? 1) * 100)} min={0} max={100} sufijo=" %" alCambiar={(v) => cambiar({ opacity: v / 100 })} alSoltar={confirmarCambio} />
          <label className="flex shrink-0 items-center gap-2 text-xs text-tenue">
            Mezcla
            <Selector value={sel.globalCompositeOperation ?? "source-over"} onChange={(e) => transformar({ globalCompositeOperation: e.target.value })} className="h-8 w-32 text-xs">
              {MEZCLAS.map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </Selector>
          </label>
          <span className="flex shrink-0 gap-0.5">
            <Boton tamano="icono" variante="fantasma" icono={Copy} aria-label="Duplicar" title="Duplicar (Ctrl+D)" onClick={() => void duplicar()} />
            <Boton tamano="icono" variante="fantasma" icono={RotateCw} aria-label="Girar 90°" title="Girar 90°" onClick={() => transformar({ angle: ((sel.angle ?? 0) + 90) % 360 })} />
            <Boton tamano="icono" variante="fantasma" icono={FlipHorizontal2} aria-label="Voltear horizontal" title="Voltear horizontal" onClick={() => transformar({ flipX: !sel.flipX })} />
            <Boton tamano="icono" variante="fantasma" icono={FlipVertical2} aria-label="Voltear vertical" title="Voltear vertical" onClick={() => transformar({ flipY: !sel.flipY })} />
            <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" title="Borrar (Supr)" onClick={borrar} />
          </span>
        </>
      ) : null}
      {herramienta === "seleccionar" && !sel ? <span className="shrink-0 text-xs text-tenue">Toca una capa para moverla, estirarla o girarla.</span> : null}
    </div>
  );

  const colores = (vertical: boolean) => (
    <div className={cx("relative shrink-0", vertical ? "mx-auto h-11 w-11" : "h-9 w-11")}>
      <label className={cx("absolute bottom-0 right-0 h-6 w-6 cursor-pointer rounded border-2 border-white/80 shadow", vertical && "h-7 w-7")} style={{ background: fondoColor }} title="Color de fondo">
        <input type="color" value={fondoColor} onChange={(e) => setFondoColor(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Color de fondo" />
      </label>
      <label className={cx("absolute left-0 top-0 h-6 w-6 cursor-pointer rounded border-2 border-white shadow", vertical && "h-7 w-7")} style={{ background: frente }} title="Color de frente">
        <input type="color" value={frente} onChange={(e) => colorFrente(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Color de frente" />
      </label>
      <button type="button" onClick={intercambiarColores} className="absolute -right-1 -top-1 rounded bg-superficie p-0.5 text-tenue hover:text-texto" aria-label="Intercambiar colores" title="Intercambiar colores (X)">
        <ArrowLeftRight className="h-3 w-3" />
      </button>
    </div>
  );

  const botonesHerramientas = HERRAMIENTAS.map((h) => (
    <button
      key={h.id}
      type="button"
      onClick={() => elegirHerramienta(h.id)}
      aria-label={h.texto}
      title={`${h.texto}${h.atajo ? ` (${h.atajo})` : ""}`}
      className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg transition-colors", herramienta === h.id ? "bg-acento text-black" : "text-tenue hover:bg-tarjeta hover:text-texto")}
    >
      <h.icono className="h-[18px] w-[18px]" />
    </button>
  ));

  const panelHistorial = (
    <ol className="max-h-44 space-y-0.5 overflow-y-auto">
      {pasos.map((p, i) => (
        <li key={i}>
          <button type="button" onClick={() => void irAPaso(i)} className={cx("flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs", i === pos ? "bg-tarjeta text-texto" : i > pos ? "text-tenue/50" : "text-tenue hover:bg-tarjeta")}>
            <History className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{p}</span>
          </button>
        </li>
      ))}
    </ol>
  );

  const panelAjustes = (
    <div className="space-y-3 text-xs">
      {!sel ? <p className="text-tenue">Elige una capa para ver sus ajustes.</p> : null}
      {ajustes ? (
        <>
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
            <label key={k} className="block">
              <span className="flex justify-between text-tenue">
                {n}
                <b className="font-mono text-texto">{st < 1 ? (ajustes[k] as number).toFixed(2) : ajustes[k]}</b>
              </span>
              <input type="range" min={mn} max={mx} step={st} value={ajustes[k]} onChange={(e) => cambiarAjuste(k, Number(e.target.value))} onPointerUp={confirmarCambio} className="w-full accent-acento" />
            </label>
          ))}
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                [null, "Original"],
                ["grises", "Blanco y negro"],
                ["sepia", "Sepia"],
                ["invertir", "Invertir"],
              ] as const
            ).map(([k, n]) => (
              <button key={n} type="button" onClick={() => filtroRapido(k)} className={cx("rounded-lg border px-1 py-1.5 text-[11px] leading-tight", (k ? ajustes[k] : !ajustes.grises && !ajustes.sepia && !ajustes.invertir) ? "border-acento bg-tarjeta" : "border-borde hover:bg-tarjeta")}>
                {n}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            <Boton tamano="sm" icono={Scissors} onClick={() => void quitarFondo()}>
              Quitar fondo
            </Boton>
            <Boton tamano="sm" icono={Sparkles} onClick={() => setModal("ia")}>
              Retocar con IA
            </Boton>
          </div>
        </>
      ) : null}
      {sel && !esImagen(sel) && sel.type !== "path" && sel.type !== "line" ? (
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="Relleno">
            <input type="color" value={colorHex(sel.fill)} onChange={(e) => cambiar({ fill: e.target.value })} onBlur={confirmarCambio} className="h-8 w-full cursor-pointer rounded border border-borde bg-transparent" />
          </Campo>
          <Campo etiqueta="Color del borde">
            <input type="color" value={colorHex(sel.stroke)} onChange={(e) => cambiar({ stroke: e.target.value })} onBlur={confirmarCambio} className="h-8 w-full cursor-pointer rounded border border-borde bg-transparent" />
          </Campo>
          <label className="col-span-2 block">
            <span className="flex justify-between text-tenue">
              Borde
              <b className="font-mono text-texto">{sel.strokeWidth ?? 0} px</b>
            </span>
            <input type="range" min={0} max={40} value={sel.strokeWidth ?? 0} onChange={(e) => cambiar({ strokeWidth: Number(e.target.value) })} onPointerUp={confirmarCambio} className="w-full accent-acento" />
          </label>
        </div>
      ) : null}
      {sel && (sel.type === "line" || sel.type === "path") ? (
        <div className="grid grid-cols-2 gap-2">
          <Campo etiqueta="Color">
            <input type="color" value={colorHex(sel.stroke)} onChange={(e) => cambiar({ stroke: e.target.value })} onBlur={confirmarCambio} className="h-8 w-full cursor-pointer rounded border border-borde bg-transparent" />
          </Campo>
          <label className="block">
            <span className="flex justify-between text-tenue">
              Grosor
              <b className="font-mono text-texto">{sel.strokeWidth ?? 1} px</b>
            </span>
            <input type="range" min={1} max={80} value={sel.strokeWidth ?? 1} onChange={(e) => cambiar({ strokeWidth: Number(e.target.value) })} onPointerUp={confirmarCambio} className="w-full accent-acento" />
          </label>
        </div>
      ) : null}
      {texto ? (
        <div className="space-y-2">
          <Campo etiqueta="Fuente">
            <Selector value={texto.fontFamily ?? "Inter"} onChange={(e) => transformar({ fontFamily: e.target.value })}>
              {FUENTES.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </option>
              ))}
            </Selector>
          </Campo>
          <label className="block">
            <span className="flex justify-between text-tenue">
              Tamaño
              <b className="font-mono text-texto">{Math.round(texto.fontSize ?? 32)}</b>
            </span>
            <input type="range" min={8} max={300} value={texto.fontSize ?? 32} onChange={(e) => cambiar({ fontSize: Number(e.target.value) })} onPointerUp={confirmarCambio} className="w-full accent-acento" />
          </label>
          <div className="flex flex-wrap gap-1">
            <Boton tamano="sm" variante={texto.fontWeight === "bold" ? "primario" : "fantasma"} onClick={() => transformar({ fontWeight: texto.fontWeight === "bold" ? "normal" : "bold" })} aria-label="Negrita">
              <b>N</b>
            </Boton>
            <Boton tamano="sm" variante={texto.fontStyle === "italic" ? "primario" : "fantasma"} onClick={() => transformar({ fontStyle: texto.fontStyle === "italic" ? "normal" : "italic" })} aria-label="Cursiva">
              <i>K</i>
            </Boton>
            <Boton tamano="sm" variante={texto.underline ? "primario" : "fantasma"} onClick={() => transformar({ underline: !texto.underline })} aria-label="Subrayado">
              <u>S</u>
            </Boton>
            {(["left", "center", "right"] as const).map((al) => (
              <Boton key={al} tamano="sm" variante={texto.textAlign === al ? "primario" : "fantasma"} onClick={() => transformar({ textAlign: al })} aria-label={al === "left" ? "Alinear a la izquierda" : al === "center" ? "Centrar" : "Alinear a la derecha"}>
                {al === "left" ? "⇤" : al === "center" ? "↔" : "⇥"}
              </Boton>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );

  const panelCapas = (
    <div className="space-y-2">
      {capas.length === 0 ? <p className="text-xs text-tenue">Todavía no hay capas: agrega texto, formas o una imagen.</p> : null}
      <ul className="space-y-1">
        {capas.map((o, i) => {
          const Icono = iconoDe(o);
          return (
            <li key={i} className={cx("flex items-center gap-2 rounded-xl border px-2 py-1.5", sel === o ? "border-acento bg-tarjeta" : "border-transparent hover:bg-tarjeta", o.visible === false && "opacity-50")}>
              <button type="button" aria-label="Mostrar u ocultar" className="text-tenue hover:text-texto" onClick={() => alternarVisible(o)}>
                {o.visible === false ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fondo">
                <Icono className="h-4 w-4 text-tenue" />
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  lienzo.current!.setActiveObject(o);
                  lienzo.current!.requestRenderAll();
                  setHerramienta("seleccionar");
                  refrescarCapas();
                }}
              >
                <span className="block truncate text-xs font-medium">{nombreDe(o)}</span>
                <span className="block text-[11px] text-tenue">
                  {nombreMezcla(o.globalCompositeOperation)} · {Math.round((o.opacity ?? 1) * 100)} %
                </span>
              </button>
              <button type="button" aria-label="Bloquear" className="text-tenue hover:text-texto" onClick={() => alternarBloqueo(o)}>
                {o.lockMovementX ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5 opacity-40" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-0.5 border-t border-borde pt-2">
        <Boton tamano="icono" variante="fantasma" icono={ArrowUp} aria-label="Subir capa" title="Subir capa" disabled={!sel} onClick={() => sel && mover(sel, true)} />
        <Boton tamano="icono" variante="fantasma" icono={ArrowDown} aria-label="Bajar capa" title="Bajar capa" disabled={!sel} onClick={() => sel && mover(sel, false)} />
        <Boton tamano="icono" variante="fantasma" icono={Copy} aria-label="Duplicar" title="Duplicar (Ctrl+D)" disabled={!sel} onClick={() => void duplicar()} />
        <Boton tamano="icono" variante="fantasma" icono={ImagePlus} aria-label="Agregar imagen" title="Agregar imagen" onClick={() => setModal("abrir")} />
        <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar capa" title="Borrar (Supr)" disabled={!sel} onClick={borrar} />
      </div>
    </div>
  );

  const pestanasHoja: [NonNullable<typeof hoja>, string, LucideIcon][] = [
    ["capas", "Capas", Layers],
    ["ajustes", "Ajustes", SlidersHorizontal],
    ["historial", "Historial", History],
  ];

  const moverVista = {
    onPointerDown: (e: EventoPuntero<HTMLDivElement>) => {
      const a = area.current;
      if (!a) return;
      if (herramienta === "zoom") {
        zoomManual((z) => siguienteZoom(z, !(e.altKey || e.shiftKey)));
        return;
      }
      arrastre.current = { x: e.clientX, y: e.clientY, sx: a.scrollLeft, sy: a.scrollTop };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: EventoPuntero<HTMLDivElement>) => {
      const a = area.current;
      const d = arrastre.current;
      if (!a || !d) return;
      a.scrollLeft = d.sx - (e.clientX - d.x);
      a.scrollTop = d.sy - (e.clientY - d.y);
    },
    onPointerUp: () => {
      arrastre.current = null;
    },
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-fondo">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-borde bg-superficie px-2 safe-top">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} aria-label="Volver a tus fotos" title="Volver a tus fotos" onClick={() => void salir()} />
        <nav className="flex min-w-0 items-center overflow-x-auto [scrollbar-width:none]" aria-label="Menú del editor">
          {menus.map(([t, o]) => (
            <MenuArriba key={t} texto={t} opciones={o} />
          ))}
        </nav>
        <span className="ml-2 hidden min-w-0 truncate text-sm font-semibold md:block">{nombre}</span>
        <span className="hidden shrink-0 text-xs text-tenue lg:block">· {Math.round(zoom * 100)} %</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <Boton tamano="icono" variante="fantasma" icono={Undo2} aria-label="Deshacer" title="Deshacer (Ctrl+Z)" disabled={pos <= 0} onClick={deshacer} />
          <Boton tamano="icono" variante="fantasma" icono={Redo2} aria-label="Rehacer" title="Rehacer (Ctrl+Y)" disabled={pos >= pasos.length - 1} onClick={rehacer} />
          <Boton tamano="sm" icono={Save} className="hidden sm:inline-flex" onClick={() => setModal("guardar")}>
            Guardar proyecto
          </Boton>
          <Boton tamano="sm" variante="primario" icono={Download} onClick={() => setModal("exportar")}>
            <span className="hidden sm:inline">Exportar</span>
          </Boton>
        </span>
      </header>
      <div className="shrink-0 border-b border-borde bg-superficie/70">{barraOpciones}</div>
      {ocupado ? <p className="shrink-0 bg-tarjeta px-3 py-1 text-xs text-tenue">{ocupado}</p> : null}

      <div className="relative flex min-h-0 flex-1">
        {ancho ? (
          <aside className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-borde bg-superficie py-2" aria-label="Herramientas">
            {botonesHerramientas}
            <span className="my-1 h-px w-8 bg-borde" />
            {colores(true)}
          </aside>
        ) : null}

        <div className="relative min-w-0 flex-1">
          <div ref={area} className="absolute inset-0 overflow-auto" style={{ background: CUADROS }}>
            <div className="flex min-h-full min-w-full items-center justify-center p-6" style={{ width: "max-content", height: "max-content" }}>
              <div className="shadow-2xl ring-1 ring-black/40">
                <canvas ref={elemento} />
              </div>
            </div>
          </div>
          {herramienta === "mano" || herramienta === "zoom" ? <div className={cx("absolute inset-0 z-10", herramienta === "mano" ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in")} {...moverVista} /> : null}
          {!ancho ? (
            <div className="absolute right-3 top-3 z-20 flex gap-1 rounded-xl border border-borde bg-superficie/90 p-1 shadow-lg backdrop-blur">
              {pestanasHoja.map(([id, t, Icono]) => (
                <button key={id} type="button" onClick={() => setHoja(hoja === id ? null : id)} className={cx("grid h-9 w-9 place-items-center rounded-lg", hoja === id ? "bg-acento text-black" : "text-tenue hover:bg-tarjeta")} aria-label={t} title={t}>
                  <Icono className="h-4 w-4" />
                </button>
              ))}
            </div>
          ) : null}
          {!ancho && hoja ? (
            <div
              className={cx(
                "absolute z-30 flex flex-col overflow-hidden border border-borde bg-superficie shadow-2xl",
                forma === "celular" ? "inset-x-0 bottom-0 max-h-[60%] rounded-t-2xl" : "bottom-3 right-3 max-h-[70%] w-[min(380px,calc(100%-24px))] rounded-2xl",
              )}
            >
              {forma === "celular" ? <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-borde" /> : null}
              <div className="flex shrink-0 items-center gap-1 border-b border-borde p-2">
                {pestanasHoja.map(([id, t, Icono]) => (
                  <button key={id} type="button" onClick={() => setHoja(id)} className={cx("inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs", hoja === id ? "bg-tarjeta text-texto" : "text-tenue")}>
                    <Icono className="h-3.5 w-3.5" />
                    {t}
                  </button>
                ))}
                <Boton tamano="icono" variante="fantasma" icono={X} aria-label="Cerrar panel" onClick={() => setHoja(null)} />
              </div>
              <div className="min-h-0 overflow-y-auto p-3">{hoja === "capas" ? panelCapas : hoja === "ajustes" ? panelAjustes : panelHistorial}</div>
            </div>
          ) : null}
        </div>

        {ancho ? (
          <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-borde bg-superficie">
            <Seccion titulo="Historial" icono={History}>
              {panelHistorial}
            </Seccion>
            <Seccion titulo={sel ? `Ajustes · ${nombreDe(sel)}` : "Ajustes"} icono={SlidersHorizontal}>
              {panelAjustes}
            </Seccion>
            <Seccion titulo={`Capas (${capas.length})`} icono={Layers} className="border-b-0">
              {panelCapas}
            </Seccion>
          </aside>
        ) : null}
      </div>

      {!ancho ? (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-t border-borde bg-superficie px-2 py-1.5 safe-bottom [scrollbar-width:none]" aria-label="Herramientas">
          {colores(false)}
          <span className="mx-1 h-6 w-px shrink-0 bg-borde" />
          {botonesHerramientas}
        </div>
      ) : (
        <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-borde bg-superficie px-3 text-[11px] text-tenue">
          <span className="font-mono text-texto">{Math.round(zoom * 100)} %</span>
          <span>
            {tam.w} × {tam.h} px
          </span>
          <span className="truncate">Capa: {sel ? nombreDe(sel) : "ninguna"}</span>
          <span className="ml-auto hidden xl:inline">Ctrl+Z deshacer · Ctrl+D duplicar · Supr borrar · X cambiar colores</span>
          <span className="flex items-center gap-1">
            <button type="button" aria-label="Alejar" className="rounded p-0.5 hover:bg-tarjeta hover:text-texto" onClick={() => zoomManual((z) => siguienteZoom(z, false))}>
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button type="button" aria-label="Acercar" className="rounded p-0.5 hover:bg-tarjeta hover:text-texto" onClick={() => zoomManual((z) => siguienteZoom(z, true))}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          </span>
        </footer>
      )}

      {modal === "nuevo" ? (
        <Modal abierto titulo="Lienzo nuevo" alCerrar={() => setModal(null)}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {TAMANOS.map((t) => (
                <button key={t.n} type="button" onClick={() => setNuevoTam({ ...nuevoTam, w: t.w, h: t.h })} className={cx("flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left text-sm", nuevoTam.w === t.w && nuevoTam.h === t.h ? "border-acento bg-tarjeta" : "border-borde")}>
                  <MuestraTamano w={t.w} h={t.h} />
                  <span>
                    {t.n}
                    <span className="block text-xs text-tenue">
                      {t.w}×{t.h}
                    </span>
                  </span>
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
            <Boton variante="primario" onClick={() => nuevoLienzo(medidaValida(nuevoTam.w), medidaValida(nuevoTam.h), nuevoTam.transparente ? null : nuevoTam.fondo)}>
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
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["png", "PNG", "con transparencia"],
                  ["jpeg", "JPG", "más liviano"],
                  ["webp", "WebP", "para web"],
                ] as const
              ).map(([v, n, d]) => (
                <button key={v} type="button" onClick={() => setFormato(v)} className={cx("rounded-xl border px-2 py-2 text-left", formato === v ? "border-acento bg-tarjeta" : "border-borde")}>
                  <b className="block text-sm">{n}</b>
                  <span className="text-xs text-tenue">{d}</span>
                </button>
              ))}
            </div>
            <Campo etiqueta={`Calidad: ${Math.round(calidad * 100)}%`}>
              <input type="range" min={0.3} max={1} step={0.02} value={calidad} onChange={(e) => setCalidad(Number(e.target.value))} className="w-full accent-acento" disabled={formato === "png"} />
            </Campo>
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
            <p className="text-xs text-tenue">La IA recibe tu imagen completa y lo que pidas, y te propone una versión nueva como capa aparte: tu original no se toca. Necesita la clave de Gemini en Ajustes → Servicios y claves.</p>
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

export default function EditorFotos() {
  const [arranque, setArranque] = useState<Arranque | null>(null);
  const [vez, setVez] = useState(0);
  useModoPagina("completa", Boolean(arranque));
  if (!arranque) {
    return (
      <Galeria
        alAbrir={(a) => {
          setVez((n) => n + 1);
          setArranque(a);
        }}
      />
    );
  }
  return <Editor key={vez} arranque={arranque} alSalir={() => setArranque(null)} />;
}
