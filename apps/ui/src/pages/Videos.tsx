import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Clapperboard, Pencil, Play, Search, Trash2, Upload, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { minutos, pesoArchivo, type ArchivoMedia } from "../components/Biblioteca";
import { usePaginado } from "../components/Paginas";
import { Boton, Cargando, Encabezado, Entrada, ErrorCaja, Vacio, avisar, avisarError, cx } from "../components/ui";
import { API_BASE, api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { useModoPagina } from "../lib/marco";
import { subirConAvance } from "../lib/subir";

const COLORES = ["#7c5cff,#ff3d77", "#14b8a6,#3a7bd5", "#f59e0b,#ef4444", "#a855f7,#ec4899", "#22c55e,#0ea5e9", "#f97316,#7c3aed"];

const fuente = (m: ArchivoMedia) => `${API_BASE}${m.url}`;

function Miniatura({ m, indice, grande }: { m: ArchivoMedia; indice: number; grande?: boolean }) {
  const [falla, setFalla] = useState(false);
  const [duracion, setDuracion] = useState<number | null>(null);
  const colores = COLORES[indice % COLORES.length] ?? COLORES[0];
  return (
    <span className="relative block aspect-video w-full overflow-hidden rounded-xl" style={{ background: `linear-gradient(135deg, ${colores})` }}>
      {!falla ? (
        <video
          src={`${fuente(m)}#t=4`}
          preload="metadata"
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
          onLoadedMetadata={(e) => setDuracion(e.currentTarget.duration)}
          onError={() => setFalla(true)}
        />
      ) : null}
      <span className="absolute inset-0 grid place-items-center">
        <span className={cx("grid place-items-center rounded-full bg-black/55 text-white backdrop-blur", grande ? "h-14 w-14" : "h-10 w-10")}>
          <Play className={grande ? "h-6 w-6" : "h-4 w-4"} />
        </span>
      </span>
      {duracion && Number.isFinite(duracion) ? (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/75 px-1.5 py-0.5 font-mono text-[11px] text-white">{minutos(duracion)}</span>
      ) : null}
      {m.progreso > 10 && duracion ? (
        <span className="absolute inset-x-0 bottom-0 h-1 bg-white/25">
          <span className="block h-full bg-[#ff3d3d]" style={{ width: `${Math.min(100, (m.progreso / duracion) * 100)}%` }} />
        </span>
      ) : null}
    </span>
  );
}

function Reproductor({ m, puede, alCerrar, alRenombrar, alBorrar }: { m: ArchivoMedia; puede: boolean; alCerrar: () => void; alRenombrar: () => void; alBorrar: () => void }) {
  useModoPagina("completa");
  const el = useRef<HTMLVideoElement>(null);
  const ultimo = useRef(0);
  const guardar = (progreso: number) => void api(`/api/media/archivo/${m.id}`, { metodo: "PATCH", cuerpo: { progreso: Math.floor(progreso) } }).catch(() => undefined);
  useEffect(() => {
    const v = el.current;
    if (!v) return;
    const alCargar = () => {
      if (m.progreso > 10 && m.progreso < v.duration - 10) v.currentTime = m.progreso;
      void v.play().catch(() => undefined);
    };
    v.addEventListener("loadedmetadata", alCargar, { once: true });
    return () => v.removeEventListener("loadedmetadata", alCargar);
  }, [m]);
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white" style={{ height: "var(--alto-app, 100dvh)" }}>
      <header className="flex items-center gap-2 px-3 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <Boton
          tamano="icono"
          variante="fantasma"
          icono={ChevronLeft}
          aria-label="Volver"
          onClick={() => {
            if (el.current) guardar(el.current.currentTime);
            void queryClient.invalidateQueries({ queryKey: ["media", "videos"] });
            alCerrar();
          }}
        />
        <b className="min-w-0 flex-1 truncate">{m.titulo}</b>
        {m.progreso > 10 ? <span className="hidden text-xs text-white/70 sm:inline">{`Seguimos donde te quedaste · ${minutos(m.progreso)}`}</span> : null}
        {puede ? (
          <>
            <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Cambiar nombre" onClick={alRenombrar} />
            <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={alBorrar} />
          </>
        ) : null}
      </header>
      <video
        ref={el}
        key={m.id}
        src={fuente(m)}
        controls
        playsInline
        className="min-h-0 w-full flex-1 bg-black object-contain"
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          if (Math.abs(t - ultimo.current) > 15) {
            ultimo.current = t;
            guardar(t);
          }
        }}
        onEnded={() => guardar(0)}
      />
    </div>
  );
}

