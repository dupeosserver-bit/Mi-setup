/**
 * Editor de una nota: texto con estilo de Discord (**negrita**, ||spoiler||, __subrayado__…), vista de página
 * o en vivo, fotos, dibujos y archivos adjuntos, color de la nota (como Samsung Notes) y subpáginas.
 * Guardado automático.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  Bold,
  CheckSquare,
  ChevronRight,
  Code,
  Eraser,
  EyeOff,
  FilePlus2,
  Heading1,
  Heading2,
  ImagePlus,
  Italic,
  List,
  Minus,
  Palette,
  Paperclip,
  PenLine,
  Pencil,
  Pin,
  PinOff,
  Quote,
  Redo2,
  Strikethrough,
  Table,
  Trash2,
  Type,
  Underline,
  Undo2,
  Columns2,
  AudioLines,
  Copy,
  Download,
  Link2,
  Mic,
  Send,
  Share2,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, api } from "../lib/api";
import { compartirConApps, guardarEnDispositivo } from "../lib/compartir";
import { extensionDe, fmtDuracion, grabarAudio, type Grabacion } from "../lib/grabadora";
import { dictar } from "../lib/voz";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";
import { alternarCasilla } from "../lib/notas";
import { COLORES_NOTA, aHtml, fmtTamano, fondoNota, quitarAdjunto, type ColorNota } from "../lib/markdownNotas";
import { abrirExterno } from "../lib/plataforma";
import { Boton, Entrada, Modal, Selector, avisar, avisarError, cx } from "./ui";

export interface Nota {
  id: string;
  titulo: string;
  contenido: string;
  fijada: boolean;
  padre: string | null;
  icono: string | null;
  color: ColorNota | null;
  actualizada: string;
}
interface Adjunto {
  id: string;
  nombre: string;
  tipo: string;
  tamano: number;
  imagen: boolean;
  url: string;
}

const ICONOS = ["📝", "✅", "📔", "💡", "🛒", "📊", "🎮", "💻", "🔐", "💰", "🎂", "📚", "🏠", "⭐"];
const TINTAS = ["#111111", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ffffff"];

// ---------------------------------------------------------------- dibujo

function Dibujo({ alGuardar, alCerrar }: { alGuardar: (png: Blob) => Promise<void>; alCerrar: () => void }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState(TINTAS[0]!);
  const [grosor, setGrosor] = useState(4);
  const [borrador, setBorrador] = useState(false);
  const [fondo, setFondo] = useState<"blanco" | "oscuro" | "transparente">("blanco");
  const [guardando, setGuardando] = useState(false);
  const dibujando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const historial = useRef<ImageData[]>([]);
  const rehacer = useRef<ImageData[]>([]);

  const ctx = () => lienzo.current!.getContext("2d")!;
  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = lienzo.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const foto = () => ctx().getImageData(0, 0, lienzo.current!.width, lienzo.current!.height);

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    historial.current = [...historial.current.slice(-24), foto()];
    rehacer.current = [];
    dibujando.current = true;
    ultimo.current = punto(e);
    pintar(ultimo.current, ultimo.current);
  };
  const pintar = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const c = ctx();
    c.lineCap = "round";
    c.lineJoin = "round";
    c.lineWidth = borrador ? grosor * 4 : grosor;
    c.globalCompositeOperation = borrador ? "destination-out" : "source-over";
    c.strokeStyle = color;
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x + 0.01, b.y + 0.01);
    c.stroke();
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current || !ultimo.current) return;
    const p = punto(e);
    pintar(ultimo.current, p);
    ultimo.current = p;
  };
  const terminar = () => {
    dibujando.current = false;
    ultimo.current = null;
  };
  const deshacer = () => {
    const previo = historial.current.pop();
    if (!previo) return;
    rehacer.current.push(foto());
    ctx().putImageData(previo, 0, 0);
  };
  const volver = () => {
    const siguiente = rehacer.current.pop();
    if (!siguiente) return;
    historial.current.push(foto());
    ctx().putImageData(siguiente, 0, 0);
  };
  const limpiar = () => {
    historial.current = [...historial.current.slice(-24), foto()];
    ctx().clearRect(0, 0, lienzo.current!.width, lienzo.current!.height);
  };
  const guardar = async () => {
    const c = lienzo.current!;
    const salida = document.createElement("canvas");
    salida.width = c.width;
    salida.height = c.height;
    const s = salida.getContext("2d")!;
    if (fondo !== "transparente") {
      s.fillStyle = fondo === "blanco" ? "#ffffff" : "#1c1c1e";
      s.fillRect(0, 0, salida.width, salida.height);
    }
    s.drawImage(c, 0, 0);
    setGuardando(true);
    try {
      const png = await new Promise<Blob>((ok, mal) => salida.toBlob((b) => (b ? ok(b) : mal(new Error("No se pudo crear la imagen"))), "image/png"));
      await alGuardar(png);
    } finally {
      setGuardando(false);
    }
  };

  const fondoCss = fondo === "blanco" ? "#ffffff" : fondo === "oscuro" ? "#1c1c1e" : "repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 0 0 / 16px 16px";
  return (
    <Modal abierto titulo="Dibujo" alCerrar={alCerrar}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {TINTAS.map((t) => (
            <button key={t} type="button" aria-label={`Color ${t}`} onClick={() => { setColor(t); setBorrador(false); }} className={cx("h-7 w-7 rounded-full border-2", color === t && !borrador ? "border-acento" : "border-borde")} style={{ background: t }} />
          ))}
          <Boton tamano="icono" variante={borrador ? "primario" : "fantasma"} icono={Eraser} aria-label="Borrador" onClick={() => setBorrador((v) => !v)} />
          <Boton tamano="icono" variante="fantasma" icono={Undo2} aria-label="Deshacer" onClick={deshacer} />
          <Boton tamano="icono" variante="fantasma" icono={Redo2} aria-label="Rehacer" onClick={volver} />
          <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar todo" onClick={limpiar} />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-tenue">
          <label className="flex items-center gap-2">
            Grosor
            <input type="range" min={1} max={24} value={grosor} onChange={(e) => setGrosor(Number(e.target.value))} className="accent-acento" />
          </label>
          <label className="flex items-center gap-2">
            Fondo
            <select value={fondo} onChange={(e) => setFondo(e.target.value as typeof fondo)} className="rounded-lg border border-borde bg-fondo px-2 py-1">
              <option value="blanco">Blanco</option>
              <option value="oscuro">Oscuro</option>
              <option value="transparente">Transparente</option>
            </select>
          </label>
        </div>
        <canvas
          ref={lienzo}
          width={1000}
          height={640}
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerCancel={terminar}
          className="w-full touch-none rounded-xl border border-borde"
          style={{ background: fondoCss, cursor: "crosshair" }}
        />
        <Boton variante="primario" icono={Pencil} cargando={guardando} onClick={() => void guardar()}>
          Insertar en la nota
        </Boton>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- editor

type Modo = "pagina" | "editar" | "vivo";


/** Compartir la nota: por el chat de Mi Setup, con otras apps (con sus fotos) o con un enlace. */
function CompartirNota({ nota, titulo, contenido, adjuntos, alCerrar }: { nota: Nota; titulo: string; contenido: string; adjuntos: Adjunto[]; alCerrar: () => void }) {
  const puedeChat = usePuede("chat", "escritura");
  const enlace = useQuery({ queryKey: ["notas", nota.id, "compartir"], queryFn: () => api<{ activo: boolean; url?: string; vence?: string | null }>(`/api/notas/${nota.id}/compartir`) });
  const canales = useQuery({ queryKey: ["chat", "canales"], queryFn: () => api<{ id: string; nombre: string; tipo: string }[]>("/api/chat/canales"), enabled: puedeChat });
  const [canal, setCanal] = useState("");
  const [dias, setDias] = useState("30");
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["notas", nota.id, "compartir"] });
  const crearEnlace = async (): Promise<string> => {
    const r = await api<{ url: string }>(`/api/notas/${nota.id}/compartir`, { cuerpo: { dias: dias ? Number(dias) : null } });
    refrescar();
    return r.url;
  };
  const textoPlano = contenido.replace(/!?\[[^\]]*\]\(\/api\/notas\/adjuntos\/[^)]+\)\n?/g, "").trim();
  const extracto = textoPlano.replace(/[#*_>|~`-]/g, "").replace(/\s+/g, " ").slice(0, 300);
  const porChat = useMutation({
    mutationFn: async () => {
      const url = enlace.data?.activo && enlace.data.url ? enlace.data.url : await crearEnlace();
      const destino = canal || canales.data?.[0]?.id;
      if (!destino) throw new Error("No tienes chats todavía");
      await api(`/api/chat/canales/${destino}/mensajes`, { cuerpo: { texto: titulo || "Nota", nota: { enlace: url, titulo: titulo || "Nota", extracto } } });
    },
    onSuccess: () => {
      avisar("Nota enviada al chat");
      alCerrar();
    },
    onError: avisarError,
  });
  const conApps = useMutation({
    mutationFn: () =>
      compartirConApps({
        titulo: titulo || "Nota",
        texto: `${titulo ? `# ${titulo}\n\n` : ""}${textoPlano}`,
        archivos: adjuntos.filter((a) => a.imagen).map((a) => ({ url: api_base(a.url), nombre: a.nombre })),
      }),
    onSuccess: (r) => avisar(r === "copiado" ? "Texto copiado (las fotos no se pudieron adjuntar aquí)" : "Listo"),
    onError: avisarError,
  });
  const quitar = useMutation({ mutationFn: () => api(`/api/notas/${nota.id}/compartir`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });
  const nuevo = useMutation({ mutationFn: crearEnlace, onError: avisarError });
  return (
    <Modal abierto titulo="Compartir nota" alCerrar={alCerrar}>
      <div className="space-y-4 text-sm">
        {puedeChat ? (
          <section className="space-y-2">
            <p className="font-medium">Por el chat de Mi Setup</p>
            <div className="flex gap-2">
              <Selector value={canal || canales.data?.[0]?.id || ""} onChange={(e) => setCanal(e.target.value)}>
                {(canales.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Selector>
              <Boton variante="primario" icono={Send} cargando={porChat.isPending} onClick={() => porChat.mutate()}>
                Enviar
              </Boton>
            </div>
            <p className="text-xs text-tenue">Se manda con un enlace para verla (con fotos) aunque no sea tu cuenta.</p>
          </section>
        ) : null}
        <section className="space-y-2">
          <p className="font-medium">Con otras apps</p>
          <Boton icono={Share2} cargando={conApps.isPending} onClick={() => conApps.mutate()}>
            Compartir texto y fotos
          </Boton>
          <p className="text-xs text-tenue">Para Claude, Gemini, ChatGPT, WhatsApp o correo: las fotos van como imágenes para que la IA las vea.</p>
        </section>
        <section className="space-y-2">
          <p className="font-medium">Enlace para verla sin cuenta</p>
          {enlace.data?.activo && enlace.data.url ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Entrada readOnly value={enlace.data.url} onFocus={(e) => e.target.select()} />
                <Boton tamano="icono" icono={Copy} aria-label="Copiar enlace" onClick={() => void navigator.clipboard.writeText(enlace.data!.url!).then(() => avisar("Enlace copiado"))} />
              </div>
              <p className="text-xs text-tenue">{enlace.data.vence ? `Vence ${new Date(enlace.data.vence).toLocaleDateString("es-MX")}` : "No vence"}. Quien lo tenga puede leer la nota (no editarla).</p>
              <Boton tamano="sm" variante="peligro" cargando={quitar.isPending} onClick={() => quitar.mutate()}>
                Dejar de compartir
              </Boton>
            </div>
          ) : (
            <div className="flex gap-2">
              <Selector value={dias} onChange={(e) => setDias(e.target.value)} className="w-40">
                <option value="1">1 día</option>
                <option value="7">7 días</option>
                <option value="30">30 días</option>
                <option value="">Sin vencer</option>
              </Selector>
              <Boton icono={Link2} cargando={nuevo.isPending} onClick={() => nuevo.mutate()}>
                Crear enlace
              </Boton>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

export function EditorNota({ nota, notas, puedeEditar, alVolver, alAbrir }: { nota: Nota; notas: Nota[]; puedeEditar: boolean; alVolver: () => void; alAbrir: (id: string) => void }) {
  const [titulo, setTitulo] = useState(nota.titulo);
  const [contenido, setContenido] = useState(nota.contenido);
  const [modo, setModo] = useState<Modo>(nota.contenido ? "pagina" : "editar");
  const [estado, setEstado] = useState<"guardado" | "pendiente" | "guardando">("guardado");
  const [iconos, setIconos] = useState(false);
  const [colores, setColores] = useState(false);
  const [dibujando, setDibujando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const [grabando, setGrabando] = useState<Grabacion | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [dictando, setDictando] = useState<(() => void) | null>(null);
  const [parcial, setParcial] = useState("");
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const entradaImagen = useRef<HTMLInputElement>(null);
  const entradaArchivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitulo(nota.titulo);
    setContenido(nota.contenido);
    setEstado("guardado");
    setModo(nota.contenido ? "pagina" : "editar");
    // Solo al cambiar de nota; los cambios remotos de la misma nota no pisan lo que se escribe.
  }, [nota.id]);

  const adjuntos = useQuery({ queryKey: ["notas", nota.id, "adjuntos"], queryFn: () => api<Adjunto[]>(`/api/notas/${nota.id}/adjuntos`) });

  const guardar = (cambios: Partial<Nota>, inmediato = false) => {
    setEstado("pendiente");
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(
      async () => {
        setEstado("guardando");
        try {
          await api(`/api/notas/${nota.id}`, { metodo: "PATCH", cuerpo: cambios });
          setEstado("guardado");
          void queryClient.invalidateQueries({ queryKey: ["notas"] });
        } catch (err) {
          avisarError(err);
          setEstado("pendiente");
        }
      },
      inmediato ? 0 : 700,
    );
  };

  const cambiarContenido = (c: string, inmediato = false) => {
    setContenido(c);
    guardar({ contenido: c }, inmediato);
  };

  /** Inserta formato donde está el cursor (envuelve lo seleccionado). */
  const insertar = (antes: string, despues = "", enLinea = false, texto = "") => {
    const t = area.current;
    if (!t) return cambiarContenido(contenido + antes + texto + despues);
    const [i, f] = [t.selectionStart, t.selectionEnd];
    const prefijo = enLinea && i > 0 && contenido[i - 1] !== "\n" ? "\n" : "";
    const seleccion = contenido.slice(i, f) || texto;
    cambiarContenido(contenido.slice(0, i) + prefijo + antes + seleccion + despues + contenido.slice(f));
    requestAnimationFrame(() => {
      t.focus();
      const pos = i + prefijo.length + antes.length + seleccion.length + (seleccion ? despues.length : 0);
      t.setSelectionRange(pos, pos);
    });
  };

  const subir = async (archivo: File | Blob, nombre?: string) => {
    setSubiendo(true);
    try {
      const datos = new FormData();
      datos.append("archivo", archivo, nombre ?? (archivo instanceof File ? archivo.name : "dibujo.png"));
      const a = await api<Adjunto>(`/api/notas/${nota.id}/adjuntos`, { formulario: datos });
      void adjuntos.refetch();
      insertar(a.imagen ? `![${a.nombre}](${a.url})` : `[📎 ${a.nombre} (${fmtTamano(a.tamano)})](${a.url})`, "", true);
      if (modo === "pagina") setModo("vivo");
    } catch (err) {
      avisarError(err);
    } finally {
      setSubiendo(false);
    }
  };

  // Mientras se graba, el contador de segundos.
  useEffect(() => {
    if (!grabando) return;
    const t = setInterval(() => setSegundos(grabando.segundos()), 500);
    return () => clearInterval(t);
  }, [grabando]);

  const notaDeVoz = async () => {
    if (grabando) {
      const g = grabando;
      setGrabando(null);
      const { audio, duracion, tipo } = await g.detener();
      setSubiendo(true);
      try {
        const datos = new FormData();
        datos.append("archivo", audio, `nota-de-voz-${Date.now()}.${extensionDe(tipo)}`);
        const a = await api<Adjunto>(`/api/notas/${nota.id}/adjuntos`, { formulario: datos });
        void adjuntos.refetch();
        insertar(`[🎤 Nota de voz (${fmtDuracion(duracion)})](${a.url})`, "", true);
        if (modo === "pagina") setModo("vivo");
      } catch (err) {
        avisarError(err);
      } finally {
        setSubiendo(false);
      }
      return;
    }
    try {
      setSegundos(0);
      setGrabando(await grabarAudio());
    } catch (err) {
      avisarError(err);
    }
  };

  /** Dictado: lo que dices se va escribiendo donde está el cursor. */
  const alternarDictado = async () => {
    if (dictando) {
      dictando();
      setDictando(null);
      setParcial("");
      return;
    }
    try {
      const parar = await dictar(
        (texto, final) => {
          if (!final) return setParcial(texto);
          setParcial("");
          const frase = texto.trim();
          if (frase) insertar(`${frase} `, "", false);
        },
        (e) => {
          avisarError(e);
          setDictando(null);
          setParcial("");
        },
      );
      setDictando(() => parar);
    } catch (err) {
      avisarError(err);
    }
  };
  useEffect(() => () => dictando?.(), [dictando]);

  const html = useMemo(() => aHtml(contenido), [contenido]);
  const hijas = notas.filter((n) => n.padre === nota.id);
  const ruta: Nota[] = [];
  let p = notas.find((n) => n.id === nota.padre);
  while (p && ruta.length < 10) {
    ruta.unshift(p);
    const padreId: string | null = p.padre;
    p = notas.find((n) => n.id === padreId);
  }

  const subpagina = useMutation({
    mutationFn: () => api<Nota>("/api/notas", { cuerpo: { titulo: "Nueva subpágina", padre: nota.id, icono: "📄" } }),
    onSuccess: (n) => {
      void queryClient.invalidateQueries({ queryKey: ["notas"] });
      alAbrir(n.id);
    },
    onError: avisarError,
  });
  const cambiarIcono = (i: string) => {
    setIconos(false);
    void api(`/api/notas/${nota.id}`, { metodo: "PATCH", cuerpo: { icono: i } }).then(() => queryClient.invalidateQueries({ queryKey: ["notas"] }));
  };
  const cambiarColor = (c: ColorNota | null) => {
    setColores(false);
    void api(`/api/notas/${nota.id}`, { metodo: "PATCH", cuerpo: { color: c } }).then(() => queryClient.invalidateQueries({ queryKey: ["notas"] }));
  };
  const borrarAdjunto = async (a: Adjunto) => {
    if (!(await confirmar({ titulo: "Quitar adjunto", mensaje: `${a.nombre} se borra de la nota.`, boton: "Quitar" }))) return;
    await api(`/api/notas/adjuntos/${a.id}`, { metodo: "DELETE" }).catch(avisarError);
    cambiarContenido(quitarAdjunto(contenido, a.url), true);
    void adjuntos.refetch();
  };

  /** Clics en la página: casillas, spoilers (se muestran al tocar) y enlaces/archivos. */
  const alTocarPagina = (e: React.MouseEvent<HTMLDivElement>) => {
    const objetivo = e.target as HTMLElement;
    const spoiler = objetivo.closest("[data-spoiler]");
    if (spoiler) {
      spoiler.toggleAttribute("data-revelado");
      return;
    }
    const enlace = objetivo.closest("a");
    if (enlace?.getAttribute("href")) {
      e.preventDefault();
      abrirExterno(enlace.href);
      return;
    }
    const n = objetivo.getAttribute("data-casilla");
    if (n === null || !puedeEditar) return;
    e.preventDefault();
    cambiarContenido(alternarCasilla(contenido, Number(n)), true);
  };

  const atajos = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const mapa: Record<string, [string, string]> = { b: ["**", "**"], i: ["*", "*"], u: ["__", "__"] };
    const f = mapa[e.key.toLowerCase()];
    if (f) {
      e.preventDefault();
      insertar(f[0], f[1]);
    }
  };

  const pegar = (e: React.ClipboardEvent) => {
    const imagen = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (imagen) {
      e.preventDefault();
      void subir(imagen, `foto-${Date.now()}.png`);
    }
  };
  const soltar = (e: React.DragEvent) => {
    const archivos = [...e.dataTransfer.files];
    if (!archivos.length) return;
    e.preventDefault();
    for (const f of archivos) void subir(f);
  };

  const herramientas: { icono: typeof Bold; texto: string; accion: () => void }[] = [
    { icono: Bold, texto: "Negrita (Ctrl+B)", accion: () => insertar("**", "**", false, "texto") },
    { icono: Italic, texto: "Cursiva (Ctrl+I)", accion: () => insertar("*", "*", false, "texto") },
    { icono: Underline, texto: "Subrayado (Ctrl+U)", accion: () => insertar("__", "__", false, "texto") },
    { icono: Strikethrough, texto: "Tachado", accion: () => insertar("~~", "~~", false, "texto") },
    { icono: EyeOff, texto: "Spoiler (se esconde hasta tocarlo)", accion: () => insertar("||", "||", false, "secreto") },
    { icono: Code, texto: "Código", accion: () => insertar("`", "`", false, "código") },
    { icono: Heading1, texto: "Título grande", accion: () => insertar("# ", "", true, "Título") },
    { icono: Heading2, texto: "Título mediano", accion: () => insertar("## ", "", true, "Título") },
    { icono: Type, texto: "Texto pequeño", accion: () => insertar("-# ", "", true, "texto pequeño") },
    { icono: Quote, texto: "Cita", accion: () => insertar("> ", "", true, "cita") },
    { icono: List, texto: "Lista", accion: () => insertar("- ", "", true) },
    { icono: CheckSquare, texto: "Tarea", accion: () => insertar("- [ ] ", "", true) },
    { icono: Table, texto: "Tabla", accion: () => insertar("| Columna | Columna |\n| --- | --- |\n|  |  |\n", "", true) },
    { icono: Minus, texto: "Línea", accion: () => insertar("\n---\n", "", true) },
  ];

  const escribiendo = modo === "editar" || modo === "vivo";
  const pagina = (
    <div
      className="pagina-notion min-h-[40vh] min-w-0 flex-1 overflow-x-auto px-4 py-3"
      // HTML limpiado con DOMPurify (sin scripts ni eventos).
      dangerouslySetInnerHTML={{ __html: html || "<p>Página vacía. Toca «Escribir» para empezar.</p>" }}
      onClick={alTocarPagina}
    />
  );

  return (
    <div className="flex h-full min-w-0 flex-col rounded-tarjeta border border-borde bg-superficie" style={{ backgroundColor: fondoNota(nota.color) }}>
      <div className="flex flex-wrap items-center gap-1 border-b border-borde p-2">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alVolver} className="md:hidden" aria-label="Volver" />
        <span className="min-w-0 flex-1 truncate text-xs text-tenue">
          {subiendo ? "Subiendo archivo…" : estado === "guardado" ? `Guardado · ${haceCuanto(nota.actualizada)}` : estado === "guardando" ? "Guardando…" : "Sin guardar"}
        </span>
        <Boton tamano="icono" variante="fantasma" icono={Share2} aria-label="Compartir" title="Compartir" onClick={() => setCompartiendo(true)} />
        <Boton tamano="sm" variante={modo === "pagina" ? "primario" : "fantasma"} icono={BookOpen} onClick={() => setModo("pagina")}>
          Página
        </Boton>
        {puedeEditar ? (
          <>
            <Boton tamano="sm" variante={modo === "editar" ? "primario" : "fantasma"} icono={PenLine} onClick={() => setModo("editar")}>
              Escribir
            </Boton>
            <Boton tamano="sm" variante={modo === "vivo" ? "primario" : "fantasma"} icono={Columns2} onClick={() => setModo("vivo")} className="hidden sm:inline-flex">
              En vivo
            </Boton>
            <Boton tamano="icono" variante="fantasma" icono={Palette} aria-label="Color de la nota" title="Color de la nota" onClick={() => setColores((v) => !v)} />
            <Boton tamano="icono" variante="fantasma" icono={FilePlus2} aria-label="Nueva subpágina" title="Nueva subpágina" onClick={() => subpagina.mutate()} />
            <Boton
              tamano="icono"
              variante="fantasma"
              icono={nota.fijada ? PinOff : Pin}
              aria-label={nota.fijada ? "Desfijar" : "Fijar"}
              onClick={() => void api(`/api/notas/${nota.id}`, { metodo: "PATCH", cuerpo: { fijada: !nota.fijada } }).then(() => queryClient.invalidateQueries({ queryKey: ["notas"] }))}
            />
            <Boton
              tamano="icono"
              variante="fantasma"
              icono={Trash2}
              aria-label="Borrar"
              onClick={async () => {
                const extra = hijas.length ? ` Sus ${hijas.length} subpágina(s) suben un nivel.` : "";
                if (!(await confirmar({ titulo: "Borrar página", mensaje: `¿Borrar "${nota.titulo || "sin título"}"?${extra}`, boton: "Borrar" }))) return;
                await api(`/api/notas/${nota.id}`, { metodo: "DELETE" }).catch(avisarError);
                await queryClient.invalidateQueries({ queryKey: ["notas"] });
                alVolver();
              }}
            />
          </>
        ) : null}
      </div>

      {colores ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-borde px-4 py-2">
          <button type="button" onClick={() => cambiarColor(null)} className={cx("rounded-full border px-2 py-0.5 text-xs", !nota.color ? "border-acento" : "border-borde")}>
            Sin color
          </button>
          {(Object.keys(COLORES_NOTA) as ColorNota[]).map((c) => (
            <button key={c} type="button" aria-label={COLORES_NOTA[c].nombre} title={COLORES_NOTA[c].nombre} onClick={() => cambiarColor(c)} className={cx("h-6 w-6 rounded-full border-2", nota.color === c ? "border-white" : "border-transparent")} style={{ background: COLORES_NOTA[c].punto }} />
          ))}
        </div>
      ) : null}

      {ruta.length ? (
        <div className="flex flex-wrap items-center gap-1 px-4 pt-3 text-xs text-tenue">
          {ruta.map((r) => (
            <span key={r.id} className="flex items-center gap-1">
              <button type="button" className="hover:underline" onClick={() => alAbrir(r.id)}>
                {r.icono ?? "📄"} {r.titulo || "Sin título"}
              </button>
              <ChevronRight className="h-3 w-3" />
            </span>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2 px-4 pt-3">
        <button type="button" disabled={!puedeEditar} onClick={() => setIconos((v) => !v)} className="text-2xl" aria-label="Cambiar ícono">
          {nota.icono ?? "📝"}
        </button>
        <input
          value={titulo}
          readOnly={!puedeEditar}
          placeholder="Título"
          onChange={(e) => {
            setTitulo(e.target.value);
            guardar({ titulo: e.target.value });
          }}
          className="min-w-0 flex-1 bg-transparent font-titulo text-xl font-semibold outline-none placeholder:text-tenue"
        />
      </div>
      {iconos ? (
        <div className="flex flex-wrap gap-1 px-4 pt-2">
          {ICONOS.map((i) => (
            <button key={i} type="button" className="rounded-lg p-1 text-xl hover:bg-tarjeta" onClick={() => cambiarIcono(i)}>
              {i}
            </button>
          ))}
        </div>
      ) : null}

      {escribiendo && puedeEditar ? (
        <>
          <div className="flex gap-1 overflow-x-auto px-3 pt-2">
            {herramientas.map((h) => (
              <Boton key={h.texto} tamano="icono" variante="fantasma" icono={h.icono} aria-label={h.texto} title={h.texto} onClick={h.accion} />
            ))}
            <span className="mx-1 w-px shrink-0 bg-borde" />
            <Boton tamano="icono" variante="fantasma" icono={ImagePlus} aria-label="Foto o imagen" title="Foto o imagen" cargando={subiendo} onClick={() => entradaImagen.current?.click()} />
            <Boton tamano="icono" variante="fantasma" icono={Paperclip} aria-label="Adjuntar archivo" title="Adjuntar archivo" onClick={() => entradaArchivo.current?.click()} />
            <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Dibujar" title="Dibujar" onClick={() => setDibujando(true)} />
            <Boton
              tamano="icono"
              variante={grabando ? "peligro" : "fantasma"}
              icono={grabando ? Square : Mic}
              aria-label={grabando ? "Terminar nota de voz" : "Nota de voz"}
              title={grabando ? "Terminar nota de voz" : "Nota de voz"}
              onClick={() => void notaDeVoz()}
            />
            <Boton
              tamano="icono"
              variante={dictando ? "primario" : "fantasma"}
              icono={AudioLines}
              aria-label={dictando ? "Dejar de dictar" : "Dictar (lo que digas se escribe)"}
              title={dictando ? "Dejar de dictar" : "Dictar (lo que digas se escribe)"}
              onClick={() => void alternarDictado()}
            />
            <input
              ref={entradaImagen}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                for (const f of e.target.files ?? []) void subir(f);
                e.target.value = "";
              }}
            />
            <input
              ref={entradaArchivo}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                for (const f of e.target.files ?? []) void subir(f);
                e.target.value = "";
              }}
            />
          </div>
          {grabando || dictando ? (
            <p className="mx-4 mt-2 flex items-center gap-2 rounded-xl bg-fondo px-3 py-1.5 text-xs">
              <span className="h-2 w-2 animate-pulse rounded-full bg-peligro" />
              {grabando ? `Grabando nota de voz… ${fmtDuracion(segundos)} (toca el cuadro rojo para terminar)` : parcial ? `Escuchando: ${parcial}` : "Escuchando… habla y se irá escribiendo"}
            </p>
          ) : null}
          <div className={cx("flex min-h-0 flex-1 flex-col", modo === "vivo" && "md:grid md:grid-cols-2")}>
            <textarea
              ref={area}
              value={contenido}
              placeholder={"Escribe aquí… **negrita**, *cursiva*, __subrayado__, ||spoiler||, # título, > cita. También puedes pegar o arrastrar fotos."}
              onChange={(e) => cambiarContenido(e.target.value)}
              onKeyDown={atajos}
              onPaste={pegar}
              onDrop={soltar}
              onDragOver={(e) => e.preventDefault()}
              className="min-h-[40vh] flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none placeholder:text-tenue"
            />
            {modo === "vivo" ? <div className="min-h-[20vh] border-t border-borde md:border-l md:border-t-0">{pagina}</div> : null}
          </div>
        </>
      ) : (
        pagina
      )}

      {adjuntos.data?.length ? (
        <details className="border-t border-borde px-4 py-2 text-xs">
          <summary className="cursor-pointer text-tenue">Adjuntos ({adjuntos.data.length})</summary>
          <Boton
            className="mt-2"
            tamano="sm"
            variante="secundario"
            icono={Download}
            onClick={async () => {
              let donde = "";
              for (const a of adjuntos.data ?? []) donde = await guardarEnDispositivo(api_base(a.url), a.nombre).catch(() => donde);
              avisar(donde ? `Guardados en ${donde}` : "No se pudo guardar");
            }}
          >
            Guardar todos en este dispositivo
          </Boton>
          <ul className="mt-2 space-y-1">
            {adjuntos.data.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                {a.imagen ? <img src={`${api_base(a.url)}`} alt="" className="h-8 w-8 rounded object-cover" /> : <Paperclip className="h-4 w-4 text-tenue" />}
                <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => abrirExterno(api_base(a.url))}>
                  {a.nombre}
                </button>
                <span className="text-tenue">{fmtTamano(a.tamano)}</span>
                <Boton
                  tamano="icono"
                  variante="fantasma"
                  icono={Download}
                  aria-label={`Guardar ${a.nombre}`}
                  onClick={() => void guardarEnDispositivo(api_base(a.url), a.nombre).then((d) => avisar(`Guardado en ${d}`), avisarError)}
                />
                {puedeEditar ? <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label={`Quitar ${a.nombre}`} onClick={() => void borrarAdjunto(a)} /> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {hijas.length ? (
        <div className="border-t border-borde px-4 py-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-tenue">Subpáginas</p>
          <div className="flex flex-wrap gap-2">
            {hijas.map((h) => (
              <button key={h.id} type="button" onClick={() => alAbrir(h.id)} className="rounded-xl border border-borde px-3 py-1.5 text-sm hover:bg-tarjeta">
                {h.icono ?? "📄"} {h.titulo || "Sin título"}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {compartiendo ? <CompartirNota nota={nota} titulo={titulo} contenido={contenido} adjuntos={adjuntos.data ?? []} alCerrar={() => setCompartiendo(false)} /> : null}
      {dibujando ? (
        <Dibujo
          alCerrar={() => setDibujando(false)}
          alGuardar={async (png) => {
            await subir(png, `dibujo-${Date.now()}.png`);
            setDibujando(false);
            avisar("Dibujo agregado a la nota");
          }}
        />
      ) : null}
    </div>
  );
}

/** Dirección completa de un adjunto (en el celular /api/… no existe dentro de la app). */
function api_base(ruta: string): string {
  return ruta.startsWith("/") ? `${API_BASE}${ruta}` : ruta;
}
