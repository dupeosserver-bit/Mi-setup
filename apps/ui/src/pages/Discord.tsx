import { usePaginado } from "../components/Paginas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Hash, Pencil, Pin, PinOff, RefreshCw, Send, SmilePlus, Sparkles, Trash2, Users } from "lucide-react";
import { useAsistente } from "../components/Asistente";
import { EtiquetaInvitados } from "../components/CuentaRed";
import { useState } from "react";
import { AreaTexto, Boton, Campo, Cargando, Encabezado, Entrada, ErrorCaja, FaltaConfigurar, Insignia, Modal, Pestanas, Selector, Tarjeta, Vacio, avisar, avisarError, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { usePuede } from "../lib/consultas";
import { haceCuanto } from "../lib/formato";

interface CanalDiscord {
  id: string;
  nombre: string;
  servidor: string;
}
interface Mensaje {
  id: string;
  texto: string;
  fecha: string;
  fijado: boolean;
  autor: string;
  delBot: boolean;
  adjuntos: number;
  tarjeta: string | null;
}
interface Servidor {
  id: string;
  nombre: string;
  icono: string | null;
  miembros: number | null;
  conectados: number | null;
}

function useCanales() {
  return useQuery({
    queryKey: ["redes", "discord"],
    queryFn: () => api<{ configurado: boolean; canales: CanalDiscord[] }>("/api/discord/canales"),
  });
}

function SelectorCanal({ valor, alCambiar, canales }: { valor: string; alCambiar: (id: string) => void; canales: CanalDiscord[] }) {
  const servidores = [...new Set(canales.map((c) => c.servidor))];
  return (
    <Selector value={valor} onChange={(e) => alCambiar(e.target.value)}>
      <option value="">Elige un canal…</option>
      {servidores.map((s) => (
        <optgroup key={s} label={s}>
          {canales
            .filter((c) => c.servidor === s)
            .map((c) => (
              <option key={c.id} value={c.id}>
                #{c.nombre}
              </option>
            ))}
        </optgroup>
      ))}
    </Selector>
  );
}

function Enviar({ canales }: { canales: CanalDiscord[] }) {
  const puede = usePuede("discord", "escritura");
  const [canal, setCanal] = useState("");
  const [texto, setTexto] = useState("");
  const [conTarjeta, setConTarjeta] = useState(false);
  const [t, setT] = useState({
    titulo: "",
    descripcion: "",
    color: "#5865f2",
    imagen: "",
    url: "",
  });
  const elegido = canales.find((c) => c.id === canal);
  const abrirIa = useAsistente((x) => x.poner);
  const enviar = useMutation({
    mutationFn: async () => {
      const ok = await confirmar({
        titulo: "Enviar a Discord",
        mensaje: `Se enviará a ${elegido?.servidor} #${elegido?.nombre}. Las menciones masivas (@everyone, roles) se desactivan.`,
        detalle: [texto, conTarjeta ? `[Tarjeta] ${t.titulo}` : ""].filter(Boolean).join("\n"),
        boton: "Enviar",
      });
      if (!ok) return null;
      const embed = conTarjeta
        ? {
            ...(t.titulo ? { titulo: t.titulo } : {}),
            ...(t.descripcion ? { descripcion: t.descripcion } : {}),
            color: t.color,
            ...(t.imagen ? { imagen: t.imagen } : {}),
            ...(t.url ? { url: t.url } : {}),
          }
        : undefined;
      return api("/api/discord/enviar", {
        metodo: "POST",
        cuerpo: { canalId: canal, texto, ...(embed ? { embed } : {}) },
      });
    },
    onSuccess: (r) => {
      if (!r) return;
      setTexto("");
      setT({
        titulo: "",
        descripcion: "",
        color: t.color,
        imagen: "",
        url: "",
      });
      avisar("Mensaje enviado");
    },
    onError: avisarError,
  });
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Tarjeta titulo="Nuevo mensaje">
        <div className="space-y-3">
          <Campo etiqueta="Canal">
            <SelectorCanal valor={canal} alCambiar={setCanal} canales={canales} />
          </Campo>
          <Campo etiqueta="Mensaje">
            <AreaTexto rows={4} maxLength={2000} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={!puede} placeholder="Texto normal (puedes usar **negritas** y emojis)" />
          </Campo>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={conTarjeta} onChange={(e) => setConTarjeta(e.target.checked)} /> Agregar tarjeta (embed) con título, color e imagen
          </label>
          {conTarjeta ? (
            <div className="space-y-2 rounded-xl bg-fondo p-3">
              <Entrada value={t.titulo} onChange={(e) => setT({ ...t, titulo: e.target.value })} placeholder="Título" maxLength={256} />
              <AreaTexto rows={3} value={t.descripcion} onChange={(e) => setT({ ...t, descripcion: e.target.value })} placeholder="Descripción" maxLength={4000} />
              <div className="flex gap-2">
                <input type="color" value={t.color} onChange={(e) => setT({ ...t, color: e.target.value })} className="h-10 w-12 cursor-pointer rounded bg-transparent" aria-label="Color" />
                <Entrada value={t.imagen} onChange={(e) => setT({ ...t, imagen: e.target.value })} placeholder="URL de imagen (https://…)" />
              </div>
              <Entrada value={t.url} onChange={(e) => setT({ ...t, url: e.target.value })} placeholder="Enlace del título (opcional)" />
            </div>
          ) : null}
          {puede ? (
            <Boton
              variante="primario"
              icono={Send}
              disabled={!canal || (!texto.trim() && !(conTarjeta && (t.titulo || t.descripcion || t.imagen)))}
              cargando={enviar.isPending}
              onClick={() => enviar.mutate()}
            >
              Enviar
            </Boton>
          ) : null}
        </div>
      </Tarjeta>
      <div className="space-y-4">
        <Tarjeta titulo="Así se verá en Discord">
          <div className="sin-seleccion overflow-hidden rounded-xl bg-[#313338] text-sm text-[#dbdee1]">
            <div className="flex items-center gap-1.5 border-b border-black/30 px-3 py-2 text-xs text-[#949ba4]">
              <Hash className="h-3.5 w-3.5" />
              {elegido ? `${elegido.nombre} · ${elegido.servidor}` : "elige un canal"}
            </div>
            <div className="flex gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#5865f2] text-sm font-bold text-white">B</span>
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-semibold text-white">
                  Tu bot <span className="rounded bg-[#5865f2] px-1 text-[10px]">BOT</span> <span className="font-normal text-[#949ba4]">hoy</span>
                </p>
                {texto ? <p className="whitespace-pre-wrap break-words">{texto}</p> : null}
                {conTarjeta && (t.titulo || t.descripcion || t.imagen) ? (
                  <div className="mt-2 max-w-md rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderColor: t.color }}>
                    {t.titulo ? <p className="font-semibold text-white">{t.titulo}</p> : null}
                    {t.descripcion ? <p className="mt-1 whitespace-pre-wrap break-words">{t.descripcion}</p> : null}
                    {t.imagen.startsWith("https://") ? <img src={t.imagen} alt="" className="mt-2 max-h-48 rounded" referrerPolicy="no-referrer" /> : null}
                  </div>
                ) : null}
                {!texto && !conTarjeta ? <p className="text-[#949ba4]">Escribe algo para ver cómo se verá.</p> : null}
              </div>
            </div>
          </div>
        </Tarjeta>
        <section className="flex items-start gap-3 rounded-tarjeta border border-borde bg-[color-mix(in_srgb,var(--acento)_8%,var(--superficie))] p-4">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-acento" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">La IA te ayuda a redactar</p>
            <p className="mt-0.5 text-xs text-tenue">Pídele un anuncio o una respuesta; ella propone el mensaje y solo se envía cuando tú apruebas.</p>
          </div>
          <Boton tamano="sm" onClick={() => abrirIa(true)}>
            Pedir a la IA
          </Boton>
        </section>
      </div>
    </div>
  );
}

