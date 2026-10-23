/**
 * Herramientas que corren en tu equipo (nada se sube):
 * - Estudio de QR: enlace, Instagram, WhatsApp, WiFi o texto, con colores,
 *   formas, logo al centro y una imagen lista para redes (foto de fondo + título).
 * - Emojis secretos: esconde un mensaje o código dentro de un emoji.
 * - Vista previa HTML/CSS/JS al instante, en tamaño celular, tableta o PC.
 */
import { Bookmark, Code2, Copy, Download, ExternalLink, Eye, Frame, ImagePlus, Link2, Palette, Play, QrCode, Redo2, Save, Scan, Shapes, Share2, Sparkles, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { CodigoQr, ESTILO_BASICO, type CodigoQrRef, type EstiloQr } from "../components/CodigoQr";
import { AreaTexto, Boton, Campo, Encabezado, Entrada, Interruptor, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { esconderEnEmoji, revelarDeEmoji } from "../lib/emojis";
import { ESTILOS_LISTOS, FORMAS_ESQUINA, FORMAS_MODULO, MARCOS, contrasteMinimo, seLee, svgAPng, svgQr, type FormaEsquina, type FormaModulo, type MarcoQr } from "../lib/qrDiseno";
import { useForma } from "../lib/marco";
import { escritorio } from "../lib/plataforma";
import { guardarBlob } from "../lib/guardar";
import { MarcoVista, TAMANOS_VISTA as TAMANOS, documentoDe } from "../components/MarcoVista";

// ---------------------------------------------------------------- utilidades

function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("No se pudo leer la imagen"));
    r.readAsDataURL(archivo);
  });
}

function copiar(texto: string, aviso = "Copiado") {
  void navigator.clipboard
    .writeText(texto)
    .then(() => avisar(aviso))
    .catch(() => avisar("No se pudo copiar: selecciónalo y cópialo a mano", "error"));
}

function leerLocal<T>(clave: string, inicial: T): T {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : inicial;
  } catch {
    return inicial;
  }
}

function guardarLocal(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    avisar("No hay espacio para guardar en este equipo", "error");
  }
}

function bajarBlob(b: Blob, nombre: string) {
  void guardarBlob(b, nombre).catch(avisarError);
}

// ---------------------------------------------------------------- QR

type TipoQr = "enlace" | "instagram" | "whatsapp" | "wifi" | "texto";

interface DatosQr {
  tipo: TipoQr;
  enlace: string;
  usuario: string;
  telefono: string;
  mensaje: string;
  redWifi: string;
  claveWifi: string;
  texto: string;
}

const DATOS_INICIALES: DatosQr = { tipo: "enlace", enlace: "", usuario: "", telefono: "", mensaje: "", redWifi: "", claveWifi: "", texto: "" };

/** Lo que guarda el QR según el tipo elegido. */
function contenidoQr(d: DatosQr): string {
  switch (d.tipo) {
    case "instagram":
      return d.usuario ? `https://instagram.com/${d.usuario.replace(/^@/, "").trim()}` : "";
    case "whatsapp": {
      const numero = d.telefono.replace(/\D/g, "");
      return numero ? `https://wa.me/${numero}${d.mensaje ? `?text=${encodeURIComponent(d.mensaje)}` : ""}` : "";
    }
    case "wifi": {
      const esc = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");
      return d.redWifi ? `WIFI:T:${d.claveWifi ? "WPA" : "nopass"};S:${esc(d.redWifi)};P:${esc(d.claveWifi)};;` : "";
    }
    case "texto":
      return d.texto;
    default:
      return d.enlace.trim();
  }
}

interface Cartel {
  titulo: string;
  subtitulo: string;
  fondo: string | null;
  formato: "cuadrado" | "historia";
  colorTexto: string;
}

