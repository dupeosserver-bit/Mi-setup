import { usePaginado } from "../components/Paginas";
import { DetectorIa, HacerNatural } from "../components/IaExtras";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Copy, Download, Eraser, FileText, Globe, ImagePlus, Languages, Maximize2, Pencil, Plus, ScanSearch, Send, Sparkles, Trash2, Wand2, type LucideIcon } from "lucide-react";
import { Fragment, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { useModoPagina } from "../lib/marco";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";

interface Plantilla {
  id: string;
  titulo: string;
  cuerpo: string;
  categoria: string;
}

function usarEnIa(navegar: (r: string) => void, texto: string) {
  if (texto.length < 1500) return navegar(`/ia?pregunta=${encodeURIComponent(texto)}`);
  try {
    sessionStorage.setItem("mi-setup.pregunta", texto.slice(0, 100_000));
    navegar("/ia?pregunta=@sesion");
  } catch {
    navegar(`/ia?pregunta=${encodeURIComponent(texto.slice(0, 1500))}`);
  }
}

const huecos = (cuerpo: string) => [...new Set([...cuerpo.matchAll(/\{([^{}]{1,40})\}/g)].map((m) => m[1]!))];

function ConHuecos({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(/(\{[^{}]{1,40}\})/g).map((parte, i) =>
        /^\{[^{}]+\}$/.test(parte) ? (
          <span key={i} className="rounded px-1 font-medium text-acento" style={{ background: "color-mix(in srgb, var(--acento) 14%, transparent)" }}>
            {parte}
          </span>
        ) : (
          <Fragment key={i}>{parte}</Fragment>
        ),
      )}
    </>
  );
}

const EJEMPLOS: Omit<Plantilla, "id">[] = [
  { titulo: "Publicación para Instagram", categoria: "Redes", cuerpo: "Escribe una publicación para Instagram de {negocio} sobre {tema}. Tono alegre, 3 hashtags y una llamada a la acción." },
  { titulo: "Responder a un cliente", categoria: "Negocio", cuerpo: "Ayúdame a responder amablemente a un cliente que dice: \"{mensaje}\". Mi servidor es de {juego}." },
  { titulo: "Explicar un código", categoria: "Programación", cuerpo: "Explícame en español sencillo qué hace este código y si tiene errores:\n{codigo}" },
];