const EMOJIS = ["👍", "✅", "🎉", "❤️", "🔥", "😂", "👀"];

function Mensajes({ canales }: { canales: CanalDiscord[] }) {
  const puede = usePuede("discord", "escritura");
  const [canal, setCanal] = useState("");
  const [editando, setEditando] = useState<Mensaje | null>(null);
  const [nuevoTexto, setNuevoTexto] = useState("");
  const lista = useQuery({
    queryKey: ["redes", "discord", "mensajes", canal],
    queryFn: () => api<Mensaje[]>(`/api/discord/canales/${canal}/mensajes`),
    enabled: Boolean(canal),
  });
  const accion = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => void lista.refetch(),
    onError: avisarError,
  });
  const pgMsj = usePaginado(lista.data, 12);
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <SelectorCanal valor={canal} alCambiar={setCanal} canales={canales} />
        <Boton icono={RefreshCw} disabled={!canal} cargando={lista.isFetching} onClick={() => void lista.refetch()}>
          Actualizar
        </Boton>
      </div>
      <p className="text-xs text-tenue">
        Para ver el texto de los mensajes activa "Message Content Intent" en discord.com/developers → tu app → Bot. Para borrar mensajes de otros, el bot necesita el permiso "Gestionar mensajes".
      </p>
      {lista.isLoading ? <Cargando /> : null}
      <ErrorCaja error={lista.error} />
      {canal && lista.data?.length === 0 ? <Vacio texto="Sin mensajes en este canal." /> : null}
      <div className="space-y-2">
        {pgMsj.visibles.map((m) => (
          <div key={m.id} className="rounded-xl border border-borde bg-superficie p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-tenue">
              <span className="font-medium text-texto">{m.autor}</span>
              {m.delBot ? <Insignia>tu bot</Insignia> : null}
              {m.fijado ? <Insignia tono="aviso">fijado</Insignia> : null}
              <span>{haceCuanto(m.fecha)}</span>
            </div>
            <p className={cx("mt-1 whitespace-pre-wrap text-sm", !m.texto && "text-tenue")}>
              {m.texto || (m.tarjeta ? `[Tarjeta] ${m.tarjeta}` : m.adjuntos ? `[${m.adjuntos} archivo(s)]` : "(sin texto visible)")}
            </p>
            {puede ? (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {m.delBot ? (
                  <Boton
                    tamano="sm"
                    variante="fantasma"
                    icono={Pencil}
                    onClick={() => {
                      setEditando(m);
                      setNuevoTexto(m.texto);
                    }}
                  >
                    Editar
                  </Boton>
                ) : null}
                <Boton
                  tamano="sm"
                  variante="fantasma"
                  icono={m.fijado ? PinOff : Pin}
                  onClick={() => accion.mutate(() => api(`/api/discord/canales/${canal}/mensajes/${m.id}/fijar`, { metodo: "POST", cuerpo: { fijar: !m.fijado } }))}
                >
                  {m.fijado ? "Desfijar" : "Fijar"}
                </Boton>
                <Boton
                  tamano="sm"
                  variante="fantasma"
                  icono={Trash2}
                  onClick={async () => {
                    if (
                      await confirmar({
                        titulo: "Borrar mensaje",
                        mensaje: `¿Borrar el mensaje de ${m.autor}? No se puede deshacer.`,
                        detalle: m.texto.slice(0, 300),
                        boton: "Borrar",
                      })
                    ) {
                      accion.mutate(() =>
                        api(`/api/discord/canales/${canal}/mensajes/${m.id}`, {
                          metodo: "DELETE",
                        }),
                      );
                    }
                  }}
                >
                  Borrar
                </Boton>
                <SmilePlus className="ml-2 h-4 w-4 text-tenue" />
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="rounded-lg px-1.5 py-0.5 hover:bg-tarjeta"
                    onClick={() => accion.mutate(() => api(`/api/discord/canales/${canal}/mensajes/${m.id}/reaccion`, { metodo: "POST", cuerpo: { emoji: e } }))}
                  >
                    {e}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {pgMsj.paginas}
      <Modal abierto={editando !== null} titulo="Editar mensaje del bot" alCerrar={() => setEditando(null)}>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!editando) return;
            accion.mutate(() =>
              api(`/api/discord/canales/${canal}/mensajes/${editando.id}`, {
                metodo: "PATCH",
                cuerpo: { texto: nuevoTexto },
              }),
            );
            setEditando(null);
          }}
        >
          <AreaTexto rows={5} maxLength={2000} value={nuevoTexto} onChange={(e) => setNuevoTexto(e.target.value)} />
          <Boton type="submit" variante="primario" disabled={!nuevoTexto.trim()}>
            Guardar cambios
          </Boton>
        </form>
      </Modal>
    </div>
  );
}