/** Dibuja la imagen para redes: foto de fondo, título, QR al centro y texto de abajo. */
async function dibujarCartel(c: Cartel, qr: Blob): Promise<Blob> {
  const ancho = 1080;
  const alto = c.formato === "historia" ? 1920 : 1080;
  const lienzo = document.createElement("canvas");
  lienzo.width = ancho;
  lienzo.height = alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("Tu equipo no permite dibujar imágenes");
  const cargar = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
      img.src = src;
    });
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(0, 0, ancho, alto);
  if (c.fondo) {
    const img = await cargar(c.fondo);
    // "Cubrir": la foto llena todo sin deformarse.
    const escala = Math.max(ancho / img.width, alto / img.height);
    const w = img.width * escala;
    const h = img.height * escala;
    ctx.drawImage(img, (ancho - w) / 2, (alto - h) / 2, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, 0, ancho, alto);
  }
  const lado = c.formato === "historia" ? 620 : 520;
  const url = URL.createObjectURL(qr);
  const qrImg = await cargar(url);
  URL.revokeObjectURL(url);
  const x = (ancho - lado) / 2;
  const y = (alto - lado) / 2 + (c.formato === "historia" ? 40 : 30);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(x - 30, y - 30, lado + 60, lado + 60, 36);
  ctx.fill();
  ctx.drawImage(qrImg, x, y, lado, lado);
  ctx.fillStyle = c.colorTexto;
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 12;
  const escribir = (texto: string, tamano: number, yTexto: number) => {
    let t = tamano;
    ctx.font = `bold ${t}px system-ui, sans-serif`;
    while (ctx.measureText(texto).width > ancho - 120 && t > 28) {
      t -= 4;
      ctx.font = `bold ${t}px system-ui, sans-serif`;
    }
    ctx.fillText(texto, ancho / 2, yTexto);
  };
  if (c.titulo) escribir(c.titulo, 84, y - 90);
  if (c.subtitulo) escribir(c.subtitulo, 52, y + lado + 120);
  return new Promise((resolve, reject) => lienzo.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo crear la imagen"))), "image/png"));
}

const CLAVE_DISENOS_QR = "mi-setup.disenos-qr";

interface DisenoQr {
  id: string;
  nombre: string;
  estilo: EstiloQr;
}

type PanelQr = "contenido" | "forma" | "esquinas" | "color" | "logo" | "marco" | "estilos" | "redes" | "mios";

const PANELES: { id: PanelQr; texto: string; icono: typeof QrCode }[] = [
  { id: "contenido", texto: "Contenido", icono: Link2 },
  { id: "estilos", texto: "Estilos", icono: Sparkles },
  { id: "forma", texto: "Forma", icono: Shapes },
  { id: "esquinas", texto: "Esquinas", icono: Scan },
  { id: "color", texto: "Color", icono: Palette },
  { id: "logo", texto: "Logo", icono: ImagePlus },
  { id: "marco", texto: "Marco", icono: Frame },
  { id: "redes", texto: "Para redes", icono: Share2 },
  { id: "mios", texto: "Mis diseños", icono: Bookmark },
];

const MUESTRA = "https://setup.mexicanland.net";

function Miniatura({ estilo, activo, texto, alElegir }: { estilo: EstiloQr; activo: boolean; texto: string; alElegir: () => void }) {
  const svg = useMemo(() => svgQr(MUESTRA, 76, { ...estilo, logo: null, marco: "ninguno" }), [estilo]);
  return (
    <button
      type="button"
      onClick={alElegir}
      className={cx(
        "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-xs transition-colors",
        activo ? "border-acento bg-[color-mix(in_srgb,var(--acento)_12%,transparent)] text-texto" : "border-borde text-tenue hover:bg-tarjeta",
      )}
    >
      <span className="overflow-hidden rounded-lg" dangerouslySetInnerHTML={{ __html: svg }} />
      {texto}
    </button>
  );
}

function ColorCampo({ etiqueta, valor, alCambiar }: { etiqueta: string; valor: string; alCambiar: (v: string) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-xl border border-borde px-3 py-2 text-sm">
      <input type="color" value={valor} onChange={(e) => alCambiar(e.target.value)} className="h-8 w-10 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent" />
      <span className="min-w-0 flex-1">{etiqueta}</span>
      <code className="text-xs text-tenue">{valor}</code>
    </label>
  );
}