function Prompts() {
  const navegar = useNavigate();
  const puede = usePuede("ia_creativa", "escritura");
  const q = useQuery({ queryKey: ["prompts"], queryFn: () => api<Plantilla[]>("/api/prompts") });
  const [editar, setEditar] = useState<Partial<Plantilla> | null>(null);
  const [usar, setUsar] = useState<Plantilla | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["prompts"] });
  const guardar = useMutation({
    mutationFn: (p: Partial<Plantilla>) => (p.id ? api(`/api/prompts/${p.id}`, { metodo: "PATCH", cuerpo: p }) : api("/api/prompts", { cuerpo: p })),
    onSuccess: () => {
      setEditar(null);
      refrescar();
    },
    onError: avisarError,
  });
  const borrar = useMutation({ mutationFn: (id: string) => api(`/api/prompts/${id}`, { metodo: "DELETE" }), onSuccess: refrescar, onError: avisarError });
  const final = usar ? usar.cuerpo.replace(/\{([^{}]{1,40})\}/g, (_m, k: string) => valores[k] || `{${k}}`) : "";

  const pgPr = usePaginado(q.data, 12);
  return (
    <div className="space-y-4">
      {puede ? (
        <div className="flex flex-wrap gap-2">
          <Boton variante="primario" icono={Plus} onClick={() => setEditar({ titulo: "", cuerpo: "", categoria: "General" })}>
            Nueva plantilla
          </Boton>
          {q.data?.length === 0
            ? EJEMPLOS.map((e) => (
                <Boton key={e.titulo} tamano="sm" variante="fantasma" onClick={() => guardar.mutate(e)}>
                  + {e.titulo}
                </Boton>
              ))
            : null}
        </div>
      ) : null}
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data?.length === 0 ? <Vacio icono={Wand2} texto="Guarda tus prompts favoritos. Escribe {así} lo que cambia cada vez." /> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {pgPr.visibles.map((p) => (
          <Tarjeta
            key={p.id}
            titulo={p.titulo}
            acciones={
              puede ? (
                <>
                  <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Editar" onClick={() => setEditar(p)} />
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label="Borrar"
                    onClick={async () => {
                      if (await confirmar({ titulo: "Borrar plantilla", mensaje: p.titulo, boton: "Borrar" })) borrar.mutate(p.id);
                    }}
                  />
                </>
              ) : null
            }
          >
            <p className="line-clamp-4 whitespace-pre-wrap text-sm text-tenue">
              <ConHuecos texto={p.cuerpo} />
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-tarjeta px-2 py-0.5 text-xs">{p.categoria}</span>
              <Boton
                tamano="sm"
                variante="primario"
                icono={Sparkles}
                onClick={() => {
                  setValores({});
                  setUsar(p);
                }}
              >
                Usar
              </Boton>
            </div>
          </Tarjeta>
        ))}
      </div>
      {pgPr.paginas}

      <Modal abierto={editar !== null} titulo={editar?.id ? "Editar plantilla" : "Nueva plantilla"} alCerrar={() => setEditar(null)}>
        {editar ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              guardar.mutate(editar);
            }}
          >
            <Campo etiqueta="Nombre">
              <Entrada value={editar.titulo ?? ""} onChange={(e) => setEditar({ ...editar, titulo: e.target.value })} required maxLength={120} />
            </Campo>
            <Campo etiqueta="Categoría">
              <Entrada value={editar.categoria ?? ""} onChange={(e) => setEditar({ ...editar, categoria: e.target.value })} maxLength={40} />
            </Campo>
            <Campo etiqueta="Prompt" ayuda="Escribe {nombre} donde quieras rellenar algo cada vez.">
              <AreaTexto value={editar.cuerpo ?? ""} onChange={(e) => setEditar({ ...editar, cuerpo: e.target.value })} rows={8} required />
            </Campo>
            <Boton type="submit" variante="primario" cargando={guardar.isPending}>
              Guardar
            </Boton>
          </form>
        ) : null}
      </Modal>

      <Modal abierto={usar !== null} titulo={usar?.titulo ?? ""} alCerrar={() => setUsar(null)}>
        {usar ? (
          <div className="space-y-3">
            {huecos(usar.cuerpo).map((h) => (
              <Campo key={h} etiqueta={h}>
                <AreaTexto rows={h.toLowerCase().includes("codigo") || h.toLowerCase().includes("mensaje") ? 4 : 1} value={valores[h] ?? ""} onChange={(e) => setValores({ ...valores, [h]: e.target.value })} />
              </Campo>
            ))}
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl bg-fondo p-3 text-xs">{final}</pre>
            <div className="flex flex-wrap gap-2">
              <Boton variante="primario" icono={Sparkles} onClick={() => usarEnIa(navegar, final)}>
                Mandar a la IA
              </Boton>
              <Boton icono={Copy} onClick={() => void navigator.clipboard.writeText(final).then(() => avisar("Copiado"))}>
                Copiar (para ChatGPT u otra IA)
              </Boton>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function QuitarFondo() {
  const ref = useRef<HTMLInputElement>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [estado, setEstado] = useState<string | null>(null);

  const procesar = async (f: File | undefined) => {
    if (!f) return;
    setOriginal(URL.createObjectURL(f));
    setResultado(null);
    setEstado("Preparando (la primera vez baja el modelo, unos 40 MB)…");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const b = await removeBackground(f, {
        progress: (clave: string, actual: number, total: number) => {
          if (clave.startsWith("fetch")) setEstado(`Bajando el modelo… ${total ? Math.round((actual / total) * 100) : 0}%`);
          else setEstado("Quitando el fondo…");
        },
      });
      setResultado(URL.createObjectURL(b));
    } catch (err) {
      avisarError(err);
    } finally {
      setEstado(null);
    }
  };

  return (
    <Tarjeta titulo="Quitar el fondo de una foto" icono={Eraser}>
      <div className="space-y-3">
        <p className="text-sm text-tenue">Se hace en tu equipo y es gratis. Funciona mejor con personas, mascotas y productos.</p>
        <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => {
          void procesar(e.target.files?.[0]);
          e.target.value = "";
        }} />
        <Boton variante="primario" icono={Eraser} disabled={estado !== null} onClick={() => ref.current?.click()}>
          {estado ?? "Elegir foto"}
        </Boton>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {original ? <img src={original} alt="Original" className="max-h-80 w-full rounded-xl object-contain" /> : null}
          {resultado ? (
            <div className="space-y-2">
              <img
                src={resultado}
                alt="Sin fondo"
                className="max-h-80 w-full rounded-xl object-contain"
                style={{ backgroundImage: "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%)", backgroundSize: "20px 20px" }}
              />
              <a href={resultado} download="sin-fondo.png" className="inline-flex h-10 items-center gap-2 rounded-xl bg-acento px-4 text-sm font-medium text-black">
                <Download className="h-4 w-4" /> Descargar PNG
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </Tarjeta>
  );
}

const TAREAS = {
  resumir: "Resume en español, en viñetas cortas y fáciles de entender, lo más importante de este texto:",
  traducir: "Traduce al español este texto, de forma natural:",
  ingles: "Traduce al inglés este texto, de forma natural:",
  mejorar: "Mejora la redacción y la ortografía de este texto sin cambiar su sentido:",
} as const;

function ResumirTraducir() {
  const navegar = useNavigate();
  const [tarea, setTarea] = useState<keyof typeof TAREAS>("resumir");
  const [texto, setTexto] = useState("");
  const [url, setUrl] = useState("");
  const pagina = useMutation({
    mutationFn: () => api<{ titulo: string; texto: string }>(`/api/ia-creativa/pagina?url=${encodeURIComponent(url.trim())}`),
    onSuccess: (r) => setTexto(`${r.titulo}\n\n${r.texto}`),
    onError: avisarError,
  });
  const palabras = useMemo(() => (texto.trim() ? texto.trim().split(/\s+/).length : 0), [texto]);

  return (
    <Tarjeta titulo="Resumir o traducir" icono={Languages}>
      <div className="space-y-3">
        <Selector value={tarea} onChange={(e) => setTarea(e.target.value as keyof typeof TAREAS)}>
          <option value="resumir">Resumir</option>
          <option value="traducir">Traducir al español</option>
          <option value="ingles">Traducir al inglés</option>
          <option value="mejorar">Mejorar redacción</option>
        </Selector>
        <div className="flex gap-2">
          <Entrada value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Enlace de una noticia o página (opcional)" inputMode="url" />
          <Boton icono={Globe} disabled={!url.trim()} cargando={pagina.isPending} onClick={() => pagina.mutate()}>
            Traer texto
          </Boton>
        </div>
        <AreaTexto value={texto} onChange={(e) => setTexto(e.target.value)} rows={8} placeholder="…o pega aquí el texto" />
        <p className="text-xs text-tenue">
          {palabras} palabras. <FileText className="inline h-3 w-3" /> Para un PDF: en la IA asistente toca el clip y adjúntalo, luego pide "resúmelo".
        </p>
        <Boton variante="primario" icono={Sparkles} disabled={!texto.trim()} onClick={() => usarEnIa(navegar, `${TAREAS[tarea]}\n\n${texto}`)}>
          Mandar a la IA
        </Boton>
      </div>
    </Tarjeta>
  );
}

const leerComoDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("No se pudo leer la foto"));
    r.readAsDataURL(f);
  });

