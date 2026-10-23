import { temas } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, CalendarDays, Code2, Copy, FileDown, Laptop, Link2, LogOut, Maximize2, MessageCircle, MessagesSquare, Mic, NotebookPen, Paperclip, Plus, Search, Send, Settings2, Square, Trash2, User, Users, X, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { usePaginado } from "../components/Paginas";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api, urlServidor } from "../lib/api";
import { guardarEnDispositivo } from "../lib/compartir";
import { extensionDe, fmtDuracion, grabarAudio, type Grabacion } from "../lib/grabadora";
import { queryClient, useMe, usePuede } from "../lib/consultas";
import { dispositivoActual } from "../lib/dispositivo";
import { aInputLocal, fmtBytes, fmtFechaHora } from "../lib/formato";
import { useForma, useModoPagina } from "../lib/marco";
import { abrirExterno } from "../lib/plataforma";
import { useTema } from "../lib/tiempo-real";

interface Canal {
  id: string;
  nombre: string;
  tipo: "personal" | "privado" | "grupo";
  miembros?: { id: string; nombre: string }[];
  ultimo?: { tipo: string; texto: string; fecha: string } | null;
}

interface Mensaje {
  id: string;
  canalId: string;
  usuarioId: string | null;
  autor: string | null;
  dispositivoId: string | null;
  tipo: "texto" | "enlace" | "recordatorio" | "codigo" | "foto" | "voz" | "archivo" | "nota";
  texto: string;
  meta: { fecha?: string; lenguaje?: string; nombre?: string; tamano?: number; duracion?: number; enlace?: string; titulo?: string; extracto?: string };
  archivoUrl: string | null;
  fecha: string;
}

function ContenidoMensaje({ m }: { m: Mensaje }) {
  const url = m.archivoUrl ? urlServidor(m.archivoUrl) : null;
  if (m.tipo === "foto" && url) {
    return (
      <>
        <button type="button" onClick={() => abrirExterno(url)} className="block">
          <img src={url} alt={m.meta.nombre ?? "Foto"} className="max-h-72 rounded-xl object-cover" loading="lazy" />
        </button>
        {m.texto ? <p className="mt-1 whitespace-pre-wrap break-words">{m.texto}</p> : null}
      </>
    );
  }
  if (m.tipo === "voz" && url) {
    return (
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 shrink-0 opacity-70" />
        <audio controls preload="none" src={url} className="h-9 max-w-[16rem]" />
        {m.meta.duracion ? <span className="text-[11px] opacity-70">{fmtDuracion(m.meta.duracion)}</span> : null}
      </div>
    );
  }
  if (m.tipo === "archivo" && url) {
    return (
      <button type="button" onClick={() => void guardarEnDispositivo(url, m.meta.nombre ?? "archivo").then((d) => avisar(`Guardado en ${d}`), avisarError)} className="flex items-center gap-2 text-left">
        <FileDown className="h-5 w-5 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate underline">{m.meta.nombre}</span>
          {m.meta.tamano ? <span className="text-[11px] opacity-70">{fmtBytes(m.meta.tamano)}</span> : null}
        </span>
      </button>
    );
  }
  if (m.tipo === "codigo") {
    return (
      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] opacity-70">
          <span>{m.meta.lenguaje || "código"}</span>
          <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => void navigator.clipboard.writeText(m.texto).then(() => avisar("Código copiado"))}>
            <Copy className="h-3 w-3" /> Copiar
          </button>
        </div>
        <pre className="max-h-80 overflow-auto rounded-lg bg-black/80 p-2 font-mono text-xs text-white">{m.texto}</pre>
      </div>
    );
  }
  if (m.tipo === "nota" && m.meta.enlace) {
    return (
      <button type="button" onClick={() => abrirExterno(m.meta.enlace!)} className="block text-left">
        <span className="flex items-center gap-1 text-[11px] opacity-70">
          <NotebookPen className="h-3 w-3" /> Nota compartida
        </span>
        <span className="block font-semibold">{m.meta.titulo}</span>
        {m.meta.extracto ? <span className="line-clamp-3 block text-xs opacity-80">{m.meta.extracto}</span> : null}
        <span className="text-[11px] underline">Abrir</span>
      </button>
    );
  }
  if (m.tipo === "enlace") {
    return (
      <button type="button" onClick={() => abrirExterno(m.texto)} className="inline-flex items-center gap-1 break-all text-left underline">
        <Link2 className="h-3.5 w-3.5 shrink-0" /> {m.texto}
      </button>
    );
  }
  return <p className="whitespace-pre-wrap break-words">{m.texto}</p>;
}