function EstudioQr() {
  const [d, setD] = useState<DatosQr>(DATOS_INICIALES);
  const [historial, setHistorial] = useState<{ pasos: EstiloQr[]; i: number }>({ pasos: [{ ...ESTILO_BASICO }], i: 0 });
  const estilo = historial.pasos[historial.i]!;
  const [panel, setPanel] = useState<PanelQr>("contenido");
  const [zoom, setZoom] = useState(1);
  const [cartel, setCartel] = useState<Cartel>({ titulo: "", subtitulo: "Escanea para seguirnos", fondo: null, formato: "cuadrado", colorTexto: "#ffffff" });
  const [creando, setCreando] = useState(false);
  const [mios, setMios] = useState<DisenoQr[]>(() => leerLocal<DisenoQr[]>(CLAVE_DISENOS_QR, []));
  const forma = useForma();
  const qr = useRef<CodigoQrRef>(null);
  const contenido = contenidoQr(d);
  const campo = (k: keyof DatosQr) => ({ value: d[k], onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value }) });
  const cambiar = (parcial: Partial<EstiloQr>) =>
    setHistorial((h) => {
      const pasos = [...h.pasos.slice(0, h.i + 1), { ...h.pasos[h.i]!, ...parcial }].slice(-40);
      return { pasos, i: pasos.length - 1 };
    });
  const deshacer = () => setHistorial((h) => ({ ...h, i: Math.max(0, h.i - 1) }));
  const rehacer = () => setHistorial((h) => ({ ...h, i: Math.min(h.pasos.length - 1, h.i + 1) }));
  const bajo = contrasteMinimo(estilo) < 3;

  const subirImagen = async (e: ChangeEvent<HTMLInputElement>, alListo: (url: string) => void) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return avisar("La imagen pesa más de 8 MB", "error");
    alListo(await leerComoDataUrl(f));
  };

  const crearCartel = async () => {
    if (!contenido) return avisar("Primero escribe qué guardará el QR", "error");
    setCreando(true);
    try {
      const blob = await svgAPng(svgQr(contenido, 1024, { ...estilo, marco: "ninguno" }), 1024);
      bajarBlob(await dibujarCartel(cartel, blob), `qr-${cartel.formato}.png`);
      avisar("Imagen descargada: ya la puedes subir a Instagram o WhatsApp");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "No se pudo crear la imagen", "error");
    } finally {
      setCreando(false);
    }
  };

  const guardarDiseno = () => {
    const lista = [{ id: crypto.randomUUID(), nombre: `Diseño ${mios.length + 1}`, estilo }, ...mios].slice(0, 30);
    setMios(lista);
    guardarLocal(CLAVE_DISENOS_QR, lista);
    avisar("Diseño guardado en «Mis diseños»");
  };
  const borrarDiseno = (id: string) => {
    const lista = mios.filter((x) => x.id !== id);
    setMios(lista);
    guardarLocal(CLAVE_DISENOS_QR, lista);
  };

  const tamanoQr = forma === "celular" ? 248 : forma === "tablet" ? 300 : 360;

  const contenidoPanel = (
    <div className="space-y-3">
      {panel === "contenido" ? (
        <>
          <Selector value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value as TipoQr })}>
            <option value="enlace">Enlace o página web</option>
            <option value="instagram">Perfil de Instagram</option>
            <option value="whatsapp">Chat de WhatsApp</option>
            <option value="wifi">Red WiFi</option>
            <option value="texto">Texto libre</option>
          </Selector>
          {d.tipo === "enlace" ? <Entrada {...campo("enlace")} placeholder="https://…" inputMode="url" /> : null}
          {d.tipo === "instagram" ? <Entrada {...campo("usuario")} placeholder="@pasteleria" /> : null}
          {d.tipo === "whatsapp" ? (
            <>
              <Entrada {...campo("telefono")} placeholder="Número con lada, ej. 528112345678" inputMode="tel" />
              <Entrada {...campo("mensaje")} placeholder="Mensaje que aparece escrito (opcional), ej. Quiero pedir un pastel" />
            </>
          ) : null}
          {d.tipo === "wifi" ? (
            <>
              <Entrada {...campo("redWifi")} placeholder="Nombre de la red" />
              <Entrada {...campo("claveWifi")} placeholder="Contraseña (vacío si no tiene)" />
            </>
          ) : null}
          {d.tipo === "texto" ? <AreaTexto {...campo("texto")} rows={3} placeholder="Escribe el texto" /> : null}
        </>
      ) : null}
      {panel === "estilos" ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3">
          {ESTILOS_LISTOS.map((x) => (
            <Miniatura key={x.nombre} texto={x.nombre} estilo={{ ...ESTILO_BASICO, ...x.estilo }} activo={false} alElegir={() => cambiar(x.estilo)} />
          ))}
        </div>
      ) : null}
      {panel === "forma" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
          {(Object.keys(FORMAS_MODULO) as FormaModulo[]).map((m) => (
            <Miniatura key={m} texto={FORMAS_MODULO[m]} estilo={{ ...estilo, modulos: m }} activo={estilo.modulos === m} alElegir={() => cambiar({ modulos: m })} />
          ))}
        </div>
      ) : null}
      {panel === "esquinas" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
          {(Object.keys(FORMAS_ESQUINA) as FormaEsquina[]).map((m) => (
            <Miniatura key={m} texto={FORMAS_ESQUINA[m]} estilo={{ ...estilo, esquinas: m }} activo={estilo.esquinas === m} alElegir={() => cambiar({ esquinas: m })} />
          ))}
        </div>
      ) : null}
      {panel === "color" ? (
        <>
          <ColorCampo etiqueta="Color" valor={estilo.color} alCambiar={(v) => cambiar({ color: v })} />
          <Interruptor etiqueta="Degradado" activo={estilo.color2 !== null} alCambiar={(v) => cambiar({ color2: v ? estilo.color : null })} />
          {estilo.color2 !== null ? (
            <>
              <ColorCampo etiqueta="Segundo color" valor={estilo.color2} alCambiar={(v) => cambiar({ color2: v })} />
              <Campo etiqueta={`Dirección: ${estilo.angulo}°`}>
                <input type="range" min={0} max={315} step={45} value={estilo.angulo} onChange={(e) => cambiar({ angulo: Number(e.target.value) })} className="w-full accent-[var(--acento)]" />
              </Campo>
            </>
          ) : null}
          <ColorCampo etiqueta="Fondo" valor={estilo.fondo} alCambiar={(v) => cambiar({ fondo: v })} />
          <Interruptor etiqueta="Esquinas de otro color" activo={estilo.colorEsquinas !== null} alCambiar={(v) => cambiar({ colorEsquinas: v ? estilo.color : null })} />
          {estilo.colorEsquinas !== null ? <ColorCampo etiqueta="Color de las esquinas" valor={estilo.colorEsquinas} alCambiar={(v) => cambiar({ colorEsquinas: v })} /> : null}
        </>
      ) : null}
      {panel === "logo" ? (
        <>
          <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-borde text-sm hover:border-acento">
            <ImagePlus className="h-4 w-4" /> {estilo.logo ? "Cambiar logo" : "Subir logo (PNG, JPG o SVG)"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => void subirImagen(e, (url) => cambiar({ logo: url }))} />
          </label>
          {estilo.logo ? (
            <Boton variante="fantasma" icono={Trash2} onClick={() => cambiar({ logo: null })}>
              Quitar logo
            </Boton>
          ) : null}
          <p className="text-xs text-tenue">Con logo, el QR usa la corrección de errores más alta para que se siga leyendo.</p>
        </>
      ) : null}
      {panel === "marco" ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(MARCOS) as MarcoQr[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => cambiar({ marco: m })}
                className={cx("rounded-xl border px-2 py-2.5 text-xs", estilo.marco === m ? "border-acento bg-[color-mix(in_srgb,var(--acento)_12%,transparent)]" : "border-borde text-tenue hover:bg-tarjeta")}
              >
                {MARCOS[m]}
              </button>
            ))}
          </div>
          {estilo.marco !== "ninguno" ? <Entrada value={estilo.textoMarco} maxLength={28} onChange={(e) => cambiar({ textoMarco: e.target.value })} placeholder="Escanéame" /> : null}
        </>
      ) : null}
      {panel === "redes" ? (
        <>
          <p className="text-sm text-tenue">Arma una imagen con tu foto de fondo, un título y el QR, lista para Instagram o WhatsApp.</p>
          <Entrada value={cartel.titulo} onChange={(e) => setCartel({ ...cartel, titulo: e.target.value })} placeholder="Título, ej. Pastelería Lupita" maxLength={40} />
          <Entrada value={cartel.subtitulo} onChange={(e) => setCartel({ ...cartel, subtitulo: e.target.value })} placeholder="Texto de abajo" maxLength={50} />
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-borde px-3 text-sm hover:bg-tarjeta">
            <ImagePlus className="h-4 w-4" /> {cartel.fondo ? "Cambiar foto de fondo" : "Foto de fondo"}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => void subirImagen(e, (url) => setCartel({ ...cartel, fondo: url }))} />
          </label>
          <div className="flex gap-2">
            <Selector className="min-w-0 flex-1" value={cartel.formato} onChange={(e) => setCartel({ ...cartel, formato: e.target.value as Cartel["formato"] })}>
              <option value="cuadrado">Cuadrado (publicación)</option>
              <option value="historia">Vertical (historia)</option>
            </Selector>
            <input type="color" value={cartel.colorTexto} onChange={(e) => setCartel({ ...cartel, colorTexto: e.target.value })} className="h-10 w-12 rounded-xl" aria-label="Color del texto" />
          </div>
          <Boton className="w-full" variante="primario" icono={Download} cargando={creando} disabled={!contenido} onClick={() => void crearCartel()}>
            Descargar imagen
          </Boton>
        </>
      ) : null}
      {panel === "mios" ? (
        <>
          {!mios.length ? <p className="text-sm text-tenue">Aún no guardas diseños. Toca «Guardar» abajo del QR.</p> : null}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3">
            {mios.map((x) => (
              <div key={x.id} className="relative">
                <Miniatura texto={x.nombre} estilo={x.estilo} activo={false} alElegir={() => cambiar(x.estilo)} />
                <button type="button" aria-label="Borrar diseño" onClick={() => borrarDiseno(x.id)} className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-superficie text-tenue hover:text-peligro">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );

  const actual = PANELES.find((p) => p.id === panel)!;

  return (
    <div className="grid min-h-[min(760px,calc(var(--alto-app,100dvh)-12rem))] overflow-hidden rounded-tarjeta border border-borde bg-superficie lg:grid-cols-[84px_300px_minmax(0,1fr)]">
      <nav className="flex gap-1 overflow-x-auto border-b border-borde p-2 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r" aria-label="Partes del QR">
        {PANELES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPanel(p.id)}
            className={cx(
              "flex shrink-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium lg:w-full",
              panel === p.id ? "bg-[color-mix(in_srgb,var(--acento)_14%,transparent)] text-acento" : "text-tenue hover:bg-tarjeta",
            )}
          >
            <p.icono className="h-5 w-5" />
            {p.texto}
          </button>
        ))}
      </nav>
      <section className="order-last border-t border-borde p-4 lg:order-none lg:overflow-y-auto lg:border-r lg:border-t-0">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <actual.icono className="h-4 w-4 text-acento" />
          {actual.texto}
        </h3>
        {contenidoPanel}
      </section>
      <div className="relative flex min-h-[420px] flex-col items-center justify-center gap-3 bg-[radial-gradient(circle,var(--borde)_1px,transparent_1px)] bg-[length:18px_18px] px-3 pb-24 pt-12">
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded-xl border border-borde bg-superficie p-1">
          <Boton tamano="icono" variante="fantasma" icono={ZoomOut} aria-label="Alejar" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} />
          <span className="w-12 text-center text-xs">{Math.round(zoom * 100)}%</span>
          <Boton tamano="icono" variante="fantasma" icono={ZoomIn} aria-label="Acercar" onClick={() => setZoom((z) => Math.min(1.6, z + 0.2))} />
        </div>
        {contenido ? (
          <div style={{ transform: `scale(${zoom})`, transformOrigin: "center" }} className="transition-transform">
            <CodigoQr ref={qr} datos={contenido} tamano={tamanoQr} estilo={estilo} className="overflow-hidden rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.45)]" />
          </div>
        ) : (
          <Vacio icono={QrCode} texto="Escribe en «Contenido» qué abrirá el QR" />
        )}
        {contenido ? <LecturaQr qr={qr} datos={contenido} estilo={estilo} /> : null}
        {contenido && bajo ? <p className="max-w-xs text-center text-xs text-aviso">Poco contraste entre el color y el fondo: algunas cámaras no lo leerán.</p> : null}
        <div className="absolute bottom-3 left-1/2 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-2xl border border-borde bg-superficie p-1.5 shadow-lg">
          <span className="hidden max-w-[14rem] truncate px-2 font-mono text-xs text-tenue md:inline">{contenido || "Sin contenido"}</span>
          <Boton tamano="icono" variante="fantasma" icono={Undo2} aria-label="Deshacer" disabled={historial.i === 0} onClick={deshacer} />
          <Boton tamano="icono" variante="fantasma" icono={Redo2} aria-label="Rehacer" disabled={historial.i >= historial.pasos.length - 1} onClick={rehacer} />
          <Boton tamano="sm" icono={Save} onClick={guardarDiseno}>
            Guardar
          </Boton>
          <Boton tamano="sm" icono={Download} disabled={!contenido} onClick={() => void qr.current?.descargar("codigo-qr", "svg")}>
            SVG
          </Boton>
          <Boton tamano="sm" variante="primario" icono={Download} disabled={!contenido} onClick={() => void qr.current?.descargar("codigo-qr", "png")}>
            Descargar
          </Boton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- emojis secretos

const EMOJIS = ["😂", "🤡", "👀", "🔥", "💀", "🎁", "🍰", "😎", "🤫", "💌", "🐸", "🧠"];

function EmojisSecretos({ alAbrirEnVista }: { alAbrirEnVista: (codigo: string) => void }) {
  const [emoji, setEmoji] = useState("😂");
  const [mensaje, setMensaje] = useState("");
  const [pegado, setPegado] = useState("");
  const resultado = mensaje ? esconderEnEmoji(emoji, mensaje) : "";
  const revelado = useMemo(() => (pegado ? revelarDeEmoji(pegado) : null), [pegado]);
  const pareceHtml = revelado ? /<\s*(html|body|div|style|script|h1|p|button)\b/i.test(revelado) : false;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Tarjeta titulo="Esconder un mensaje" icono={Sparkles}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)} className={cx("rounded-xl p-2 text-2xl", emoji === e ? "bg-acento/20 ring-2 ring-acento" : "hover:bg-tarjeta")}>
                {e}
              </button>
            ))}
          </div>
          <AreaTexto value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={5} placeholder="Escribe el mensaje secreto o pega un código…" maxLength={20000} />
          {resultado ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-fondo p-3">
              <span className="text-4xl">{resultado}</span>
              <Boton variante="primario" icono={Copy} onClick={() => copiar(resultado, "Emoji copiado: pégalo en WhatsApp")}>
                Copiar emoji
              </Boton>
              <span className="text-xs text-tenue">Lleva {new TextEncoder().encode(mensaje).length} letras escondidas.</span>
            </div>
          ) : null}
          <p className="text-xs text-tenue">Se ve como un emoji normal. Quien lo pegue en esta app (Herramientas → Emojis secretos) ve el mensaje.</p>
        </div>
      </Tarjeta>
      <Tarjeta titulo="Revelar un mensaje" icono={Eye}>
        <div className="space-y-3">
          <Entrada value={pegado} onChange={(e) => setPegado(e.target.value)} placeholder="Pega aquí el emoji que te mandaron" />
          {pegado && revelado === null ? <p className="text-sm text-tenue">Ese emoji no trae mensaje escondido.</p> : null}
          {revelado ? (
            <>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-fondo p-3 font-mono text-xs">{revelado}</pre>
              <div className="flex flex-wrap gap-2">
                <Boton icono={Copy} onClick={() => copiar(revelado)}>
                  Copiar
                </Boton>
                {pareceHtml ? (
                  <Boton variante="primario" icono={Code2} onClick={() => alAbrirEnVista(revelado)}>
                    Abrir en la vista previa
                  </Boton>
                ) : null}
              </div>
              <p className="text-xs text-tenue">Por seguridad, un código nunca se ejecuta solo: revísalo antes de usarlo.</p>
            </>
          ) : null}
        </div>
      </Tarjeta>
    </div>
  );
}

