/** Chat: entre tus dispositivos, privado con otra cuenta y en grupo. */
import { useModoPagina } from "../lib/marco";
import { temas } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, Code2, Copy, FileDown, Link2, LogOut, MessagesSquare, Mic, NotebookPen, Paperclip, Plus, Send, Settings2, Square, Trash2, User, Users, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api, urlServidor } from "../lib/api";
import { guardarEnDispositivo } from "../lib/compartir";
import { extensionDe, fmtDuracion, grabarAudio, type Grabacion } from "../lib/grabadora";
import { queryClient, useMe, usePuede } from "../lib/consultas";
import { dispositivoActual } from "../lib/dispositivo";
import { aInputLocal, fmtBytes, fmtFechaHora } from "../lib/formato";
import { abrirExterno } from "../lib/plataforma";
import { useTema } from "../lib/tiempo-real";

interface Canal {
  id: string;
  nombre: string;
  tipo: string;
  miembros?: { id: string; nombre: string }[];
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

/** Contenido de cada mensaje según su tipo. */
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

function Conversacion({ canal, alVolver }: { canal: Canal; alVolver: () => void }) {
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

  useTema<{ mensaje?: Mensaje; borrado?: string }>(temas.chat(canal.id), ({ mensaje, borrado }) => {
    if (borrado) return queryClient.setQueryData<Mensaje[]>(clave, (prev) => prev?.filter((m) => m.id !== borrado));
    if (mensaje) queryClient.setQueryData<Mensaje[]>(clave, (prev) => (prev?.some((m) => m.id === mensaje.id) ? prev : [...(prev ?? []), mensaje]));
  });
  const agregar = (m: Mensaje) => queryClient.setQueryData<Mensaje[]>(clave, (prev) => (prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));

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
    onSuccess: (_r, id) => queryClient.setQueryData<Mensaje[]>(clave, (prev) => prev?.filter((m) => m.id !== id)),
    onError: avisarError,
  });

  useEffect(() => {
    // Sin devolver nada: en Chrome reciente scrollIntoView devuelve una promesa.
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

  return (
    <div className="flex h-full min-h-[22rem] flex-col rounded-tarjeta border border-borde bg-superficie">
      <div className="flex items-center gap-2 border-b border-borde p-3">
        <Boton tamano="icono" variante="fantasma" icono={ArrowLeft} onClick={alVolver} className="md:hidden" aria-label="Volver" />
        <h2 className="text-sm font-semibold">{canal.nombre}</h2>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {isLoading ? <Cargando /> : null}
        <ErrorCaja error={error} />
        {data?.length === 0 ? <Vacio icono={MessagesSquare} texto="Envía un mensaje, un enlace o un recordatorio a tus otros dispositivos." /> : null}
        {data?.map((m) => {
          const mio = m.usuarioId === me?.usuario.id;
          return (
            <div key={m.id} className={cx("flex", mio ? "justify-end" : "justify-start")}>
              <div className={cx("group relative min-w-0 max-w-[85%] rounded-2xl px-3 py-2 text-sm", mio ? "bg-acento text-black" : "bg-tarjeta")}>
                {!mio && m.autor ? <p className="mb-0.5 text-[11px] font-semibold opacity-70">{m.autor}</p> : null}
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
          className="space-y-2 border-t border-borde p-3"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (texto.trim()) enviar.mutate();
          }}
        >
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
          {recordar ? (
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-tenue" />
              <Entrada type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-8 max-w-60" />
            </div>
          ) : null}
          <div className="flex gap-2">
            <Boton
              tamano="icono"
              variante={recordar ? "primario" : "secundario"}
              icono={Bell}
              onClick={() => setRecordar((v) => !v)}
              aria-label="Enviar como recordatorio"
              title="Enviar como recordatorio"
            />
            <Boton tamano="icono" variante={codigo ? "primario" : "secundario"} icono={Code2} onClick={() => setCodigo((v) => !v)} aria-label="Mandar código" title="Mandar código" />
            <Boton tamano="icono" variante="secundario" icono={Paperclip} onClick={() => entradaArchivo.current?.click()} aria-label="Foto o archivo" title="Foto o archivo" />
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
              <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensaje o enlace…" maxLength={4000} />
            )}
            {texto.trim() || codigo ? (
              <Boton type="submit" variante="primario" tamano="icono" icono={Send} cargando={enviar.isPending} aria-label="Enviar" />
            ) : (
              <Boton tamano="icono" variante={grabando ? "peligro" : "primario"} icono={grabando ? Square : Mic} onClick={() => void voz()} aria-label={grabando ? "Enviar nota de voz" : "Grabar nota de voz"} />
            )}
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

const SECCIONES: [string, string][] = [
  ["personal", "Mis dispositivos"],
  ["privado", "Privados"],
  ["grupo", "Grupos"],
];

export default function Chat() {
  const [params, setParams] = useSearchParams();
  const puedeEscribir = usePuede("chat", "escritura");
  const [nuevo, setNuevo] = useState(false);
  const [privado, setPrivado] = useState(false);
  const [opciones, setOpciones] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["chat", "canales"], queryFn: () => api<Canal[]>("/api/chat/canales") });
  const actual = data?.find((c) => c.id === params.get("canal")) ?? (params.get("canal") ? null : data?.[0] ?? null);
  useModoPagina("fijo");

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
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
        <div className={cx("min-h-0 min-w-0 space-y-3 overflow-y-auto", params.get("canal") && "hidden md:block")}>
          {SECCIONES.map(([tipo, titulo]) => {
            const lista = (data ?? []).filter((c) => c.tipo === tipo);
            if (!lista.length) return null;
            return (
              <div key={tipo} className="space-y-1">
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-tenue">{titulo}</p>
                {lista.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setParams({ canal: c.id })}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm",
                      actual?.id === c.id ? "bg-tarjeta" : "hover:bg-tarjeta",
                    )}
                  >
                    {c.tipo === "personal" ? (
                      <MessagesSquare className="h-4 w-4 shrink-0 text-tenue" />
                    ) : c.tipo === "privado" ? (
                      <User className="h-4 w-4 shrink-0 text-tenue" />
                    ) : (
                      <Users className="h-4 w-4 shrink-0 text-tenue" />
                    )}
                    <span className="truncate">{c.nombre}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        <div className={cx("flex min-h-0 min-w-0 flex-col", !params.get("canal") && "hidden md:flex")}>
          {actual?.tipo === "grupo" ? (
            <div className="mb-2 flex justify-end">
              <Boton tamano="sm" variante="fantasma" icono={Settings2} onClick={() => setOpciones(true)}>
                Opciones del grupo
              </Boton>
            </div>
          ) : null}
          {actual ? (
            <div className="min-h-0 flex-1">
              <Conversacion key={actual.id} canal={actual} alVolver={() => setParams({})} />
            </div>
          ) : null}
        </div>
      </div>
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
    </div>
  );
}