function NuevoCanal({ alTerminar }: { alTerminar: (id: string) => void }) {
  const { data: me } = useMe();
  const usuarios = useQuery({ queryKey: ["chat", "usuarios"], queryFn: () => api<{ id: string; nombre: string }[]>("/api/chat/usuarios") });
  const [nombre, setNombre] = useState("");
  const [miembros, setMiembros] = useState<string[]>([]);
  const crear = useMutation({
    mutationFn: () => api<Canal>("/api/chat/canales", { cuerpo: { nombre, miembros } }),
    onSuccess: (c) => {
      void queryClient.invalidateQueries({ queryKey: ["chat"] });
      alTerminar(c.id);
    },
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        crear.mutate();
      }}
    >
      <Campo etiqueta="Nombre del grupo">
        <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={60} autoFocus />
      </Campo>
      <div>
        <p className="mb-1.5 text-xs font-medium text-tenue">Miembros</p>
        <div className="space-y-1">
          {usuarios.data
            ?.filter((u) => u.id !== me?.usuario.id)
            .map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={miembros.includes(u.id)}
                  onChange={(e) => setMiembros((m) => (e.target.checked ? [...m, u.id] : m.filter((x) => x !== u.id)))}
                />
                {u.nombre}
              </label>
            ))}
          {usuarios.data && usuarios.data.length <= 1 ? <p className="text-xs text-tenue">Solo tú tienes cuenta por ahora.</p> : null}
        </div>
      </div>
      <ErrorCaja error={crear.error} />
      <Boton type="submit" variante="primario" className="w-full" cargando={crear.isPending}>
        Crear grupo
      </Boton>
    </form>
  );
}

function Avatar({ canal, tamano = 42 }: { canal: Canal; tamano?: number }) {
  const Icono = canal.tipo === "personal" ? Laptop : canal.tipo === "privado" ? User : Users;
  const color = canal.tipo === "personal" ? "#3a7bd5" : canal.tipo === "privado" ? "#2e9e6b" : "#8b5cf6";
  const inicial = canal.tipo === "personal" ? null : canal.nombre.trim().charAt(0).toUpperCase();
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-semibold text-white" style={{ width: tamano, height: tamano, background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))` }}>
      {inicial || <Icono className="h-[45%] w-[45%]" />}
    </span>
  );
}

function hora(fecha: string): string {
  const d = new Date(fecha);
  const hoy = new Date();
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString("es-MX", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

const PREVIA: Record<string, string> = { foto: "📷 Foto", voz: "🎤 Nota de voz", archivo: "📎 ", codigo: "💻 Código", recordatorio: "🔔 ", nota: "📝 " };

function previa(c: Canal): string {
  if (!c.ultimo) return c.tipo === "personal" ? "Manda algo a tus otros equipos" : "Sin mensajes todavía";
  const pre = PREVIA[c.ultimo.tipo];
  if (c.ultimo.tipo === "foto" || c.ultimo.tipo === "voz" || c.ultimo.tipo === "codigo") return pre ?? c.ultimo.texto;
  return `${pre ?? ""}${c.ultimo.texto}`;
}

function Chip({ icono: Icono, texto, activo, onClick }: { icono: LucideIcon; texto: string; activo?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
        activo ? "border-acento bg-[color-mix(in_srgb,var(--acento)_16%,transparent)] text-acento" : "border-borde bg-tarjeta text-tenue hover:text-texto",
      )}
    >
      <Icono className="h-3.5 w-3.5" />
      {texto}
    </button>
  );
}