// ---------------------------------------------------------------- vista previa HTML

interface Diseno {
  id: string;
  nombre: string;
  html: string;
  css: string;
  js: string;
}

const CLAVE_DISENOS = "mi-setup.disenos-html";
const EJEMPLO: Omit<Diseno, "id" | "nombre"> = {
  html: `<nav class="menu">\n  <span class="logo">Mi página</span>\n  <a href="#">Inicio</a>\n  <a href="#">Productos</a>\n  <a href="#">Contacto</a>\n</nav>\n<main>\n  <h1>¡Hola!</h1>\n  <button id="boton">Tócame</button>\n</main>`,
  css: `body { margin: 0; font-family: system-ui, sans-serif; background: #111; color: #eee; }\n.menu { display: flex; gap: 16px; align-items: center; padding: 16px; background: #1e1e1e; }\n.menu a { color: #8ab4f8; text-decoration: none; }\n.logo { font-weight: bold; margin-right: auto; }\nmain { padding: 24px; }\nbutton { padding: 12px 20px; border: 0; border-radius: 12px; background: #4ade80; font-weight: bold; }`,
  js: `document.getElementById("boton").onclick = () => alert("¡Funciona!");`,
};

/** Revisa sola (con un lector de QR) que el diseño se siga leyendo. */
function LecturaQr({ qr, datos, estilo }: { qr: React.RefObject<CodigoQrRef | null>; datos: string; estilo: EstiloQr }) {
  const [estado, setEstado] = useState<"revisando" | "ok" | "mal">("revisando");
  useEffect(() => {
    setEstado("revisando");
    const t = setTimeout(() => {
      void (async () => {
        const blob = await qr.current?.comoBlob();
        setEstado(blob && (await seLee(blob, datos).catch(() => false)) ? "ok" : "mal");
      })();
    }, 600);
    return () => clearTimeout(t);
  }, [datos, estilo]);
  if (estado === "revisando") return <p className="text-xs text-tenue">Revisando que se lea…</p>;
  return estado === "ok" ? (
    <p className="text-xs text-ok">✔ Se lee bien</p>
  ) : (
    <p className="max-w-[260px] text-center text-xs text-peligro">No se pudo leer con este diseño: prueba otra forma, más contraste o un logo más chico.</p>
  );
}

