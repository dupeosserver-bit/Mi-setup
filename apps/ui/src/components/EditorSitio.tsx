/**
 * Editor visual de sitios (GrapesJS): arrastrar y soltar bloques, moverlos
 * libre (tipo FancyMenu) o en orden, estilos sin código, vista celular /
 * tableta / PC, capas, deshacer, varias páginas, código y bloques conectados
 * a Mi Setup (productos con carrito, tablas de datos, contador, clima…).
 */
import grapesjs, { type Editor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import es from "grapesjs/locale/es.mjs";
import pluginBasico from "grapesjs-blocks-basic";
import pluginCodigo from "grapesjs-custom-code";
import pluginFormularios from "grapesjs-plugin-forms";
import { Code2, FilePlus2, Monitor, Move, Redo2, Rocket, Save, Smartphone, Sparkles, Tablet, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { FUENTES_GOOGLE } from "../lib/plantillasSitios";
import { abrirExterno } from "../lib/plataforma";
import { AreaTexto, Boton, Campo, Entrada, Modal, Selector, avisar, avisarError, cx } from "./ui";

export interface SitioEditable {
  id: string;
  nombre: string;
  url: string;
  publicado: boolean;
  borrador: Record<string, unknown>;
}

const urlFuentes = `https://fonts.googleapis.com/css2?${FUENTES_GOOGLE.map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700`).join("&")}&display=swap`;
const slug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** Bloques propios (aparecen en la categoría «Mi Setup»). */
const BLOQUES: { id: string; etiqueta: string; emoji: string; html: string }[] = [
  { id: "ms-heroe", etiqueta: "Portada", emoji: "🖼️", html: `<section style="padding:80px 20px;text-align:center;background:linear-gradient(135deg,#eef2ff,#fdf2f8)"><h1 style="font-size:2.6rem;margin:0 0 12px">Título grande</h1><p style="font-size:1.1rem">Una frase que explique lo que haces.</p><a href="#" style="display:inline-block;margin-top:14px;padding:12px 22px;border-radius:999px;background:#4f46e5;color:#fff;text-decoration:none;font-weight:600">Botón</a></section>` },
  { id: "ms-menu", etiqueta: "Menú", emoji: "☰", html: `<nav style="display:flex;gap:18px;align-items:center;padding:14px 20px;background:#fff;border-bottom:1px solid #eee"><strong style="margin-right:auto">Mi marca</strong><a href="/">Inicio</a><a href="#productos">Productos</a><a href="#contacto">Contacto</a></nav>` },
  { id: "ms-tarjetas", etiqueta: "3 tarjetas", emoji: "🗂️", html: `<section style="padding:40px 20px"><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;max-width:1100px;margin:0 auto"><div style="padding:20px;border-radius:16px;background:#f8fafc"><h3>Uno</h3><p>Texto</p></div><div style="padding:20px;border-radius:16px;background:#f8fafc"><h3>Dos</h3><p>Texto</p></div><div style="padding:20px;border-radius:16px;background:#f8fafc"><h3>Tres</h3><p>Texto</p></div></div></section>` },
  { id: "ms-galeria", etiqueta: "Galería", emoji: "🖼️", html: `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;padding:20px"><img src="https://picsum.photos/seed/g1/500/500" style="width:100%;border-radius:12px"><img src="https://picsum.photos/seed/g2/500/500" style="width:100%;border-radius:12px"><img src="https://picsum.photos/seed/g3/500/500" style="width:100%;border-radius:12px"></div>` },
  { id: "ms-producto", etiqueta: "Producto (carrito)", emoji: "🛒", html: `<div data-ms-producto data-nombre="Producto" data-precio="100" style="max-width:260px;padding:14px;border-radius:16px;box-shadow:0 6px 20px rgba(0,0,0,.08);text-align:center;background:#fff"><img src="https://picsum.photos/seed/producto/500/400" style="width:100%;border-radius:12px"><h3>Producto</h3><p style="font-weight:700">$100</p><button data-ms-agregar style="padding:10px 18px;border:0;border-radius:999px;background:#16a34a;color:#fff;font-weight:600">Agregar</button></div>` },
  { id: "ms-plan", etiqueta: "Plan de hosting", emoji: "🖥️", html: `<div data-ms-producto data-nombre="Plan Pro" data-precio="199" style="max-width:260px;padding:22px;border-radius:20px;border:1px solid #e5e7eb;text-align:center;background:#fff;box-shadow:0 8px 28px rgba(15,23,42,.07)"><h3>Plan Pro</h3><p style="font-size:2rem;font-weight:700;color:#4f46e5;margin:6px 0">$199<small style="font-size:.9rem;color:#6b7280;font-weight:400"> / mes</small></p><p>4 GB de RAM<br>2 núcleos<br>20 GB NVMe</p><button data-ms-agregar style="padding:12px 22px;border:0;border-radius:999px;background:#6366f1;color:#fff;font-weight:600">Contratar</button></div>` },
  { id: "ms-tabla", etiqueta: "Lista desde tabla", emoji: "📋", html: `<div data-ms-tabla="productos" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;padding:20px"><div data-ms-plantilla data-ms-producto style="padding:14px;border-radius:16px;background:#fff;box-shadow:0 6px 20px rgba(0,0,0,.08)"><img data-campo="imagen" style="width:100%;border-radius:12px"><h3 data-campo="nombre">Nombre</h3><p data-campo="precio" data-dinero style="font-weight:700">$0</p></div></div>` },
  { id: "ms-whatsapp", etiqueta: "Botón WhatsApp", emoji: "💬", html: `<a href="https://wa.me/521XXXXXXXXXX" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#25d366;color:#fff;font-weight:700;text-decoration:none">💬 Escríbenos por WhatsApp</a>` },
  { id: "ms-contacto", etiqueta: "Formulario de contacto", emoji: "✉️", html: `<form name="contacto" style="display:flex;flex-direction:column;gap:10px;max-width:480px;margin:20px auto;padding:20px;border-radius:16px;background:#f8fafc"><input name="nombre" placeholder="Tu nombre" required style="padding:12px;border-radius:10px;border:1px solid #ddd"><input name="correo" type="email" placeholder="Correo" style="padding:12px;border-radius:10px;border:1px solid #ddd"><textarea name="mensaje" placeholder="Mensaje" style="padding:12px;border-radius:10px;border:1px solid #ddd"></textarea><input name="_trampa" style="display:none" tabindex="-1" autocomplete="off"><button type="submit" style="padding:12px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:700">Enviar</button></form>` },
  { id: "ms-contador", etiqueta: "Cuenta regresiva", emoji: "⏳", html: `<div data-ms-bloque="contador" data-fecha="2026-12-31T23:59:00" data-final="¡Llegó el día!" style="font-size:2rem;font-weight:700;text-align:center;padding:20px">00d 00h 00m 00s</div>` },
  { id: "ms-clima", etiqueta: "Clima", emoji: "🌤️", html: `<div data-ms-bloque="clima" data-lat="25.67" data-lon="-100.31" style="font-size:1.4rem;padding:10px">Clima…</div>` },
  { id: "ms-youtube", etiqueta: "Último video", emoji: "▶️", html: `<div data-ms-bloque="youtube" data-canal="" style="padding:10px">Pon el ID de tu canal (UC…) en las propiedades.</div>` },
  { id: "ms-envivo", etiqueta: "En vivo (Twitch/Kick)", emoji: "🔴", html: `<div data-ms-bloque="envivo" data-twitch="" data-kick="" style="padding:10px">Pon tu canal en las propiedades.</div>` },
  { id: "ms-servidores", etiqueta: "Estado de servidores", emoji: "🟢", html: `<div data-ms-bloque="servidores" style="padding:10px">Elige los servidores en Ajustes del sitio.</div>` },
  { id: "ms-login", etiqueta: "Iniciar sesión", emoji: "🔐", html: `<form data-ms-login data-ms-destino="/" style="display:flex;flex-direction:column;gap:10px;max-width:360px;margin:20px auto"><input name="correo" type="email" placeholder="Correo" required style="padding:12px;border-radius:10px;border:1px solid #ddd"><input name="clave" type="password" placeholder="Contraseña" required style="padding:12px;border-radius:10px;border:1px solid #ddd"><button type="submit" style="padding:12px;border:0;border-radius:10px;background:#111;color:#fff">Entrar</button></form>` },
  { id: "ms-usuario", etiqueta: "Nombre + salir", emoji: "👤", html: `<div style="display:flex;gap:10px;align-items:center;padding:10px">Hola, <strong data-ms-usuario>…</strong><button data-ms-salir style="padding:6px 12px;border-radius:8px">Salir</button></div>` },
  { id: "ms-pie", etiqueta: "Pie de página", emoji: "⬇️", html: `<footer style="padding:24px;text-align:center;background:#111;color:#fff">© Mi sitio · Hecho con Mi Setup</footer>` },
];