function Conversacion({ canal, alVolver, completa, alExpandir, alOpciones }: { canal: Canal; alVolver: () => void; completa: boolean; alExpandir: () => void; alOpciones: () => void }) {
  const { data: me } = useMe();
  const puedeEscribir = usePuede("chat", "escritura");
  const [texto, setTexto] = useState("");
  const [recordar, setRecordar] = useState(false);
  const [fecha, setFecha] = useState(aInputLocal(new Date(Date.now() + 3_600_000)));
  const [codigo, setCodigo] = useState(false);
  const [lenguaje, setLenguaje] = useState("");
  const [grabando, setGrabando] = useState<Grabacion | null>(null);
  const [segundos, setSegundos] = useState(0);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const fin = useRef<HTMLDivElement>(null);
  const clave = ["chat", "mensajes", canal.id];
  const { data, isLoading, error } = useQuery({
    queryKey: clave,
    queryFn: () => api<Mensaje[]>(`/api/chat/canales/${canal.id}/mensajes`),
  });

  const refrescarLista = () => void queryClient.invalidateQueries({ queryKey: ["chat", "canales"] });
  useTema<{ mensaje?: Mensaje; borrado?: string }>(temas.chat(canal.id), ({ mensaje, borrado }) => {
    refrescarLista();
    if (borrado) return queryClient.setQueryData<Mensaje[]>(clave, (prev) => prev?.filter((m) => m.id !== borrado));
    if (mensaje) queryClient.setQueryData<Mensaje[]>(clave, (prev) => (prev?.some((m) => m.id === mensaje.id) ? prev : [...(prev ?? []), mensaje]));
  });
  const agregar = (m: Mensaje) => {
    queryClient.setQueryData<Mensaje[]>(clave, (prev) => (prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));
    refrescarLista();
  };

  useEffect(() => {
    if (!grabando) return;
    const t = setInterval(() => setSegundos(grabando.segundos()), 500);
    return () => clearInterval(t);
  }, [grabando]);

  const subirArchivo = async (archivo: Blob, nombre: string, extra: Record<string, string> = {}) => {
    setSubiendo(nombre);
    try {
      const datos = new FormData();
      for (const [k, v] of Object.entries(extra)) datos.append(k, v);
      datos.append("archivo", archivo, nombre);
      agregar(await api<Mensaje>(`/api/chat/canales/${canal.id}/archivo`, { formulario: datos }));
    } catch (err) {
      avisarError(err);
    } finally {
      setSubiendo(null);
    }
  };

  const voz = async () => {
    if (grabando) {
      const g = grabando;
      setGrabando(null);
      const { audio, duracion, tipo } = await g.detener();
      await subirArchivo(audio, `voz-${Date.now()}.${extensionDe(tipo)}`, { voz: "1", duracion: String(duracion) });
      return;
    }
    try {
      setSegundos(0);
      setGrabando(await grabarAudio());
    } catch (err) {
      avisarError(err);
    }
  };

  const borrarMensaje = useMutation({
    mutationFn: (id: string) => api(`/api/chat/mensajes/${id}`, { metodo: "DELETE" }),
    onSuccess: (_r, id) => {
      queryClient.setQueryData<Mensaje[]>(clave, (prev) => prev?.filter((m) => m.id !== id));
      refrescarLista();
    },
    onError: avisarError,
  });

  useEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [data?.length]);

  const enviar = useMutation({
    mutationFn: () =>
      api<Mensaje>(`/api/chat/canales/${canal.id}/mensajes`, {
        cuerpo: {
          texto,
          dispositivoId: dispositivoActual() ?? undefined,
          ...(recordar && !codigo ? { recordatorio: { fecha: new Date(fecha).toISOString() } } : {}),
          ...(codigo ? { codigo: { lenguaje } } : {}),
        },
      }),
    onSuccess: (m) => {
      setTexto("");
      setRecordar(false);
      setCodigo(false);
      agregar(m);
    },
    onError: avisarError,
  });

  const subtitulo = canal.tipo === "personal" ? "Tus equipos" : canal.tipo === "privado" ? "Mensaje privado" : `${canal.miembros?.length ?? 0} miembros`;

  return (
    <div className={cx("flex min-h-0 min-w-0 flex-1 flex-col bg-superficie", !completa && "rounded-2xl border border-borde")}>
      <div className={cx("flex shrink-0 items-center gap-2.5 border-b border-borde px-3 py-2.5", completa && "pt-[max(0.625rem,env(safe-area-inset-top))]")}>
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alVolver} className={completa ? undefined : "lg:hidden"} aria-label="Volver" />
        <Avatar canal={canal} tamano={38} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{canal.nombre}</h2>
          <p className="truncate text-xs text-tenue">{subtitulo}</p>
        </div>
        {canal.tipo === "grupo" ? <Boton tamano="icono" variante="fantasma" icono={Settings2} onClick={alOpciones} aria-label="Opciones del grupo" title="Opciones del grupo" /> : null}
        {!completa ? <Boton tamano="icono" variante="fantasma" icono={Maximize2} onClick={alExpandir} className="hidden lg:inline-flex" aria-label="Abrir completo" title="Abrir completo" /> : null}
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-5">
        {isLoading ? <Cargando /> : null}
        <ErrorCaja error={error} />
        {data?.length === 0 ? <Vacio icono={MessagesSquare} texto="Envía un mensaje, un enlace o un recordatorio a tus otros dispositivos." /> : null}
        {data?.map((m) => {
          const mio = m.usuarioId === me?.usuario.id;
          return (
            <div key={m.id} className={cx("flex", mio ? "justify-end" : "justify-start")}>
              <div
                className={cx(
                  "group relative min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[70%]",
                  mio ? "rounded-br-md bg-acento text-black" : "rounded-bl-md bg-tarjeta",
                )}
              >
                {!mio && m.autor ? <p className="mb-0.5 text-[11px] font-semibold text-acento">{m.autor}</p> : null}
                <ContenidoMensaje m={m} />
                {mio && puedeEscribir ? (
                  <button
                    type="button"
                    aria-label="Borrar mensaje"
                    className="absolute -left-7 top-1 hidden rounded-full p-1 text-tenue hover:text-peligro group-hover:block"
                    onClick={() => borrarMensaje.mutate(m.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                {m.tipo === "recordatorio" && m.meta.fecha ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-[11px] opacity-80">
                    <Bell className="h-3 w-3" /> Recordatorio: {fmtFechaHora(m.meta.fecha)}
                  </p>
                ) : null}
                <p className="mt-0.5 text-right text-[10px] opacity-60">{fmtFechaHora(m.fecha)}</p>
              </div>
            </div>
          );
        })}
        <div ref={fin} />
      </div>
      {puedeEscribir ? (
        <form
          className="shrink-0 space-y-2 border-t border-borde p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (texto.trim()) enviar.mutate();
          }}
        >
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
            <Chip icono={Paperclip} texto="Foto o archivo" onClick={() => entradaArchivo.current?.click()} />
            <Chip icono={Code2} texto="Código" activo={codigo} onClick={() => setCodigo((v) => !v)} />
            <Chip icono={Bell} texto="Recordatorio" activo={recordar} onClick={() => setRecordar((v) => !v)} />
            <Chip icono={grabando ? Square : Mic} texto={grabando ? "Enviar voz" : "Nota de voz"} activo={Boolean(grabando)} onClick={() => void voz()} />
          </div>
          <input
            ref={entradaArchivo}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const lista = Array.from(e.target.files ?? []);
              e.target.value = "";
              void (async () => {
                for (const f of lista) await subirArchivo(f, f.name);
              })();
            }}
          />
          {grabando ? (
            <div className="flex items-center gap-2 rounded-xl bg-fondo px-3 py-2 text-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-peligro" />
              Grabando {fmtDuracion(segundos)}
              <span className="flex-1" />
              <Boton tamano="sm" variante="fantasma" icono={X} onClick={() => (grabando.cancelar(), setGrabando(null))}>
                Cancelar
              </Boton>
            </div>
          ) : null}
          {subiendo ? <p className="text-xs text-tenue">Enviando {subiendo}…</p> : null}
          {codigo ? (
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-tenue" />
              <Entrada value={lenguaje} onChange={(e) => setLenguaje(e.target.value)} placeholder="Lenguaje (js, python…)" className="h-8 max-w-48" maxLength={30} />
            </div>
          ) : null}
          {recordar && !codigo ? (
            <div className="flex items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--acento)_10%,transparent)] px-3 py-1.5 text-xs">
              <CalendarDays className="h-4 w-4 text-acento" />
              <span>Recordar a todos:</span>
              <Entrada type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8 max-w-60" />
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            {codigo ? (
              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Pega tu código…"
                maxLength={20000}
                rows={4}
                className="min-w-0 flex-1 rounded-xl border border-borde bg-fondo px-3 py-2 font-mono text-xs outline-none"
              />
            ) : (
              <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escribe un mensaje o pega un enlace…" maxLength={4000} />
            )}
            <Boton type="submit" variante="primario" tamano="icono" icono={Send} cargando={enviar.isPending} disabled={!texto.trim()} aria-label="Enviar" />
          </div>
        </form>
      ) : null}
    </div>
  );
}

