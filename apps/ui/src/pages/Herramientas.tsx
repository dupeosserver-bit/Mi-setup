/**
 * Herramientas que corren en tu equipo (nada se sube):
 * - Estudio de QR: enlace, Instagram, WhatsApp, WiFi o texto, con colores,
 *   formas, logo al centro y una imagen lista para redes (foto de fondo + título).
 * - Emojis secretos: esconde un mensaje o código dentro de un emoji.
 * - Vista previa HTML/CSS/JS al instante, en tamaño celular, tableta o PC.
 */
import { Code2, Copy, Download, Eye, ImagePlus, Monitor, Play, QrCode, Save, Smartphone, Sparkles, Tablet, Trash2, Wand2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CodigoQr, ESTILO_BASICO, type CodigoQrRef, type EstiloQr } from "../components/CodigoQr";
import { AreaTexto, Boton, Campo, Encabezado, Entrada, Pestanas, Selector, Tarjeta, Vacio, avisar, cx } from "../components/ui";
import { esconderEnEmoji, revelarDeEmoji } from "../lib/emojis";
import { API_BASE } from "../lib/api";

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
  const url = URL.createObjectURL(b);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
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

const PALETAS: { nombre: string; color: string; color2: string | null; fondo: string }[] = [
  { nombre: "Clásico", color: "#000000", color2: null, fondo: "#ffffff" },
  { nombre: "Pastel rosa", color: "#c2185b", color2: "#f06292", fondo: "#fff5f8" },
  { nombre: "Chocolate", color: "#4e342e", color2: "#8d6e63", fondo: "#fff8f0" },
  { nombre: "Menta", color: "#00695c", color2: "#26a69a", fondo: "#f1fffb" },
  { nombre: "Noche", color: "#ffffff", color2: null, fondo: "#121212" },
  { nombre: "Instagram", color: "#833ab4", color2: "#fd1d1d", fondo: "#ffffff" },
];

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