function Servidores() {
  const lista = useQuery({
    queryKey: ["redes", "discord", "servidores"],
    queryFn: () => api<Servidor[]>("/api/discord/servidores"),
  });
  return (
    <div className="space-y-3">
      {lista.isLoading ? <Cargando /> : null}
      <ErrorCaja error={lista.error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lista.data?.map((s) => (
          <div key={s.id} className="overflow-hidden rounded-tarjeta border border-borde bg-superficie">
            <div className="h-14 bg-[linear-gradient(135deg,#5865f2,color-mix(in_srgb,var(--acento)_60%,#1e1f22))]" />
            <div className="-mt-7 flex items-end gap-3 px-4 pb-4">
              {s.icono ? (
                <img src={s.icono} alt="" className="h-14 w-14 rounded-2xl border-4 border-superficie" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border-4 border-superficie bg-tarjeta text-lg font-semibold">{s.nombre.slice(0, 1)}</div>
              )}
              <div className="min-w-0">
                <p className="truncate font-medium">{s.nombre}</p>
                <p className="flex items-center gap-1 text-xs text-tenue">
                  <Users className="h-3 w-3" /> {s.miembros ?? "—"} miembros · {s.conectados ?? "—"} conectados
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-tenue">Para agregar el bot a otro servidor usa el enlace de invitación de tu app en discord.com/developers → OAuth2 → URL Generator (scope "bot").</p>
    </div>
  );
}

export default function Discord() {
  const datos = useCanales();
  const [pestana, setPestana] = useState<"enviar" | "mensajes" | "servidores">("enviar");
  return (
    <div className="space-y-4">
      <Encabezado titulo="Discord" descripcion="Todo con tu bot. La IA también puede redactar mensajes; se envían solo cuando apruebas." acciones={<EtiquetaInvitados />} />
      {datos.isLoading ? <Cargando /> : null}
      <ErrorCaja error={datos.error} />
      {datos.data && !datos.data.configurado ? <FaltaConfigurar variable="DISCORD_BOT_TOKEN" detalle="La cuenta maestra lo pone en Ajustes → Servicios y claves." /> : null}
      {datos.data?.configurado ? (
        <>
          <Pestanas
            valor={pestana}
            alCambiar={setPestana}
            opciones={[
              { id: "enviar", texto: "Enviar" },
              { id: "mensajes", texto: "Mensajes del canal" },
              { id: "servidores", texto: "Servidores" },
            ]}
          />
          {pestana === "enviar" ? <Enviar canales={datos.data.canales} /> : pestana === "mensajes" ? <Mensajes canales={datos.data.canales} /> : <Servidores />}
        </>
      ) : null}
    </div>
  );
}