function NuevoPrivado({ alTerminar }: { alTerminar: (id: string) => void }) {
  const { data: me } = useMe();
  const usuarios = useQuery({ queryKey: ["chat", "usuarios"], queryFn: () => api<{ id: string; nombre: string }[]>("/api/chat/usuarios") });
  const abrir = useMutation({
    mutationFn: (usuarioId: string) => api<Canal>("/api/chat/privado", { cuerpo: { usuarioId } }),
    onSuccess: (c) => {
      void queryClient.invalidateQueries({ queryKey: ["chat"] });
      alTerminar(c.id);
    },
    onError: avisarError,
  });
  const otros = (usuarios.data ?? []).filter((u) => u.id !== me?.usuario.id);
  return (
    <div className="space-y-1">
      {usuarios.isLoading ? <Cargando /> : null}
      {otros.map((u) => (
        <button
          key={u.id}
          type="button"
          disabled={abrir.isPending}
          onClick={() => abrir.mutate(u.id)}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-tarjeta"
        >
          <User className="h-4 w-4 text-tenue" /> {u.nombre}
        </button>
      ))}
      {usuarios.data && !otros.length ? <p className="text-sm text-tenue">Aún no hay otras cuentas. Créalas en Cuentas y permisos.</p> : null}
    </div>
  );
}

