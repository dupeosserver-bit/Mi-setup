/**
 * IA creativa: plantillas de prompts con espacios {así}, quitar el fondo de una
 * foto (en tu equipo, gratis) y resumir o traducir textos, páginas y PDFs.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { Copy, Download, Eraser, FileText, Globe, Languages, Pencil, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";

interface Plantilla {
  id: string;
  titulo: string;
  cuerpo: string;
  categoria: string;
}

/** Abre la IA con un texto ya escrito (los largos van por la sesión del navegador). */
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {q.data?.map((p) => (
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
            <p className="line-clamp-4 whitespace-pre-wrap text-sm text-tenue">{p.cuerpo}</p>
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
              {/* Fondo de cuadritos para que se vea lo transparente. */}
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

export default function IaCreativa() {
  const [pestana, setPestana] = useState<"prompts" | "fondo" | "texto">("prompts");
  return (
    <div className="space-y-4">
      <Encabezado titulo="IA creativa" descripcion="Tus prompts, quitar fondos y resumir o traducir." />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "prompts", texto: "Mis prompts" },
          { id: "fondo", texto: "Quitar fondo" },
          { id: "texto", texto: "Resumir y traducir" },
        ]}
      />
      {pestana === "prompts" ? <Prompts /> : pestana === "fondo" ? <QuitarFondo /> : <ResumirTraducir />}
      <p className="text-xs text-tenue">
        ¿Generar imágenes desde cero? Claude no crea imágenes; se puede agregar con una API de pago (por ejemplo, de imágenes por IA) cuando quieras.
      </p>
    </div>
  );
}