function EstudioQr() {
  const [d, setD] = useState<DatosQr>(DATOS_INICIALES);
  const [estilo, setEstilo] = useState<EstiloQr>({ ...ESTILO_BASICO });
  const [cartel, setCartel] = useState<Cartel>({ titulo: "", subtitulo: "Escanea para seguirnos", fondo: null, formato: "cuadrado", colorTexto: "#ffffff" });
  const [creando, setCreando] = useState(false);
  const qr = useRef<CodigoQrRef>(null);
  const contenido = contenidoQr(d);
  const campo = (k: keyof DatosQr) => ({ value: d[k], onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setD({ ...d, [k]: e.target.value }) });

  const subirImagen = async (e: ChangeEvent<HTMLInputElement>, alListo: (url: string) => void) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return avisar("La imagen pesa más de 8 MB", "error");
    alListo(await leerComoDataUrl(f));
  };

  const crearCartel = async () => {
    const blob = await qr.current?.comoBlob();
    if (!blob) return avisar("Primero escribe qué guardará el QR", "error");
    setCreando(true);
    try {
      bajarBlob(await dibujarCartel(cartel, blob), `qr-${cartel.formato}.png`);
      avisar("Imagen descargada: ya la puedes subir a Instagram o WhatsApp");
    } catch (err) {
      avisar(err instanceof Error ? err.message : "No se pudo crear la imagen", "error");
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
      <div className="min-w-0 space-y-4">
        <Tarjeta titulo="1. ¿Qué abre el QR?" icono={QrCode}>
          <div className="space-y-3">
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
          </div>
        </Tarjeta>

        <Tarjeta titulo="2. Diseño" icono={Wand2}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PALETAS.map((p) => (
                <button
                  key={p.nombre}
                  type="button"
                  onClick={() => setEstilo({ ...estilo, color: p.color, color2: p.color2, fondo: p.fondo })}
                  className="flex items-center gap-2 rounded-xl border border-borde px-3 py-1.5 text-xs hover:bg-tarjeta"
                >
                  <span className="h-4 w-4 rounded-full border border-borde" style={{ background: p.color2 ? `linear-gradient(45deg, ${p.color}, ${p.color2})` : p.color }} />
                  {p.nombre}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Campo etiqueta="Color">
                <input type="color" value={estilo.color} onChange={(e) => setEstilo({ ...estilo, color: e.target.value })} className="h-10 w-full rounded-xl" />
              </Campo>
              <Campo etiqueta="Segundo color">
                <div className="flex gap-1">
                  <input type="color" value={estilo.color2 ?? estilo.color} onChange={(e) => setEstilo({ ...estilo, color2: e.target.value })} className="h-10 w-full rounded-xl" />
                  {estilo.color2 ? <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Sin degradado" onClick={() => setEstilo({ ...estilo, color2: null })} /> : null}
                </div>
              </Campo>
              <Campo etiqueta="Fondo">
                <input type="color" value={estilo.fondo} onChange={(e) => setEstilo({ ...estilo, fondo: e.target.value })} className="h-10 w-full rounded-xl" />
              </Campo>
              <Campo etiqueta="Puntos">
                <Selector value={estilo.puntos} onChange={(e) => setEstilo({ ...estilo, puntos: e.target.value as EstiloQr["puntos"] })}>
                  <option value="square">Cuadrados</option>
                  <option value="dots">Círculos</option>
                  <option value="rounded">Redondeados</option>
                  <option value="extra-rounded">Muy redondeados</option>
                  <option value="classy">Elegantes</option>
                  <option value="classy-rounded">Elegantes redondos</option>
                </Selector>
              </Campo>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Esquinas">
                <Selector value={estilo.esquinas} onChange={(e) => setEstilo({ ...estilo, esquinas: e.target.value as EstiloQr["esquinas"] })}>
                  <option value="square">Cuadradas</option>
                  <option value="extra-rounded">Redondeadas</option>
                  <option value="dot">Círculo</option>
                </Selector>
              </Campo>
              <Campo etiqueta="Logo en el centro">
                <div className="flex gap-2">
                  <label className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-borde text-sm hover:bg-tarjeta">
                    <ImagePlus className="h-4 w-4" /> {estilo.logo ? "Cambiar logo" : "Subir logo"}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => void subirImagen(e, (url) => setEstilo({ ...estilo, logo: url }))} />
                  </label>
                  {estilo.logo ? <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Quitar logo" onClick={() => setEstilo({ ...estilo, logo: null })} /> : null}
                </div>
              </Campo>
            </div>
          </div>
        </Tarjeta>

        <Tarjeta titulo="3. Imagen para redes (opcional)" icono={ImagePlus}>
          <div className="space-y-3">
            <p className="text-sm text-tenue">Arma una imagen con tu foto de fondo, un título y el QR, lista para Instagram o WhatsApp.</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Entrada value={cartel.titulo} onChange={(e) => setCartel({ ...cartel, titulo: e.target.value })} placeholder="Título, ej. Pastelería Lupita" maxLength={40} />
              <Entrada value={cartel.subtitulo} onChange={(e) => setCartel({ ...cartel, subtitulo: e.target.value })} placeholder="Texto de abajo" maxLength={50} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-borde px-3 text-sm hover:bg-tarjeta">
                <ImagePlus className="h-4 w-4" /> {cartel.fondo ? "Cambiar foto de fondo" : "Foto de fondo"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void subirImagen(e, (url) => setCartel({ ...cartel, fondo: url }))} />
              </label>
              <Selector className="max-w-[12rem]" value={cartel.formato} onChange={(e) => setCartel({ ...cartel, formato: e.target.value as Cartel["formato"] })}>
                <option value="cuadrado">Cuadrado (publicación)</option>
                <option value="historia">Vertical (historia)</option>
              </Selector>
              <input type="color" value={cartel.colorTexto} onChange={(e) => setCartel({ ...cartel, colorTexto: e.target.value })} className="h-10 w-12 rounded-xl" aria-label="Color del texto" />
              <Boton variante="primario" icono={Download} cargando={creando} disabled={!contenido} onClick={() => void crearCartel()}>
                Descargar imagen
              </Boton>
            </div>
          </div>
        </Tarjeta>
      </div>

      <Tarjeta titulo="Vista previa" className="h-fit lg:sticky lg:top-4">
        <div className="flex flex-col items-center gap-3">
          {contenido ? <CodigoQr ref={qr} datos={contenido} tamano={260} estilo={estilo} className="overflow-hidden rounded-xl" /> : <Vacio icono={QrCode} texto="Escribe qué abrirá el QR" />}
          {contenido ? (
            <>
              <p className="max-w-[260px] break-all text-center text-xs text-tenue">{contenido}</p>
              <div className="flex gap-2">
                <Boton tamano="sm" variante="primario" icono={Download} onClick={() => void qr.current?.descargar("codigo-qr", "png")}>
                  PNG
                </Boton>
                <Boton tamano="sm" icono={Download} onClick={() => void qr.current?.descargar("codigo-qr", "svg")}>
                  SVG (imprenta)
                </Boton>
              </div>
              <p className="max-w-[260px] text-center text-xs text-tenue">Pruébalo con la cámara de tu celular antes de imprimirlo.</p>
            </>
          ) : null}
        </div>
      </Tarjeta>
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

/** Arma una página completa con el HTML, CSS y JavaScript escritos. */
export function documentoDe(c: { html: string; css: string; js: string }): string {
  const seguro = (t: string, etiqueta: string) => t.replace(new RegExp(`</${etiqueta}`, "gi"), `<\\/${etiqueta}`);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${seguro(c.css, "style")}</style></head><body>${c.html}<script>${seguro(c.js, "script")}</script></body></html>`;
}

const TAMANOS = { celular: { ancho: 375, icono: Smartphone }, tableta: { ancho: 768, icono: Tablet }, pc: { ancho: 1280, icono: Monitor } } as const;

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

  // El marco avisa cuando está listo; después se le manda el código (al dejar de
  // escribir si "Actualizar mientras escribo" está activo, o al tocar Ejecutar).
  const marco = useRef<HTMLIFrameElement>(null);
  const listo = useRef(false);
  const ultimo = useRef(doc);
  ultimo.current = doc;
  const mostrar = (d: string) => {
    if (listo.current) marco.current?.contentWindow?.postMessage(d, "*");
  };
  useEffect(() => {
    const alMensaje = (e: MessageEvent) => {
      if (e.source !== marco.current?.contentWindow || e.data !== "vista-previa-lista") return;
      listo.current = true;
      mostrar(ultimo.current);
    };
    window.addEventListener("message", alMensaje);
    return () => window.removeEventListener("message", alMensaje);
  }, []);
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => mostrar(doc), 400);
    return () => clearTimeout(t);
  }, [doc, auto]);

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
          <div className="overflow-auto rounded-xl border border-borde bg-white">
            {/* Página aislada del servidor + sandbox sin allow-same-origin: el código corre sin acceso a la app ni a tu sesión. */}
            <iframe
              ref={marco}
              title="Vista previa"
              sandbox="allow-scripts allow-modals"
              src={`${API_BASE}/vista-previa`}
              style={{ width: ancho, maxWidth: tamano === "pc" ? "none" : "100%" }}
              className="mx-auto block h-[50vh] border-0"
            />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-tenue">Ancho: {ancho} px. El código corre aislado: no puede tocar tu cuenta.</p>
            <label className="flex items-center gap-2 text-xs text-tenue">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-acento" />
              Actualizar mientras escribo
            </label>
          </div>
        </Tarjeta>
      </div>
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