function configurarEditor(editor: Editor, idSitio: string) {
  const dc = editor.DomComponents;
  // Componentes con propiedades editables sin código (panel ⚙ «Propiedades»).
  const tipo = (nombre: string, prueba: (el: HTMLElement) => boolean, traits: unknown[], extiende?: string) =>
    dc.addType(nombre, {
      ...(extiende ? { extend: extiende } : {}),
      isComponent: (el: HTMLElement) => (typeof el?.getAttribute === "function" && prueba(el) ? { type: nombre } : false),
      model: { defaults: { traits } },
    } as never);
  tipo("ms-producto", (el) => el.hasAttribute("data-ms-producto"), [
    { name: "data-nombre", label: "Nombre del producto" },
    { name: "data-precio", label: "Precio", type: "number" },
  ]);
  tipo("ms-tabla", (el) => el.hasAttribute("data-ms-tabla"), [{ name: "data-ms-tabla", label: "Tabla de datos" }]);
  tipo("ms-contador", (el) => el.getAttribute("data-ms-bloque") === "contador", [
    { name: "data-fecha", label: "Fecha (AAAA-MM-DDTHH:MM)" },
    { name: "data-final", label: "Texto al llegar" },
  ]);
  tipo("ms-clima", (el) => el.getAttribute("data-ms-bloque") === "clima", [
    { name: "data-lat", label: "Latitud" },
    { name: "data-lon", label: "Longitud" },
  ]);
  tipo("ms-youtube", (el) => el.getAttribute("data-ms-bloque") === "youtube", [{ name: "data-canal", label: "ID del canal (UC…)" }]);
  tipo("ms-envivo", (el) => el.getAttribute("data-ms-bloque") === "envivo", [
    { name: "data-twitch", label: "Canal de Twitch" },
    { name: "data-kick", label: "Canal de Kick" },
  ]);
  tipo("ms-login", (el) => el.tagName === "FORM" && el.hasAttribute("data-ms-login"), [{ name: "data-ms-destino", label: "Ir a (después de entrar)" }], "form");
  tipo("ms-formulario", (el) => el.tagName === "FORM" && !el.hasAttribute("data-ms-login"), [
    { name: "name", label: "Nombre del formulario" },
    { name: "data-ms-gracias", label: "Mensaje al enviar" },
  ], "form");

  const bm = editor.BlockManager;
  for (const b of BLOQUES) {
    bm.add(b.id, { label: b.etiqueta, category: "Mi Setup", media: `<div style="font-size:26px;line-height:1">${b.emoji}</div>`, content: b.html });
  }

  // Tipografías de Google Fonts en el administrador de estilos.
  try {
    const prop = editor.StyleManager.getProperty("typography", "font-family") as unknown as { set?: (k: string, v: unknown) => void } | null;
    prop?.set?.("options", [
      { id: "system-ui, sans-serif", label: "Sistema" },
      ...FUENTES_GOOGLE.map((f) => ({ id: `'${f}', sans-serif`, label: f })),
      { id: "Georgia, serif", label: "Georgia" },
    ]);
  } catch {
    /* si cambia la API de GrapesJS, quedan las fuentes por defecto */
  }

  // Imágenes: se suben a Mi Setup (se optimizan a WebP en el equipo).
  editor.AssetManager.getConfig().uploadFile = async (ev: DragEvent | Event) => {
    const lista = (ev as DragEvent).dataTransfer?.files ?? ((ev.target as HTMLInputElement | null)?.files ?? null);
    for (const f of Array.from(lista ?? [])) {
      try {
        const r = await subirImagenSitio(idSitio, f);
        editor.AssetManager.add({ src: r.url, name: f.name });
      } catch (err) {
        avisarError(err);
      }
    }
  };
}