type Proporcion = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
interface Hecha {
  src: string;
  prompt: string;
  proporcion: Proporcion;
}

const PROPORCIONES: { id: Proporcion; texto: string }[] = [
  { id: "1:1", texto: "Cuadrada 1:1" },
  { id: "16:9", texto: "Horizontal 16:9" },
  { id: "9:16", texto: "Vertical 9:16 (historias)" },
  { id: "4:3", texto: "4:3" },
  { id: "3:4", texto: "3:4" },
];

function ImagenGrande({ hechas, indice, alElegir, alCerrar, alCambiar, creando, error }: {
  hechas: Hecha[];
  indice: number;
  alElegir: (i: number) => void;
  alCerrar: () => void;
  alCambiar: (cambio: string) => void;
  creando: boolean;
  error: unknown;
}) {
  useModoPagina("completa");
  const [cambio, setCambio] = useState("");
  const actual = hechas[indice];
  if (!actual) return null;
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-fondo" style={{ height: "var(--alto-app, 100dvh)" }}>
      <header className="flex items-center gap-2 border-b border-borde px-3 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <Boton tamano="icono" variante="fantasma" icono={ChevronLeft} aria-label="Volver" onClick={alCerrar} />
        <b className="min-w-0 flex-1 truncate">Crear imágenes</b>
        <a href={actual.src} download={`imagen-${indice + 1}.png`} className="inline-flex h-8 items-center gap-1 rounded-xl bg-acento px-3 text-xs font-medium text-black">
          <Download className="h-3.5 w-3.5" /> Descargar
        </a>
      </header>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-3">
          <div className="grid min-h-0 flex-1 place-items-center overflow-hidden rounded-xl border border-borde bg-black/40 p-2">
            <img src={actual.src} alt={actual.prompt} className="max-h-full max-w-full rounded-lg object-contain" />
          </div>
          {hechas.length > 1 ? (
            <div className="flex shrink-0 gap-2 overflow-x-auto pb-1" aria-label="Versiones">
              {hechas.map((h, i) => (
                <button key={`${i}-${h.src.length}`} type="button" onClick={() => alElegir(i)} aria-current={i === indice ? "true" : undefined} className={cx("h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2", i === indice ? "border-acento" : "border-transparent opacity-70 hover:opacity-100")}>
                  <img src={h.src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </section>
        <aside className="flex max-h-[45%] shrink-0 flex-col gap-3 overflow-y-auto border-t border-borde p-3 lg:max-h-none lg:w-96 lg:border-l lg:border-t-0">
          <div className="rounded-xl border border-borde bg-superficie p-3 text-sm">
            <p className="text-xs text-tenue">Lo que pediste</p>
            <p className="mt-1 whitespace-pre-wrap">{actual.prompt}</p>
            <p className="mt-2 text-xs text-tenue">Formato {actual.proporcion}</p>
          </div>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (cambio.trim().length < 3) return;
              alCambiar(cambio.trim());
              setCambio("");
            }}
          >
            <AreaTexto value={cambio} onChange={(e) => setCambio(e.target.value)} rows={3} placeholder="¿Qué quieres cambiar? Ej.: fondo azul, más luz, quita el texto…" />
            <Boton type="submit" variante="primario" icono={Send} cargando={creando} disabled={cambio.trim().length < 3} className="w-full">
              Pedir el cambio
            </Boton>
          </form>
          <ErrorCaja error={error} />
          {creando ? <Cargando texto="Creando la nueva versión (10 a 30 segundos)…" /> : null}
          <p className="text-xs text-tenue">La IA solo propone: la nueva versión se agrega a la lista y tú eliges cuál descargar.</p>
        </aside>
      </div>
    </div>
  );
}

function CrearImagenes() {
  const ref = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [proporcion, setProporcion] = useState<Proporcion>("1:1");
  const [referencias, setReferencias] = useState<string[]>([]);
  const [hechas, setHechas] = useState<Hecha[]>([]);
  const [grande, setGrande] = useState<number | null>(null);
  const crear = useMutation({
    mutationFn: (d: { prompt: string; proporcion: Proporcion; imagenes: string[] }) => api<{ imagenes: string[]; texto: string }>("/api/ia-creativa/imagen", { cuerpo: d }),
    onSuccess: (r, d) => {
      setHechas((h) => [...r.imagenes.map((src) => ({ src, prompt: d.prompt, proporcion: d.proporcion })), ...h].slice(0, 12));
      if (grande !== null) setGrande(0);
    },
  });
  const pagina = usePaginado(hechas.slice(1), 6);
  const agregar = async (archivos: FileList | null) => {
    if (!archivos) return;
    try {
      const nuevas = await Promise.all([...archivos].slice(0, 3).map(leerComoDataUrl));
      setReferencias((r) => [...r, ...nuevas].slice(0, 3));
    } catch (err) {
      avisarError(err);
    }
  };
  const ideas = [
    "Logo para una pastelería llamada «Dulce Hogar», estilo acuarela, tonos rosa y crema",
    "Banner para un servidor de Minecraft llamado MexicanLand, estilo épico, atardecer",
    "Pastel de chocolate con fresas en una mesa de madera, foto profesional",
  ];
  const ultima = hechas[0];

  if (grande !== null && hechas[grande]) {
    return (
      <ImagenGrande
        hechas={hechas}
        indice={grande}
        alElegir={setGrande}
        alCerrar={() => setGrande(null)}
        alCambiar={(cambio) => {
          const base = hechas[grande];
          if (base) crear.mutate({ prompt: cambio, proporcion: base.proporcion, imagenes: [base.src] });
        }}
        creando={crear.isPending}
        error={crear.error}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Tarjeta titulo="Crear imágenes (Nano Banana)" icono={ImagePlus}>
          <div className="space-y-3">
            <AreaTexto value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={5} placeholder="Describe la imagen: qué, estilo, colores, luz… (o qué cambiar en tus fotos)" />
            <div className="flex flex-wrap gap-1">
              {ideas.map((i) => (
                <button key={i} type="button" onClick={() => setPrompt(i)} className="rounded-lg border border-borde px-2 py-1 text-left text-xs text-tenue hover:text-texto">
                  {i}
                </button>
              ))}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-tenue">Formato</p>
              <div className="flex flex-wrap gap-1.5">
                {PROPORCIONES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProporcion(p.id)}
                    aria-pressed={proporcion === p.id}
                    className={cx("rounded-full border px-3 py-1 text-xs", proporcion === p.id ? "border-acento text-acento" : "border-borde text-tenue hover:text-texto")}
                  >
                    {p.texto}
                  </button>
                ))}
              </div>
            </div>
            <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => {
              void agregar(e.target.files);
              e.target.value = "";
            }} />
            <div className="flex flex-wrap gap-2">
              <Boton icono={Plus} disabled={referencias.length >= 3} onClick={() => ref.current?.click()}>
                Foto para editar ({referencias.length}/3)
              </Boton>
              <Boton variante="primario" icono={Sparkles} cargando={crear.isPending} disabled={prompt.trim().length < 3} onClick={() => crear.mutate({ prompt, proporcion, imagenes: referencias })}>
                {referencias.length ? "Editar con IA" : "Crear imagen"}
              </Boton>
            </div>
            {referencias.length ? (
              <div className="flex flex-wrap gap-2">
                {referencias.map((r, i) => (
                  <div key={i} className="relative">
                    <img src={r} alt="" className="h-20 w-20 rounded-lg object-cover" />
                    <button type="button" aria-label="Quitar foto" onClick={() => setReferencias((x) => x.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-black/80 p-1 text-white">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-tenue">Usa Nano Banana de Google (Gemini). Necesita GEMINI_API_KEY en Ajustes → Servicios y claves; Google puede cobrar por imagen según tu plan.</p>
          </div>
        </Tarjeta>
        <Tarjeta titulo="La IA propone" icono={Sparkles}>
          <ErrorCaja error={crear.error} />
          {crear.isPending ? <Cargando texto="Creando la imagen (10 a 30 segundos)…" /> : null}
          {!ultima && !crear.isPending ? <Vacio icono={ImagePlus} texto="Describe lo que quieres y toca «Crear imagen». Aquí verás lo que propone la IA." /> : null}
          {ultima ? (
            <div className="space-y-3">
              <button type="button" onClick={() => setGrande(0)} className="grid w-full place-items-center overflow-hidden rounded-xl border border-borde bg-black/40 p-2" aria-label="Ver en grande">
                <img src={ultima.src} alt={ultima.prompt} className="max-h-[26rem] max-w-full rounded-lg object-contain" />
              </button>
              <p className="line-clamp-2 text-xs text-tenue">{ultima.prompt}</p>
              <div className="flex flex-wrap gap-2">
                <a href={ultima.src} download="imagen-1.png" className="inline-flex h-10 items-center gap-2 rounded-xl bg-acento px-4 text-sm font-medium text-black">
                  <Download className="h-4 w-4" /> Descargar
                </a>
                <Boton icono={Maximize2} onClick={() => setGrande(0)}>
                  Ver en grande y pedir cambios
                </Boton>
                <Boton icono={Pencil} onClick={() => setReferencias([ultima.src])}>
                  Seguir editando
                </Boton>
              </div>
            </div>
          ) : null}
        </Tarjeta>
      </div>
      {hechas.length > 1 ? (
        <Tarjeta titulo="Tus creaciones" icono={ImagePlus}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {pagina.visibles.map((h) => {
              const i = hechas.indexOf(h);
              return (
                <button key={`${i}-${h.src.length}`} type="button" onClick={() => setGrande(i)} className="group min-w-0 text-left">
                  <img src={h.src} alt={h.prompt} className="aspect-square w-full rounded-lg object-cover transition group-hover:opacity-80" />
                  <span className="mt-1 line-clamp-1 block text-xs text-tenue">{h.prompt}</span>
                </button>
              );
            })}
          </div>
          {pagina.paginas}
        </Tarjeta>
      ) : null}
    </div>
  );
}

type Herramienta = "prompts" | "imagenes" | "fondo" | "texto" | "detector" | "natural";
const HERRAMIENTAS: { id: Herramienta; texto: string; icono: LucideIcon }[] = [
  { id: "imagenes", texto: "Crear imágenes", icono: ImagePlus },
  { id: "prompts", texto: "Mis prompts", icono: Wand2 },
  { id: "fondo", texto: "Quitar fondo", icono: Eraser },
  { id: "texto", texto: "Resumir y traducir", icono: Languages },
  { id: "detector", texto: "Detector de IA", icono: ScanSearch },
  { id: "natural", texto: "Hacer más natural", icono: Sparkles },
];

export default function IaCreativa() {
  const [pestana, setPestana] = useState<Herramienta>("imagenes");
  return (
    <div className="space-y-4">
      <Encabezado titulo="IA creativa" descripcion="Tus prompts, crear imágenes, quitar fondos, resumir o traducir, detectar textos de IA y hacerlos más naturales." />
      <nav className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-borde bg-superficie p-1" role="tablist" aria-label="Herramientas">
        {HERRAMIENTAS.map(({ id, texto, icono: Icono }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={cx("flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium", pestana === id ? "text-acento" : "text-tenue hover:text-texto")}
            style={pestana === id ? { background: "color-mix(in srgb, var(--acento) 14%, transparent)" } : undefined}
          >
            <Icono className="h-4 w-4" />
            {texto}
          </button>
        ))}
      </nav>
      {pestana === "prompts" ? <Prompts /> : null}
      {pestana === "imagenes" ? <CrearImagenes /> : null}
      {pestana === "fondo" ? <QuitarFondo /> : null}
      {pestana === "texto" ? <ResumirTraducir /> : null}
      {pestana === "detector" ? <DetectorIa /> : null}
      {pestana === "natural" ? <HacerNatural /> : null}
    </div>
  );
}
