/**
 * Tu música o tus videos subidos al VPS: lista, subir con avance, reproducir
 * (con "seguir donde te quedaste") y borrar.
 */
import { usePaginado } from "./Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Music, Pencil, Play, Trash2, Upload, Video } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { API_BASE, api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient, usePuede } from "../lib/consultas";
import { subirConAvance } from "../lib/subir";
import { Boton, Cargando, Entrada, ErrorCaja, Tarjeta, Vacio, avisar, avisarError, cx } from "./ui";

export interface ArchivoMedia {
  id: string;
  titulo: string;
  tamano: number;
  tipoArchivo: string;
  progreso: number;
  url: string;
  creado: string;
}

const tamano = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`);
const tiempo = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export function Biblioteca({ tipo }: { tipo: "musica" | "videos" }) {
  const puede = usePuede(tipo, "escritura");
  const q = useQuery({ queryKey: ["media", tipo], queryFn: () => api<ArchivoMedia[]>(`/api/media/${tipo}`) });
  const [actual, setActual] = useState<ArchivoMedia | null>(null);
  const [avance, setAvance] = useState<number | null>(null);
  const [editando, setEditando] = useState<{ id: string; titulo: string } | null>(null);
  const [filtro, setFiltro] = useState("");
  const reproductor = useRef<HTMLAudioElement & HTMLVideoElement>(null);
  const ultimoGuardado = useRef(0);
  const entrada = useRef<HTMLInputElement>(null);
  const lista = (q.data ?? []).filter((m) => m.titulo.toLowerCase().includes(filtro.toLowerCase()));
  const invalidar = () => void queryClient.invalidateQueries({ queryKey: ["media", tipo] });

  const guardarProgreso = (id: string, progreso: number) =>
    void api(`/api/media/archivo/${id}`, { metodo: "PATCH", cuerpo: { progreso: Math.floor(progreso) } }).catch(() => undefined);

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
        await subirConAvance(`/api/media/${tipo}`, a, (p) => setAvance(p));
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

  // Al cambiar de archivo: seguir donde se quedó (videos) y reproducir.
  useEffect(() => {
    const el = reproductor.current;
    if (!el || !actual) return;
    const alCargar = () => {
      if (tipo === "videos" && actual.progreso > 10 && actual.progreso < el.duration - 10) el.currentTime = actual.progreso;
      void el.play().catch(() => undefined);
    };
    el.addEventListener("loadedmetadata", alCargar, { once: true });
    return () => el.removeEventListener("loadedmetadata", alCargar);
  }, [actual, tipo]);

  const siguiente = () => {
    if (tipo !== "musica" || !actual) return;
    const i = lista.findIndex((m) => m.id === actual.id);
    const sig = lista[i + 1];
    if (sig) setActual(sig);
  };

  const Icono = tipo === "musica" ? Music : Video;
  const src = (m: ArchivoMedia) => `${API_BASE}${m.url}`;

  const pgBib = usePaginado(lista, 12);
  return (
    <div className="space-y-4">
      {actual ? (
        <Tarjeta titulo={actual.titulo} icono={Play} className="min-w-0">
          {tipo === "videos" ? (
            <video
              ref={reproductor}
              key={actual.id}
              src={src(actual)}
              controls
              playsInline
              className="aspect-video w-full rounded-xl bg-black"
              onTimeUpdate={(e) => {
                const t = e.currentTarget.currentTime;
                if (Math.abs(t - ultimoGuardado.current) > 15) {
                  ultimoGuardado.current = t;
                  guardarProgreso(actual.id, t);
                }
              }}
              onEnded={() => guardarProgreso(actual.id, 0)}
            />
          ) : (
            <audio ref={reproductor} key={actual.id} src={src(actual)} controls className="w-full" onEnded={siguiente} />
          )}
        </Tarjeta>
      ) : null}

      <Tarjeta
        titulo={tipo === "musica" ? "Tu música" : "Tus videos"}
        icono={Icono}
        acciones={
          puede ? (
            <Boton tamano="sm" variante="primario" icono={Upload} disabled={avance !== null} onClick={() => entrada.current?.click()}>
              {avance !== null ? `Subiendo ${avance}%` : "Subir"}
            </Boton>
          ) : null
        }
      >
        <input ref={entrada} type="file" multiple hidden accept={tipo === "musica" ? "audio/*" : "video/*"} onChange={(e) => void subir(e.target.files)} />
        {avance !== null ? (
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-fondo">
            <div className="h-full bg-acento transition-all" style={{ width: `${avance}%` }} />
          </div>
        ) : null}
        <ErrorCaja error={q.error} />
        {q.isLoading ? <Cargando /> : null}
        {(q.data?.length ?? 0) > 6 ? <Entrada className="mb-3" value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar…" /> : null}
        {q.data && !q.data.length ? (
          <Vacio
            icono={Icono}
            texto={tipo === "musica" ? "Sube tus canciones (MP3, M4A, FLAC…) y escúchalas desde cualquier equipo." : "Sube tus videos (MP4, WebM…) y míralos desde el celular o la PC. Hasta 4 GB cada uno."}
          />
        ) : null}
        <ul className="divide-y divide-borde">
          {pgBib.visibles.map((m) => (
            <li key={m.id} className={cx("flex items-center gap-2 py-2", actual?.id === m.id && "text-acento")}>
              {editando?.id === m.id ? (
                <form
                  className="flex min-w-0 flex-1 gap-2"
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
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setActual(m)}>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-fondo">
                    <Play className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{m.titulo}</span>
                    <span className="block text-xs text-tenue">
                      {tamano(m.tamano)}
                      {tipo === "videos" && m.progreso > 10 ? ` · vas en ${tiempo(m.progreso)}` : ""}
                    </span>
                  </span>
                </button>
              )}
              {puede && editando?.id !== m.id ? (
                <>
                  <Boton tamano="icono" variante="fantasma" icono={Pencil} aria-label="Cambiar nombre" onClick={() => setEditando({ id: m.id, titulo: m.titulo })} />
                  <Boton
                    tamano="icono"
                    variante="fantasma"
                    icono={Trash2}
                    aria-label="Borrar"
                    onClick={async () => {
                      if (await confirmar({ titulo: "Borrar archivo", mensaje: `Se borra "${m.titulo}" del servidor.` })) {
                        if (actual?.id === m.id) setActual(null);
                        borrar.mutate(m.id);
                      }
                    }}
                  />
                </>
              ) : null}
            </li>
          ))}
        </ul>
        {pgBib.paginas}
      </Tarjeta>
    </div>
  );
}