/** Ventana flotante dentro de la app (web y celular): se mueve, cambia de tamaño y se minimiza. */
function VentanaFlotante({ titulo, alCerrar, children }: { titulo: string; alCerrar: () => void; children: ReactNode }) {
  const chico = window.innerWidth < 640;
  const [pos, setPos] = useState(() => (chico ? { x: 8, y: 72 } : { x: window.innerWidth - 460, y: 90 }));
  const [min, setMin] = useState(false);
  const arrastre = useRef<{ dx: number; dy: number } | null>(null);
  return createPortal(
    <div
      className="fixed z-[80] flex flex-col overflow-hidden rounded-2xl border border-borde bg-superficie shadow-2xl"
      style={{ left: pos.x, top: pos.y, width: chico ? window.innerWidth - 16 : 440, height: min ? undefined : chico ? "60vh" : 640, resize: chico || min ? "none" : "both", maxWidth: "calc(100vw - 16px)" }}
    >
      <div
        className="flex shrink-0 cursor-move touch-none select-none items-center gap-2 border-b border-borde px-3 py-2 text-sm"
        onPointerDown={(e) => {
          arrastre.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!arrastre.current) return;
          setPos({ x: Math.min(window.innerWidth - 80, Math.max(0, e.clientX - arrastre.current.dx)), y: Math.min(window.innerHeight - 48, Math.max(0, e.clientY - arrastre.current.dy)) });
        }}
        onPointerUp={() => {
          arrastre.current = null;
        }}
      >
        <Eye className="h-4 w-4 text-acento" />
        <span className="min-w-0 flex-1 truncate font-medium">{titulo}</span>
        <button type="button" className="rounded-lg px-2 text-tenue hover:bg-tarjeta hover:text-texto" onClick={() => setMin(!min)} aria-label={min ? "Mostrar" : "Minimizar"}>
          {min ? "▢" : "–"}
        </button>
        <button type="button" className="rounded-lg px-2 text-tenue hover:bg-tarjeta hover:text-texto" onClick={alCerrar} aria-label="Cerrar">
          ✕
        </button>
      </div>
      {min ? null : <div className="min-h-0 flex-1 p-2">{children}</div>}
    </div>,
    document.body,
  );
}

