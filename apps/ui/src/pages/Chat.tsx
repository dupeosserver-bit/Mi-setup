/** Chat privado entre dispositivos (y grupos para chat de equipo). */
import { temas } from "@mi-setup/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, Link2, MessagesSquare, Plus, Send, Users } from "lucide-react";
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
      <Campo etiqueta="Nombre del canal">
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
        Crear canal
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

export default function Chat() {
  const [params, setParams] = useSearchParams();
  const puedeEscribir = usePuede("chat", "escritura");
  const [nuevo, setNuevo] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["chat", "canales"], queryFn: () => api<Canal[]>("/api/chat/canales") });
  const actual = data?.find((c) => c.id === params.get("canal")) ?? (params.get("canal") ? null : data?.[0] ?? null);

  return (
    <>
      <Encabezado
        titulo="Chat privado"
        acciones={puedeEscribir ? <Boton icono={Plus} onClick={() => setNuevo(true)}>Canal</Boton> : null}
      />
      <ErrorCaja error={error} />
      {isLoading ? <Cargando /> : null}
      <div className="grid gap-4 md:grid-cols-[240px_1fr]">
        <div className={cx("space-y-1", params.get("canal") && "hidden md:block")}>
          {data?.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setParams({ canal: c.id })}
              className={cx(
                "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm",
                actual?.id === c.id ? "bg-tarjeta" : "hover:bg-tarjeta",
              )}
            >
              {c.tipo === "personal" ? <MessagesSquare className="h-4 w-4 text-tenue" /> : <Users className="h-4 w-4 text-tenue" />}
              {c.nombre}
            </button>
          ))}
        </div>
        <div className={cx(!params.get("canal") && "hidden md:block")}>
          {actual ? <Conversacion key={actual.id} canal={actual} alVolver={() => setParams({})} /> : null}
        </div>
      </div>
      <Modal abierto={nuevo} titulo="Nuevo canal" alCerrar={() => setNuevo(false)}>
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