/** Pasa la imagen a WebP (máx. 1920 px) antes de subirla; los SVG, GIF e ICO van tal cual. */
async function optimizar(f: File): Promise<Blob> {
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return f;
  const bmp = await createImageBitmap(f).catch(() => null);
  if (!bmp) return f;
  const escala = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * escala);
  c.height = Math.round(bmp.height * escala);
  c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
  const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/webp", 0.85));
  return b && b.size < f.size ? b : f;
}

export async function subirImagenSitio(idSitio: string, f: File | Blob, nombre = "imagen"): Promise<{ id: string; url: string }> {
  const archivo = f instanceof File ? await optimizar(f) : f;
  const fd = new FormData();
  const ext = archivo.type === "image/webp" ? "webp" : (archivo.type.split("/")[1] ?? "png").replace("svg+xml", "svg");
  fd.append("archivo", archivo, `${(f instanceof File ? f.name : nombre).replace(/\.[^.]+$/, "")}.${ext}`);
  const r = await api<{ id: string; url: string }>(`/api/sitios/${idSitio}/archivos`, { formulario: fd });
  return { id: r.id, url: `${API_BASE}${r.url}` };
}

type ComponenteGjs = { getAttributes(): Record<string, string>; addAttributes(a: Record<string, string>): void; removeAttributes(n: string[]): void; get(k: string): unknown };