function VistaPreviaHtml({ inicial }: { inicial: string | null }) {
  const navegar = useNavigate();
  const [codigo, setCodigo] = useState<Omit<Diseno, "id" | "nombre">>(EJEMPLO);
  const [pestana, setPestana] = useState<"html" | "css" | "js">("html");
  const [tamano, setTamano] = useState<keyof typeof TAMANOS>("celular");
  const [disenos, setDisenos] = useState<Diseno[]>(() => leerLocal(CLAVE_DISENOS, []));
  const [nombre, setNombre] = useState("");
  const [auto, setAuto] = useState(true);
  const doc = documentoDe(codigo);

  useEffect(() => {
    if (inicial) setCodigo({ html: inicial, css: "", js: "" });
  }, [inicial]);

  // El código se manda a los marcos al dejar de escribir (si "Actualizar mientras
  // escribo" está activo) o al tocar Ejecutar.
  const [actualizar, setActualizar] = useState(0);
  const mostrar = (_d?: string) => setActualizar((n) => n + 1);
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => mostrar(doc), 400);
    return () => clearTimeout(t);
  }, [doc, auto]);
  // Ventana flotante: en la app de PC es una ventana aparte; en web y celular, un panel que se mueve.
  const pc = escritorio();
  const [flotante, setFlotante] = useState(false);
  useEffect(() => {
    if (flotante && pc?.abrirVistaPrevia) pc.abrirVistaPrevia(doc);
  }, [flotante, actualizar]);

  const guardar = () => {
    const d: Diseno = { id: crypto.randomUUID(), nombre: nombre.trim() || `Diseño ${disenos.length + 1}`, ...codigo };
    const lista = [d, ...disenos].slice(0, 30);
    setDisenos(lista);
    guardarLocal(CLAVE_DISENOS, lista);
    setNombre("");
    avisar("Diseño guardado en este equipo");
  };
  const borrar = (id: string) => {
    const lista = disenos.filter((x) => x.id !== id);
    setDisenos(lista);
    guardarLocal(CLAVE_DISENOS, lista);
  };
  const pedirIa = () => {
    const pregunta = `Mejora esta interfaz con HTML y CSS (responde con el código completo). Lo que quiero: \nHTML actual:\n${codigo.html}\nCSS actual:\n${codigo.css}`;
    navegar(`/ia?pregunta=${encodeURIComponent(pregunta.slice(0, 1800))}`);
  };
  const ancho = TAMANOS[tamano].ancho;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Tarjeta
          titulo="Código"
          icono={Code2}
          acciones={
            <Boton tamano="sm" variante="fantasma" icono={Sparkles} onClick={pedirIa}>
              Pedir a la IA
            </Boton>
          }
        >
          <Pestanas
            valor={pestana}
            alCambiar={setPestana}
            opciones={[
              { id: "html", texto: "HTML" },
              { id: "css", texto: "CSS" },
              { id: "js", texto: "JavaScript" },
            ]}
          />
          <textarea
            value={codigo[pestana]}
            onChange={(e) => setCodigo({ ...codigo, [pestana]: e.target.value })}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="mt-3 h-[45vh] w-full min-w-0 resize-none rounded-xl border border-borde bg-fondo p-3 font-mono text-xs leading-relaxed text-texto focus:border-acento focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Entrada className="max-w-xs" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre del diseño" />
            <Boton icono={Save} onClick={guardar}>
              Guardar
            </Boton>
            <Boton icono={Download} onClick={() => bajarBlob(new Blob([doc], { type: "text/html" }), `${(nombre.trim() || "diseno").replace(/[^\w-]/g, "_")}.html`)}>
              Bajar .html
            </Boton>
          </div>
        </Tarjeta>
        <Tarjeta
          titulo="Resultado"
          icono={Eye}
          acciones={
            <div className="flex flex-wrap items-center justify-end gap-1">
              <Boton tamano="sm" variante="primario" icono={Play} onClick={() => mostrar(doc)}>
                Ejecutar
              </Boton>
              {(Object.keys(TAMANOS) as (keyof typeof TAMANOS)[]).map((t) => {
                const Icono = TAMANOS[t].icono;
                return <Boton key={t} tamano="icono" variante={tamano === t ? "primario" : "fantasma"} icono={Icono} aria-label={`Ver como ${t}`} onClick={() => setTamano(t)} />;
              })}
            </div>
          }
        >
          <MarcoVista doc={doc} ancho={ancho} actualizar={actualizar} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-tenue">Ancho: {ancho} px. El código corre aislado: no puede tocar tu cuenta.</p>
            <Boton tamano="sm" icono={ExternalLink} onClick={() => (pc?.abrirVistaPrevia ? (pc.abrirVistaPrevia(doc), setFlotante(true)) : setFlotante(!flotante))}>
              {flotante && !pc?.abrirVistaPrevia ? "Cerrar ventana flotante" : "Ventana flotante"}
            </Boton>
            <label className="flex items-center gap-2 text-xs text-tenue">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-acento" />
              Actualizar mientras escribo
            </label>
          </div>
        </Tarjeta>
      </div>
      {flotante && !pc?.abrirVistaPrevia ? (
        <VentanaFlotante titulo={`Vista previa · ${tamano}`} alCerrar={() => setFlotante(false)}>
          <MarcoVista doc={doc} ancho={ancho} alto={-1} actualizar={actualizar} />
        </VentanaFlotante>
      ) : null}
      {disenos.length ? (
        <Tarjeta titulo="Mis diseños">
          <div className="flex flex-wrap gap-2">
            {disenos.map((x) => (
              <div key={x.id} className="flex items-center gap-1 rounded-xl border border-borde pl-3 text-sm">
                <button type="button" onClick={() => setCodigo({ html: x.html, css: x.css, js: x.js })} className="py-1.5">
                  {x.nombre}
                </button>
                <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label={`Borrar ${x.nombre}`} onClick={() => borrar(x.id)} />
              </div>
            ))}
          </div>
        </Tarjeta>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- página

export default function Herramientas() {
  const [pestana, setPestana] = useState<"qr" | "emojis" | "html">("qr");
  const [codigoVista, setCodigoVista] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Encabezado titulo="Herramientas" descripcion="Códigos QR, emojis secretos y vista previa de HTML. Todo se hace en tu equipo." />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "qr", texto: "Código QR" },
          { id: "emojis", texto: "Emojis secretos" },
          { id: "html", texto: "Vista previa HTML" },
        ]}
      />
      {pestana === "qr" ? <EstudioQr /> : null}
      {pestana === "emojis" ? (
        <EmojisSecretos
          alAbrirEnVista={(c) => {
            setCodigoVista(c);
            setPestana("html");
          }}
        />
      ) : null}
      {pestana === "html" ? <VistaPreviaHtml inicial={codigoVista} /> : null}
    </div>
  );
}
