/** Chat: entre tus dispositivos, privado con otra cuenta y en grupo. */
import { temas } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, Link2, LogOut, MessagesSquare, Plus, Send, Settings2, User, Users } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, Modal, Vacio, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { queryClient, useMe, usePuede } from "../lib/consultas";
import { dispositivoActual } from "../lib/dispositivo";
import { aInputLocal, fmtFechaHora } from "../lib/formato";
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
  tipo: "texto" | "enlace" | "recordatorio";
  texto: string;
  meta: { fecha?: string };
  fecha: string;
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
  const fin = useRef<HTMLDivElement>(null);
  const clave = ["chat", "mensajes", canal.id];
  const { data, isLoading, error } = useQuery({
    queryKey: clave,
    queryFn: () => api<Mensaje[]>(`/api/chat/canales/${canal.id}/mensajes`),
  });

  useTema<{ mensaje: Mensaje }>(temas.chat(canal.id), ({ mensaje }) => {
    queryClient.setQueryData<Mensaje[]>(clave, (prev) => (prev?.some((m) => m.id === mensaje.id) ? prev : [...(prev ?? []), mensaje]));
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
          ...(recordar ? { recordatorio: { fecha: new Date(fecha).toISOString() } } : {}),
        },
      }),
    onSuccess: (m) => {
      setTexto("");
      setRecordar(false);
      queryClient.setQueryData<Mensaje[]>(clave, (prev) => (prev?.some((x) => x.id === m.id) ? prev : [...(prev ?? []), m]));
    },
    onError: avisarError,
  });

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-96 flex-col rounded-tarjeta border border-borde bg-superficie md:h-[calc(100vh-10rem)]">
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
              <div className={cx("max-w-[80%] rounded-2xl px-3 py-2 text-sm", mio ? "bg-acento text-black" : "bg-tarjeta")}>
                {!mio && m.autor ? <p className="mb-0.5 text-[11px] font-semibold opacity-70">{m.autor}</p> : null}
                {m.tipo === "enlace" ? (
                  <button type="button" onClick={() => abrirExterno(m.texto)} className="inline-flex items-center gap-1 break-all text-left underline">
                    <Link2 className="h-3.5 w-3.5 shrink-0" /> {m.texto}
                  </button>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                )}
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
            <Entrada value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensaje o enlace…" maxLength={4000} />
            <Boton type="submit" variante="primario" tamano="icono" icono={Send} cargando={enviar.isPending} aria-label="Enviar" />
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

  return (
    <>
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">
        <div className={cx("min-w-0 space-y-3", params.get("canal") && "hidden md:block")}>
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
        <div className={cx("min-w-0", !params.get("canal") && "hidden md:block")}>
          {actual?.tipo === "grupo" ? (
            <div className="mb-2 flex justify-end">
              <Boton tamano="sm" variante="fantasma" icono={Settings2} onClick={() => setOpciones(true)}>
                Opciones del grupo
              </Boton>
            </div>
          ) : null}
          {actual ? <Conversacion key={actual.id} canal={actual} alVolver={() => setParams({})} /> : null}
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
    </>
  );
}