/** ¿A dónde lleva este botón o enlace? Página del sitio, enlace, archivo, WhatsApp o correo. */
function DestinoBoton({ comp, idSitio, paginas, alCerrar }: { comp: ComponenteGjs; idSitio: string; paginas: { id: string; nombre: string }[]; alCerrar: () => void }) {
  const actual = comp.getAttributes();
  const [modo, setModo] = useState<"pagina" | "enlace" | "archivo" | "whatsapp" | "correo">(
    actual.download !== undefined ? "archivo" : /wa\.me/.test(actual.href ?? "") ? "whatsapp" : (actual.href ?? "").startsWith("mailto:") ? "correo" : (actual.href ?? "").startsWith("/") ? "pagina" : "enlace",
  );
  const [pagina, setPagina] = useState(actual.href?.startsWith("/") ? actual.href : "/");
  const [url, setUrl] = useState(/^https?:/.test(actual.href ?? "") && !/wa\.me/.test(actual.href ?? "") ? actual.href! : "");
  const [nueva, setNueva] = useState(actual.target === "_blank");
  const [telefono, setTelefono] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [correo, setCorreo] = useState((actual.href ?? "").replace(/^mailto:/, ""));
  const [subiendo, setSubiendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const aplicar = (href: string, extra: Record<string, string> = {}, quitar: string[] = []) => {
    comp.removeAttributes(["download", "target", "rel", ...quitar]);
    comp.addAttributes({ href, ...extra });
    avisar("Destino del botón guardado");
    alCerrar();
  };
  const subir = async (f: File) => {
    setSubiendo(true);
    try {
      const fd = new FormData();
      fd.append("archivo", f, f.name);
      const r = await api<{ id: string; url: string }>(`/api/sitios/${idSitio}/archivos`, { formulario: fd });
      aplicar(`${API_BASE}${r.url}`, { download: f.name });
    } catch (err) {
      avisarError(err);
    } finally {
      setSubiendo(false);
    }
  };
  return (
    <Modal abierto titulo="¿A dónde lleva este botón?" alCerrar={alCerrar} ancho="max-w-md">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["pagina", "Otra página del sitio"],
              ["enlace", "Un enlace"],
              ["archivo", "Descargar un archivo"],
              ["whatsapp", "WhatsApp"],
              ["correo", "Correo"],
            ] as const
          ).map(([id, texto]) => (
            <button key={id} type="button" onClick={() => setModo(id)} className={cx("rounded-full border px-3 py-1 text-xs", modo === id ? "border-acento bg-acento text-black" : "border-borde")}>
              {texto}
            </button>
          ))}
        </div>
        {modo === "pagina" ? (
          <>
            <Selector value={pagina} onChange={(e) => setPagina(e.target.value)}>
              {paginas.map((p, i) => {
                const ruta = i === 0 ? "/" : `/${slug(p.nombre) || `pagina-${i}`}`;
                return (
                  <option key={p.id} value={ruta}>
                    {p.nombre} ({ruta})
                  </option>
                );
              })}
            </Selector>
            <Boton variante="primario" onClick={() => aplicar(pagina)}>
              Guardar
            </Boton>
          </>
        ) : null}
        {modo === "enlace" ? (
          <>
            <Entrada value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" inputMode="url" autoFocus />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={nueva} onChange={(e) => setNueva(e.target.checked)} /> Abrir en otra pestaña
            </label>
            <Boton variante="primario" disabled={!/^https?:\/\/\S+\.\S+/.test(url.trim())} onClick={() => aplicar(url.trim(), nueva ? { target: "_blank", rel: "noopener" } : {})}>
              Guardar
            </Boton>
          </>
        ) : null}
        {modo === "archivo" ? (
          <>
            <p className="text-sm text-tenue">Sube el archivo aquí mismo (PDF, menú, catálogo, ZIP, Word, Excel, audio o video; hasta 25 MB). Al tocar el botón, el visitante lo descarga.</p>
            <input ref={entrada} type="file" className="hidden" onChange={(e) => (e.target.files?.[0] ? void subir(e.target.files[0]) : undefined, (e.target.value = ""))} />
            <Boton variante="primario" cargando={subiendo} onClick={() => entrada.current?.click()}>
              Elegir archivo
            </Boton>
          </>
        ) : null}
        {modo === "whatsapp" ? (
          <>
            <Entrada value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Número con lada, ej. 528112345678" inputMode="tel" />
            <Entrada value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Mensaje que aparece escrito (opcional)" />
            <Boton
              variante="primario"
              disabled={telefono.replace(/\D/g, "").length < 10}
              onClick={() => aplicar(`https://wa.me/${telefono.replace(/\D/g, "")}${mensaje.trim() ? `?text=${encodeURIComponent(mensaje.trim())}` : ""}`, { target: "_blank", rel: "noopener" })}
            >
              Guardar
            </Boton>
          </>
        ) : null}
        {modo === "correo" ? (
          <>
            <Entrada type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="tu@correo.com" />
            <Boton variante="primario" disabled={!/^\S+@\S+\.\S+$/.test(correo.trim())} onClick={() => aplicar(`mailto:${correo.trim()}`)}>
              Guardar
            </Boton>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

export function EditorSitio({ sitio, alPublicar }: { sitio: SitioEditable; alPublicar: (url: string) => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [listo, setListo] = useState(false);
  const [dispositivo, setDispositivo] = useState<"PC" | "Tableta" | "Celular">("PC");
  const [libre, setLibre] = useState(false);
  const [paginas, setPaginas] = useState<{ id: string; nombre: string; privada: boolean }[]>([]);
  const [paginaActual, setPaginaActual] = useState("");
  const [guardando, setGuardando] = useState<"no" | "guardando" | "guardado">("no");
  const [publicando, setPublicando] = useState(false);
  const [codigo, setCodigo] = useState<{ html: string; css: string } | null>(null);
  const [ia, setIa] = useState<string | null>(null);
  const [iaCargando, setIaCargando] = useState(false);
  const temporizador = useRef<number | null>(null);
  const editorListo = useRef(false);
  const chico = typeof window !== "undefined" && window.innerWidth <= 760;
  const [panelMovil, setPanelMovil] = useState(false);
  const [destino, setDestino] = useState<ComponenteGjs | null>(null);

  const refrescarPaginas = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    setPaginas(ed.Pages.getAll().map((p) => ({ id: p.getId(), nombre: String(p.get("name") ?? "Página"), privada: Boolean(p.get("privada" as never)) })));
    setPaginaActual(ed.Pages.getSelected()?.getId() ?? "");
  }, []);

  const guardar = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    setGuardando("guardando");
    try {
      await api(`/api/sitios/${sitio.id}/borrador`, { metodo: "PUT", cuerpo: { borrador: ed.getProjectData() } });
      setGuardando("guardado");
    } catch (err) {
      setGuardando("no");
      avisarError(err);
    }
  }, [sitio.id]);

  useEffect(() => {
    if (!caja.current) return;
    const editor = grapesjs.init({
      container: caja.current,
      height: chico ? "calc(100dvh - 17rem)" : "78vh",
      width: "auto",
      fromElement: false,
      storageManager: false,
      i18n: { locale: "es", detectLocale: false, messages: { es } },
      plugins: [pluginBasico, pluginFormularios, pluginCodigo],
      pluginsOpts: { [pluginBasico as unknown as string]: { flexGrid: true } },
      deviceManager: {
        devices: [
          { id: "PC", name: "PC", width: "" },
          { id: "Tableta", name: "Tableta", width: "768px", widthMedia: "992px" },
          { id: "Celular", name: "Celular", width: "375px", widthMedia: "480px" },
        ],
      },
      canvas: { styles: [urlFuentes] },
      assetManager: { upload: false, autoAdd: false, uploadName: "archivo", multiUpload: true },
      selectorManager: { componentFirst: true },
      // En pantallas táctiles arrastrar bloques es difícil: con un toque se agregan.
      blockManager: { appendOnClick: chico || matchMedia("(pointer: coarse)").matches },
      undoManager: { trackSelection: false },
    });
    editorRef.current = editor;
    configurarEditor(editor, sitio.id);

    // Imágenes ya subidas al sitio.
    void api<{ url: string; nombre: string }[]>(`/api/sitios/${sitio.id}/archivos`)
      .then((l) => editor.AssetManager.add(l.map((a) => ({ src: `${API_BASE}${a.url}`, name: a.nombre }))))
      .catch(() => undefined);

    const b = sitio.borrador as { pages?: unknown[]; plantilla?: { html: string; css: string }; importado?: { paginas: { nombre: string; html: string }[]; css: string } };
    const conBase = (t: string) => t.replace(/(["'(])\/api\/sitios\//g, `$1${API_BASE}/api/sitios/`);
    if (Array.isArray(b.pages) && b.pages.length) editor.loadProjectData(b as never);
    else if (b.importado?.paginas.length) {
      // Sitio importado: cada .html se vuelve una página del editor.
      const [inicio, ...resto] = b.importado.paginas;
      editor.setComponents(conBase(inicio!.html));
      editor.Pages.getAll()[0]?.set("name", inicio!.nombre);
      for (const p of resto) editor.Pages.add({ name: p.nombre, component: conBase(p.html) });
      editor.setStyle(conBase(b.importado.css));
    } else if (b.plantilla) {
      editor.setComponents(b.plantilla.html);
      editor.setStyle(b.plantilla.css);
    }
    const primera = editor.Pages.getAll()[0];
    if (primera && !primera.get("name")) primera.set("name", "Inicio");

    editor.on("load", () => {
      // Categorías de bloques en español.
      const nombres: Record<string, string> = { Basic: "Básicos", Forms: "Formularios", Extra: "Extra", basic: "Básicos", forms: "Formularios" };
      editor.BlockManager.getCategories().forEach((c: { get(k: string): unknown; set(k: string, v: unknown): void }) => {
        const n = nombres[String(c.get("label") ?? c.get("id"))];
        if (n) c.set("label", n);
      });
      setListo(true);
      editorListo.current = true;
      refrescarPaginas();
      if (chico) {
        editor.setDevice("Celular");
        setDispositivo("Celular");
        // Al tocar un botón del panel (bloques, estilos, capas…) se abre encima del lienzo.
        caja.current?.querySelector(".gjs-pn-views")?.addEventListener("click", () => setPanelMovil(true));
      }
    });
    // Guardado automático unos segundos después del último cambio.
    editor.on("update", () => {
      setGuardando("no");
      if (temporizador.current) window.clearTimeout(temporizador.current);
      temporizador.current = window.setTimeout(() => void guardar(), 2500);
    });
    editor.on("page", refrescarPaginas);
    // Botones y enlaces: elegir a dónde llevan (página, enlace, archivo, WhatsApp, correo).
    const esEnlace = (c: { get(k: string): unknown }) => c.get("tagName") === "a" || c.get("type") === "link";
    editor.Commands.add("ms-destino", { run: (ed: Editor) => setDestino((ed.getSelected() as unknown as ComponenteGjs) ?? null) });
    editor.on("component:selected", (c: { get(k: string): unknown; getTrait(n: string): unknown; addTrait(t: unknown, o?: unknown): void }) => {
      if (esEnlace(c) && !c.getTrait("ms-destino")) {
        c.addTrait({ type: "button", name: "ms-destino", label: "Destino", text: "¿A dónde lleva?", full: true, command: "ms-destino" }, { at: 0 });
      }
    });
    // Al agregar un botón nuevo sin destino, se pregunta de una vez.
    editor.on("component:add", (c: ComponenteGjs) => {
      if (!editorListo.current || !esEnlace(c)) return;
      const href = c.getAttributes().href ?? "";
      if (!href || href === "#") window.setTimeout(() => setDestino(c), 150);
    });
    return () => {
      if (temporizador.current) window.clearTimeout(temporizador.current);
      editor.destroy();
      editorRef.current = null;
    };
  }, [sitio.id]);

  const ed = () => editorRef.current!;

  const cambiarDispositivo = (d: typeof dispositivo) => {
    setDispositivo(d);
    ed().setDevice(d);
  };
  const cambiarModo = () => {
    const nuevo = !libre;
    setLibre(nuevo);
    // "absolute" = mover cada bloque libre por la pantalla (como FancyMenu).
    ed().setDragMode(nuevo ? "absolute" : ("" as never));
    avisar(nuevo ? "Modo libre: arrastra los bloques a cualquier lugar" : "Modo ordenado: los bloques se acomodan solos", "info");
  };

  const nuevaPagina = () => {
    const nombre = window.prompt("Nombre de la página (ej. Productos, Contacto)");
    if (!nombre?.trim()) return;
    const p = ed().Pages.add({ name: nombre.trim(), component: `<section style="padding:40px 20px"><h1>${nombre.trim().replace(/</g, "")}</h1></section>` });
    if (p) ed().Pages.select(p);
    refrescarPaginas();
  };
  const borrarPagina = async () => {
    const p = ed().Pages.getSelected();
    if (!p || ed().Pages.getAll().length <= 1) return avisar("El sitio necesita al menos una página", "error");
    if (await confirmar({ titulo: "Borrar página", mensaje: `Se borra «${String(p.get("name"))}».` })) {
      ed().Pages.remove(p);
      refrescarPaginas();
    }
  };
  const alternarPrivada = () => {
    const p = ed().Pages.getSelected();
    if (!p) return;
    if (ed().Pages.getAll()[0] === p) return avisar("La página de inicio no puede ser privada", "error");
    p.set("privada" as never, !p.get("privada" as never) as never);
    refrescarPaginas();
    void guardar();
  };

  const publicar = async () => {
    const editor = ed();
    setPublicando(true);
    try {
      await guardar();
      const base = `${API_BASE}/api/sitios/${sitio.id}/archivos/`;
      const arreglar = (t: string) => t.split(base).join("/_archivos/").split(`/api/sitios/${sitio.id}/archivos/`).join("/_archivos/");
      const todas = editor.Pages.getAll();
      const usadas = new Set<string>();
      const paginasPub = todas.map((p, i) => {
        const comp = p.getMainComponent();
        const html = arreglar(editor.getHtml({ component: comp }).replace(/^<body[^>]*>/i, "").replace(/<\/body>\s*$/i, ""));
        const css = arreglar(editor.getCss({ component: comp }) ?? "");
        for (const f of FUENTES_GOOGLE) if (css.includes(f)) usadas.add(f);
        const nombre = String(p.get("name") ?? `pagina-${i}`);
        return { ruta: i === 0 ? "/" : `/${slug(nombre) || `pagina-${i}`}`, titulo: i === 0 ? "" : nombre, html, css, privada: i > 0 && Boolean(p.get("privada" as never)) };
      });
      await api(`/api/sitios/${sitio.id}/ajustes`, { metodo: "PUT", cuerpo: { ajustes: { fuentes: [...usadas].slice(0, 5) } } });
      const r = await api<{ url: string; dns?: string }>(`/api/sitios/${sitio.id}/publicar`, { cuerpo: { paginas: paginasPub } });
      avisar(r.dns === "creado" ? "¡Publicado! Creé su registro DNS en Cloudflare: abre en unos minutos." : "¡Publicado!");
      alPublicar(r.url);
    } catch (err) {
      avisarError(err);
    } finally {
      setPublicando(false);
    }
  };

  const verCodigo = () => {
    const editor = ed();
    setCodigo({ html: editor.getHtml().replace(/^<body[^>]*>/i, "").replace(/<\/body>\s*$/i, ""), css: editor.getCss() ?? "" });
  };

  const hacerConIa = async () => {
    if (!ia?.trim()) return;
    setIaCargando(true);
    try {
      const r = await api<{ html: string; css: string }>("/api/sitios/ia", { cuerpo: { descripcion: ia } });
      if (await confirmar({ titulo: "Reemplazar la página", mensaje: "La IA hizo un diseño nuevo. ¿Reemplazo el contenido de esta página? (puedes deshacer con Ctrl+Z)" })) {
        ed().setComponents(r.html);
        ed().setStyle(r.css);
      }
      setIa(null);
    } catch (err) {
      avisarError(err);
    } finally {
      setIaCargando(false);
    }
  };

  const actual = paginas.find((p) => p.id === paginaActual);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1">
        <Selector
          className="w-auto max-w-[180px]"
          value={paginaActual}
          onChange={(e) => {
            const p = ed().Pages.get(e.target.value);
            if (p) ed().Pages.select(p);
            refrescarPaginas();
          }}
        >
          {paginas.map((p, i) => (
            <option key={p.id} value={p.id}>
              {i === 0 ? "🏠 " : p.privada ? "🔒 " : ""}
              {p.nombre}
            </option>
          ))}
        </Selector>
        <Boton tamano="icono" variante="fantasma" icono={FilePlus2} aria-label="Nueva página" title="Nueva página" onClick={nuevaPagina} />
        <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar página" title="Borrar página" onClick={() => void borrarPagina()} />
        <label className="flex items-center gap-1 px-1 text-xs text-tenue" title="Solo la ven las cuentas que crees en «Cuentas»">
          <input type="checkbox" checked={Boolean(actual?.privada)} onChange={alternarPrivada} /> Privada
        </label>
        <span className="mx-1 h-6 w-px bg-borde" />
        <Boton tamano="icono" variante="fantasma" icono={Undo2} aria-label="Deshacer" title="Deshacer (Ctrl+Z)" onClick={() => ed().UndoManager.undo()} />
        <Boton tamano="icono" variante="fantasma" icono={Redo2} aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)" onClick={() => ed().UndoManager.redo()} />
        {(["PC", "Tableta", "Celular"] as const).map((d) => (
          <Boton
            key={d}
            tamano="icono"
            variante={dispositivo === d ? "primario" : "fantasma"}
            icono={d === "PC" ? Monitor : d === "Tableta" ? Tablet : Smartphone}
            aria-label={`Ver en ${d}`}
            title={`Ver y ajustar en ${d}`}
            onClick={() => cambiarDispositivo(d)}
          />
        ))}
        <Boton tamano="sm" variante={libre ? "primario" : "fantasma"} icono={Move} onClick={cambiarModo} title="Mover bloques libremente, como FancyMenu">
          Libre
        </Boton>
        <Boton tamano="sm" variante="fantasma" icono={Code2} onClick={verCodigo}>
          Código
        </Boton>
        <Boton tamano="sm" variante="fantasma" icono={Sparkles} onClick={() => setIa("")}>
          IA
        </Boton>
        <span className="ml-auto text-xs text-tenue">{guardando === "guardando" ? "Guardando…" : guardando === "guardado" ? "Guardado ✓" : ""}</span>
        <Boton tamano="sm" icono={Save} onClick={() => void guardar()}>
          Guardar
        </Boton>
        {sitio.publicado ? (
          <Boton tamano="sm" variante="fantasma" onClick={() => abrirExterno(sitio.url)}>
            Ver sitio
          </Boton>
        ) : null}
        <Boton tamano="sm" variante="primario" icono={Rocket} cargando={publicando} disabled={!listo} onClick={() => void publicar()}>
          Publicar
        </Boton>
      </div>
      {chico ? (
        <div className="flex gap-1">
          <Boton tamano="sm" variante={panelMovil ? "primario" : "secundario"} onClick={() => setPanelMovil(!panelMovil)}>
            {panelMovil ? "Ver la página" : "Bloques y estilos"}
          </Boton>
          <span className="self-center text-xs text-tenue">Toca un bloque para agregarlo.</span>
        </div>
      ) : null}
      <div className={cx("editor-sitio relative overflow-hidden rounded-tarjeta border border-borde", panelMovil && "panel-abierto")}>
        <div ref={caja} />
      </div>
      <p className="text-xs text-tenue">
        Arrastra bloques desde el panel de la derecha (cuadritos). Selecciona algo para cambiar su estilo (pincel), sus propiedades (engrane) o verlo en capas (☰). Los cambios se
        guardan solos; los visitantes ven lo nuevo solo al tocar <strong>Publicar</strong>.
      </p>

      {destino ? <DestinoBoton comp={destino} idSitio={sitio.id} paginas={paginas} alCerrar={() => setDestino(null)} /> : null}
      <Modal abierto={codigo !== null} titulo="Código de la página" alCerrar={() => setCodigo(null)} ancho="max-w-3xl">
        {codigo ? (
          <div className="space-y-3">
            <Campo etiqueta="HTML">
              <AreaTexto className="font-mono text-xs" rows={10} value={codigo.html} onChange={(e) => setCodigo({ ...codigo, html: e.target.value })} />
            </Campo>
            <Campo etiqueta="CSS">
              <AreaTexto className="font-mono text-xs" rows={8} value={codigo.css} onChange={(e) => setCodigo({ ...codigo, css: e.target.value })} />
            </Campo>
            <Boton
              variante="primario"
              onClick={() => {
                ed().setComponents(codigo.html);
                ed().setStyle(codigo.css);
                setCodigo(null);
                avisar("Código aplicado (Ctrl+Z para deshacer)");
              }}
            >
              Aplicar cambios
            </Boton>
          </div>
        ) : null}
      </Modal>
      <Modal abierto={ia !== null} titulo="Hazlo con IA" alCerrar={() => setIa(null)}>
        <div className="space-y-3">
          <p className="text-sm text-tenue">Describe la página y la IA arma un diseño que luego editas a tu gusto.</p>
          <AreaTexto rows={5} value={ia ?? ""} onChange={(e) => setIa(e.target.value)} placeholder="Ej. Página para una pastelería con fondo rosa, menú de pasteles con precios, galería y botón de WhatsApp" />
          <Entrada type="hidden" />
          <Boton variante="primario" icono={Sparkles} cargando={iaCargando} disabled={!ia || ia.trim().length < 5} onClick={() => void hacerConIa()}>
            Crear diseño
          </Boton>
        </div>
      </Modal>
    </div>
  );
}