function OpcionesGrupo({ canal, alSalir }: { canal: Canal; alSalir: () => void }) {
  const usuarios = useQuery({ queryKey: ["chat", "usuarios"], queryFn: () => api<{ id: string; nombre: string }[]>("/api/chat/usuarios") });
  const [nombre, setNombre] = useState(canal.nombre);
  const [agregar, setAgregar] = useState<string[]>([]);
  const [confirmar, setConfirmar] = useState(false);
  const refrescar = () => void queryClient.invalidateQueries({ queryKey: ["chat"] });
  const guardar = useMutation({
    mutationFn: () =>
      api(`/api/chat/canales/${canal.id}`, { metodo: "PATCH", cuerpo: { ...(nombre.trim() !== canal.nombre ? { nombre: nombre.trim() } : {}), agregar } }),
    onSuccess: () => {
      setAgregar([]);
      refrescar();
    },
    onError: avisarError,
  });
  const salir = useMutation({
    mutationFn: () => api(`/api/chat/canales/${canal.id}/salir`, { metodo: "POST" }),
    onSuccess: () => {
      refrescar();
      alSalir();
    },
    onError: avisarError,
  });
  const dentro = new Set((canal.miembros ?? []).map((m) => m.id));
  const fuera = (usuarios.data ?? []).filter((u) => !dentro.has(u.id));
  const sinCambios = nombre.trim() === canal.nombre && !agregar.length;
  return (
    <div className="space-y-3">
      <p className="text-sm">
        <span className="text-tenue">Miembros:</span> {(canal.miembros ?? []).map((m) => m.nombre).join(", ") || "—"}
      </p>
      <Campo etiqueta="Nombre del grupo">
        <Entrada value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={60} />
      </Campo>
      <div>
        <p className="mb-1.5 text-xs font-medium text-tenue">Agregar personas</p>
        <div className="space-y-1">
          {fuera.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={agregar.includes(u.id)}
                onChange={(e) => setAgregar((a) => (e.target.checked ? [...a, u.id] : a.filter((x) => x !== u.id)))}
              />
              {u.nombre}
            </label>
          ))}
          {usuarios.data && !fuera.length ? <p className="text-xs text-tenue">Todas las cuentas ya están en el grupo.</p> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Boton variante="primario" cargando={guardar.isPending} disabled={sinCambios || !nombre.trim()} onClick={() => guardar.mutate()}>
          Guardar
        </Boton>
        {confirmar ? (
          <Boton variante="peligro" icono={LogOut} cargando={salir.isPending} onClick={() => salir.mutate()}>
            Sí, salir del grupo
          </Boton>
        ) : (
          <Boton variante="peligro" icono={LogOut} onClick={() => setConfirmar(true)}>
            Salir del grupo
          </Boton>
        )}
      </div>
      {confirmar ? <p className="text-xs text-tenue">Si eres el último miembro, el grupo y sus mensajes se borran.</p> : null}
    </div>
  );
}