export default function Videos() {
  const puede = usePuede("videos", "escritura");
  const q = useQuery({ queryKey: ["media", "videos"], queryFn: () => api<ArchivoMedia[]>("/api/media/videos") });
  const [actual, setActual] = useState<ArchivoMedia | null>(null);
  const [avance, setAvance] = useState<number | null>(null);
  const [editando, setEditando] = useState<{ id: string; titulo: string } | null>(null);
  const [filtro, setFiltro] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const todos = q.data ?? [];
  const lista = todos.filter((m) => m.titulo.toLowerCase().includes(filtro.toLowerCase()));
  const seguir = todos.filter((m) => m.progreso > 10).slice(0, 4);
  const pagina = usePaginado(lista, 6);
  const invalidar = () => void queryClient.invalidateQueries({ queryKey: ["media", "videos"] });

  const borrar = useMutation({
    mutationFn: (id: string) => api(`/api/media/archivo/${id}`, { metodo: "DELETE" }),
    onSuccess: invalidar,
    onError: avisarError,
  });
  const renombrar = useMutation({
    mutationFn: (d: { id: string; titulo: string }) => api(`/api/media/archivo/${d.id}`, { metodo: "PATCH", cuerpo: { titulo: d.titulo } }),
    onSuccess: () => {
      setEditando(null);
      invalidar();
    },
    onError: avisarError,
  });

  const subir = async (archivos: FileList | null) => {
    if (!archivos?.length) return;
    try {
      for (const [i, a] of [...archivos].entries()) {
        setAvance(0);
        await subirConAvance("/api/media/videos", a, (p) => setAvance(p));
        if (archivos.length > 1) avisar(`Subido ${i + 1} de ${archivos.length}`, "info");
      }
      avisar("Listo, ya está en tu biblioteca");
    } catch (err) {
      avisarError(err);
    } finally {
      setAvance(null);
      invalidar();
      if (entrada.current) entrada.current.value = "";
    }
  };

  const pedirBorrar = async (m: ArchivoMedia) => {
    if (await confirmar({ titulo: "Borrar archivo", mensaje: `Se borra "${m.titulo}" del servidor.` })) {
      if (actual?.id === m.id) setActual(null);
      borrar.mutate(m.id);
    }
  };

  if (actual) {
    return (
      <Reproductor
        m={actual}
        puede={puede}
        alCerrar={() => setActual(null)}
        alRenombrar={() => {
          setEditando({ id: actual.id, titulo: actual.titulo });
          setActual(null);
        }}
        alBorrar={() => void pedirBorrar(actual)}
      />
    );
  }

  const indiceDe = (m: ArchivoMedia) => todos.findIndex((x) => x.id === m.id);

  return (
    <div className="space-y-5">
      <Encabezado
        titulo="Mis videos"
        descripcion="Sube tus videos al servidor y míralos desde cualquier equipo. Recuerda dónde te quedaste."
        acciones={
          puede ? (
            <Boton variante="primario" icono={Upload} disabled={avance !== null} onClick={() => entrada.current?.click()}>
              {avance !== null ? `Subiendo ${avance}%` : "Subir videos"}
            </Boton>
          ) : null
        }
      />
      <input ref={entrada} type="file" multiple hidden accept="video/*" onChange={(e) => void subir(e.target.files)} />
      {avance !== null ? (
        <div className="h-2 overflow-hidden rounded-full bg-tarjeta">
          <div className="h-full bg-acento transition-all" style={{ width: `${avance}%` }} />
        </div>
      ) : null}
      <ErrorCaja error={q.error} />
      {q.isLoading ? <Cargando /> : null}
      {q.data && !q.data.length ? <Vacio icono={Video} texto="Sube tus videos (MP4, WebM…) y míralos desde el celular o la PC. Hasta 4 GB cada uno." /> : null}

      {seguir.length ? (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Clapperboard className="h-4 w-4 text-tenue" />
            Seguir viendo
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {seguir.map((m) => (
              <button key={m.id} type="button" onClick={() => setActual(m)} className="group min-w-0 text-left">
                <Miniatura m={m} indice={indiceDe(m)} />
                <span className="mt-2 block truncate text-sm font-medium group-hover:text-acento">{m.titulo}</span>
                <span className="block text-xs text-tenue">{`Vas en ${minutos(m.progreso)}`}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {todos.length ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-sm font-semibold">Todos tus videos</h2>
            {todos.length > 6 ? (
              <label className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-tenue" />
                <Entrada className="h-9 pl-9" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar…" aria-label="Buscar video" />
              </label>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
            {pagina.visibles.map((m) => (
              <article key={m.id} className="min-w-0">
                <button type="button" onClick={() => setActual(m)} className="block w-full text-left" aria-label={`Ver ${m.titulo}`}>
                  <Miniatura m={m} indice={indiceDe(m)} grande />
                </button>
                {editando?.id === m.id ? (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editando.titulo.trim()) renombrar.mutate(editando);
                    }}
                  >
                    <Entrada autoFocus value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} />
                    <Boton type="submit" tamano="sm">
                      Guardar
                    </Boton>
                  </form>
                ) : (
                  <div className="mt-2 flex items-start gap-2">
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-sm">{m.titulo}</b>
                      <small className="block text-xs text-tenue">
                        {pesoArchivo(m.tamano)}
                        {m.progreso > 10 ? ` · vas en ${minutos(m.progreso)}` : ""}
                      </small>
                    </span>
                    {puede ? (
                      <span className="flex shrink-0">
                        <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Cambiar nombre" onClick={() => setEditando({ id: m.id, titulo: m.titulo })} />
                        <Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Borrar" onClick={() => void pedirBorrar(m)} />
                      </span>
                    ) : null}
                  </div>
                )}
              </article>
            ))}
          </div>
          {pagina.paginas}
        </section>
      ) : null}

      <p className="text-xs text-tenue">Si el video no se reproduce en el celular, conviértelo a MP4 en Convertidor. Para buscar dónde ver películas y series usa Películas.</p>
    </div>
  );
}