const SECCIONES: { tipo: Canal["tipo"]; titulo: string; corto: string; icono: LucideIcon }[] = [
  { tipo: "personal", titulo: "Mis dispositivos", corto: "Equipos", icono: Laptop },
  { tipo: "privado", titulo: "Privados", corto: "Privados", icono: MessageCircle },
  { tipo: "grupo", titulo: "Grupos", corto: "Grupos", icono: Users },
];

export default function Chat() {
  const [params, setParams] = useSearchParams();
  const forma = useForma();
  const puedeEscribir = usePuede("chat", "escritura");
  const [nuevo, setNuevo] = useState(false);
  const [privado, setPrivado] = useState(false);
  const [opciones, setOpciones] = useState(false);
  const [menuNuevo, setMenuNuevo] = useState(false);
  const [buscar, setBuscar] = useState("");
  const { data, isLoading, error } = useQuery({ queryKey: ["chat", "canales"], queryFn: () => api<Canal[]>("/api/chat/canales") });
  const idCanal = params.get("canal");
  const ancho = forma === "pc";
  const actual = data?.find((c) => c.id === idCanal) ?? (idCanal || !ancho ? null : (data?.[0] ?? null));
  const [tipo, setTipo] = useState<Canal["tipo"]>("personal");
  const tipoVisible = actual?.tipo ?? tipo;
  const completa = Boolean(actual) && (params.get("completa") === "1" || (!ancho && Boolean(idCanal)));
  useModoPagina(completa ? "completa" : "fijo");

  const cuentas = useMemo(() => Object.fromEntries(SECCIONES.map((s) => [s.tipo, (data ?? []).filter((c) => c.tipo === s.tipo).length])) as Record<string, number>, [data]);
  const lista = useMemo(
    () =>
      (data ?? [])
        .filter((c) => c.tipo === tipoVisible && (!buscar || c.nombre.toLowerCase().includes(buscar.toLowerCase())))
        .sort((a, b) => (b.ultimo?.fecha ?? "").localeCompare(a.ultimo?.fecha ?? "")),
    [data, tipoVisible, buscar],
  );
  const { visibles, paginas } = usePaginado(lista, 10);
  const recientes = useMemo(() => [...(data ?? [])].sort((a, b) => (b.ultimo?.fecha ?? "").localeCompare(a.ultimo?.fecha ?? "")).slice(0, 9), [data]);
  const seccion = SECCIONES.find((s) => s.tipo === tipoVisible) ?? SECCIONES[0]!;

  const abrir = (c: Canal, expandir = false) => setParams(expandir ? { canal: c.id, completa: "1" } : { canal: c.id });
  const elegirTipo = (t: Canal["tipo"]) => {
    setTipo(t);
    setBuscar("");
    if (actual && actual.tipo !== t) setParams({});
  };

  const modales = (
    <>
      <Modal abierto={privado} titulo="Mensaje privado: ¿con quién?" alCerrar={() => setPrivado(false)}>
        {privado ? (
          <NuevoPrivado
            alTerminar={(id) => {
              setPrivado(false);
              setParams({ canal: id });
            }}
          />
        ) : null}
      </Modal>
      <Modal abierto={opciones && actual?.tipo === "grupo"} titulo="Opciones del grupo" alCerrar={() => setOpciones(false)}>
        {opciones && actual ? (
          <OpcionesGrupo
            key={actual.id}
            canal={actual}
            alSalir={() => {
              setOpciones(false);
              setParams({});
            }}
          />
        ) : null}
      </Modal>
      <Modal abierto={nuevo} titulo="Nuevo grupo" alCerrar={() => setNuevo(false)}>
        <NuevoCanal
          alTerminar={(id) => {
            setNuevo(false);
            setParams({ canal: id });
          }}
        />
      </Modal>
      <Modal abierto={menuNuevo} titulo="Nuevo chat" alCerrar={() => setMenuNuevo(false)}>
        <div className="grid gap-2">
          <Boton
            variante="secundario"
            icono={User}
            onClick={() => {
              setMenuNuevo(false);
              setPrivado(true);
            }}
          >
            Mensaje privado
          </Boton>
          <Boton
            variante="secundario"
            icono={Users}
            onClick={() => {
              setMenuNuevo(false);
              setNuevo(true);
            }}
          >
            Nuevo grupo
          </Boton>
        </div>
      </Modal>
    </>
  );

  if (completa && actual) {
    return (
      <div className="flex min-h-0 flex-1">
        {forma !== "celular" ? (
          <nav className="flex w-[72px] shrink-0 flex-col items-center gap-2.5 overflow-y-auto border-r border-borde bg-fondo py-3" aria-label="Chats recientes">
            {recientes.map((c) => (
              <button key={c.id} type="button" onClick={() => abrir(c, ancho)} title={c.nombre} className={cx("rounded-full p-0.5 ring-2", c.id === actual.id ? "ring-acento" : "ring-transparent hover:ring-borde")}>
                <Avatar canal={c} tamano={42} />
              </button>
            ))}
          </nav>
        ) : null}
        <Conversacion key={actual.id} canal={actual} completa alVolver={() => setParams(ancho ? { canal: actual.id } : {})} alExpandir={() => undefined} alOpciones={() => setOpciones(true)} />
        {modales}
      </div>
    );
  }

  const riel = (
    <nav className="flex shrink-0 gap-1.5 lg:w-[92px] lg:flex-col" aria-label="Tipos de chat">
      {SECCIONES.map((s) => (
        <button
          key={s.tipo}
          type="button"
          onClick={() => elegirTipo(s.tipo)}
          className={cx(
            "relative flex flex-1 items-center justify-center gap-2 rounded-2xl px-2 py-2.5 text-xs font-semibold lg:flex-none lg:flex-col lg:gap-1.5 lg:py-3.5",
            tipoVisible === s.tipo ? "bg-[color-mix(in_srgb,var(--acento)_16%,transparent)] text-acento" : "bg-superficie text-tenue hover:text-texto",
          )}
        >
          <s.icono className="h-5 w-5" />
          {s.corto}
          {cuentas[s.tipo] ? <span className="rounded-full bg-tarjeta px-1.5 text-[10px] text-tenue lg:absolute lg:right-2 lg:top-2">{cuentas[s.tipo]}</span> : null}
        </button>
      ))}
      {puedeEscribir ? (
        <button type="button" onClick={() => setMenuNuevo(true)} className="hidden items-center justify-center gap-1.5 rounded-2xl border border-dashed border-borde py-3.5 text-xs font-semibold text-tenue hover:text-texto lg:mt-auto lg:flex lg:flex-col">
          <Plus className="h-5 w-5" />
          Nuevo
        </button>
      ) : null}
    </nav>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Encabezado
        titulo="Chat"
        descripcion="Mensajes entre tus dispositivos, privados con otra cuenta o en grupo."
        acciones={
          puedeEscribir ? (
            <>
              <Boton icono={User} onClick={() => setPrivado(true)}>
                Privado
              </Boton>
              <Boton icono={Plus} onClick={() => setNuevo(true)}>
                Grupo
              </Boton>
            </>
          ) : null
        }
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {riel}
        <section className={cx("flex min-h-0 min-w-0 flex-col rounded-2xl border border-borde bg-superficie p-3 lg:w-[320px] lg:shrink-0", actual && "hidden lg:flex", !actual && "flex-1 lg:flex-none")}>
          <h3 className="mb-2 px-1 text-sm font-semibold">{seccion.titulo}</h3>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-tenue" />
            <Entrada className="pl-9" placeholder={`Buscar en ${seccion.titulo.toLowerCase()}…`} value={buscar} onChange={(e) => setBuscar(e.target.value)} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {visibles.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => abrir(c)}
                className={cx("flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left", actual?.id === c.id ? "bg-tarjeta" : "hover:bg-tarjeta")}
              >
                <Avatar canal={c} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <b className="min-w-0 flex-1 truncate text-sm">{c.nombre}</b>
                    {c.ultimo ? <small className="shrink-0 text-[11px] text-tenue">{hora(c.ultimo.fecha)}</small> : null}
                  </span>
                  <span className="line-clamp-2 text-xs text-tenue">{previa(c)}</span>
                </span>
              </button>
            ))}
            {!lista.length && !isLoading ? (
              <Vacio
                icono={seccion.icono}
                texto={buscar ? "Sin resultados." : tipoVisible === "privado" ? "Aún no tienes chats privados." : tipoVisible === "grupo" ? "Aún no estás en ningún grupo." : "Sin chats."}
                accion={
                  puedeEscribir && !buscar && tipoVisible !== "personal" ? (
                    <Boton tamano="sm" variante="primario" icono={Plus} onClick={() => (tipoVisible === "privado" ? setPrivado(true) : setNuevo(true))}>
                      {tipoVisible === "privado" ? "Mensaje privado" : "Nuevo grupo"}
                    </Boton>
                  ) : undefined
                }
              />
            ) : null}
          </div>
          {paginas}
        </section>
        {actual ? (
          <Conversacion key={actual.id} canal={actual} completa={false} alVolver={() => setParams({})} alExpandir={() => abrir(actual, true)} alOpciones={() => setOpciones(true)} />
        ) : (
          <div className="hidden min-h-0 flex-1 place-items-center rounded-2xl border border-dashed border-borde lg:grid">
            <Vacio icono={MessagesSquare} texto="Elige un chat para empezar." />
          </div>
        )}
      </div>
      {modales}
    </div>
  );
}
