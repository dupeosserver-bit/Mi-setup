/**
 * Modo streamer: los chats de Twitch y Kick juntos y en vivo, en una pantalla.
 * Twitch se lee como espectador anónimo; Kick por su canal público de chat.
 */
import { MessageSquare, Pause, Play, Radio, Settings2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boton, Campo, Encabezado, Entrada, Insignia, Tarjeta, Vacio, avisar, cx } from "../components/ui";
import { api } from "../lib/api";

interface Mensaje {
  id: string;
  plataforma: "twitch" | "kick";
  usuario: string;
  color: string;
  texto: string;
  hora: number;
}

const CLAVE = "mi-setup.streamer";
const MAX = 300;

function leerCanales(): { twitch: string; kick: string } {
  try {
    return { twitch: "", kick: "", ...(JSON.parse(localStorage.getItem(CLAVE) ?? "{}") as object) };
  } catch {
    return { twitch: "", kick: "" };
  }
}

/** "@badge-info=;color=#FF0000;display-name=Juan :juan!juan@juan.tmi.twitch.tv PRIVMSG #canal :hola" */
export function leerMensajeTwitch(linea: string): Omit<Mensaje, "id" | "hora" | "plataforma"> | null {
  const m = /^(?:@(\S+) )?:(\w+)!\S+ PRIVMSG #\S+ :(.*)$/.exec(linea);
  if (!m) return null;
  const etiquetas = Object.fromEntries((m[1] ?? "").split(";").map((e) => e.split("=") as [string, string]));
  return { usuario: etiquetas["display-name"] || m[2]!, color: etiquetas["color"] || "#a970ff", texto: m[3]!.trim() };
}

function useChatTwitch(canal: string, activo: boolean, alMensaje: (m: Mensaje) => void) {
  const [estado, setEstado] = useState<"apagado" | "conectando" | "en vivo" | "error">("apagado");
  useEffect(() => {
    if (!canal || !activo) return setEstado("apagado");
    setEstado("conectando");
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    ws.onopen = () => {
      ws.send("CAP REQ :twitch.tv/tags");
      ws.send("PASS SCHMOOPIIE");
      ws.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      ws.send(`JOIN #${canal.toLowerCase()}`);
    };
    ws.onmessage = (e) => {
      for (const linea of String(e.data).split("\r\n")) {
        if (linea.startsWith("PING")) ws.send("PONG :tmi.twitch.tv");
        else if (linea.includes(" JOIN #")) setEstado("en vivo");
        const m = leerMensajeTwitch(linea);
        if (m) alMensaje({ ...m, id: crypto.randomUUID(), hora: Date.now(), plataforma: "twitch" });
      }
    };
    ws.onerror = () => setEstado("error");
    return () => ws.close();
  }, [canal, activo]);
  return estado;
}

function useChatKick(canal: string, activo: boolean, alMensaje: (m: Mensaje) => void) {
  const [estado, setEstado] = useState<"apagado" | "conectando" | "en vivo" | "error">("apagado");
  useEffect(() => {
    if (!canal || !activo) return setEstado("apagado");
    let ws: WebSocket | null = null;
    let cancelado = false;
    setEstado("conectando");
    void api<{ chatroomId: number }>(`/api/streamer/kick/${encodeURIComponent(canal)}`)
      .then(({ chatroomId }) => {
        if (cancelado) return;
        ws = new WebSocket("wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=8.4.0&flash=false");
        ws.onmessage = (e) => {
          const msg = JSON.parse(String(e.data)) as { event: string; data?: string };
          if (msg.event === "pusher:connection_established") {
            ws?.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: `chatrooms.${chatroomId}.v2` } }));
          } else if (msg.event === "pusher_internal:subscription_succeeded") setEstado("en vivo");
          else if (msg.event === "App\\Events\\ChatMessageEvent" && msg.data) {
            const d = JSON.parse(msg.data) as { id: string; content: string; sender: { username: string; identity?: { color?: string } } };
            // Los emotes de Kick vienen como [emote:123:nombre]: se deja solo el nombre.
            alMensaje({ id: d.id, plataforma: "kick", usuario: d.sender.username, color: d.sender.identity?.color ?? "#53fc18", texto: d.content.replace(/\[emote:\d+:([^\]]+)\]/g, "$1"), hora: Date.now() });
          }
        };
        ws.onerror = () => setEstado("error");
      })
      .catch((err: unknown) => {
        setEstado("error");
        avisar(err instanceof Error ? err.message : "No se pudo conectar al chat de Kick", "error");
      });
    return () => {
      cancelado = true;
      ws?.close();
    };
  }, [canal, activo]);
  return estado;
}

const TONO = { apagado: "neutro", conectando: "aviso", "en vivo": "ok", error: "peligro" } as const;

export default function Streamer() {
  const navegar = useNavigate();
  const [canales, setCanales] = useState(leerCanales);
  const [borrador, setBorrador] = useState(canales);
  const [config, setConfig] = useState(!canales.twitch && !canales.kick);
  const [activo, setActivo] = useState(true);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [pausa, setPausa] = useState(false);
  const fin = useRef<HTMLDivElement>(null);
  const agregar = (m: Mensaje) => setMensajes((l) => [...l, m].slice(-MAX));
  const estadoTwitch = useChatTwitch(canales.twitch, activo, agregar);
  const estadoKick = useChatKick(canales.kick, activo, agregar);

  useEffect(() => {
    if (!pausa) fin.current?.scrollIntoView({ block: "end" });
  }, [mensajes, pausa]);

  const guardar = () => {
    const limpio = { twitch: borrador.twitch.trim().replace(/^.*twitch\.tv\//, "").replace(/\W/g, ""), kick: borrador.kick.trim().replace(/^.*kick\.com\//, "").replace(/[^\w-]/g, "") };
    setCanales(limpio);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(limpio));
    } catch {
      /* sin almacenamiento: dura esta vez */
    }
    setConfig(false);
    setMensajes([]);
  };

  return (
    <div className="space-y-4">
      <Encabezado
        titulo="Modo streamer"
        descripcion="Tus chats de Twitch y Kick juntos, en vivo."
        acciones={
          <>
            <Boton icono={activo ? Pause : Play} onClick={() => setActivo((v) => !v)}>
              {activo ? "Desconectar" : "Conectar"}
            </Boton>
            <Boton icono={Settings2} onClick={() => setConfig(true)}>
              Canales
            </Boton>
            <Boton icono={Radio} onClick={() => navegar("/redes/streams")}>
              Título y categoría
            </Boton>
          </>
        }
      />
      {config ? (
        <Tarjeta titulo="Tus canales">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Twitch">
              <Entrada value={borrador.twitch} onChange={(e) => setBorrador({ ...borrador, twitch: e.target.value })} placeholder="jokeeryt_" />
            </Campo>
            <Campo etiqueta="Kick">
              <Entrada value={borrador.kick} onChange={(e) => setBorrador({ ...borrador, kick: e.target.value })} placeholder="JokeerYT" />
            </Campo>
          </div>
          <Boton className="mt-3" variante="primario" onClick={guardar}>
            Guardar y conectar
          </Boton>
        </Tarjeta>
      ) : null}
      <div className="flex flex-wrap gap-2 text-xs">
        {canales.twitch ? <Insignia tono={TONO[estadoTwitch]}>Twitch: {estadoTwitch}</Insignia> : null}
        {canales.kick ? <Insignia tono={TONO[estadoKick]}>Kick: {estadoKick}</Insignia> : null}
      </div>
      <Tarjeta
        titulo={`Chat (${mensajes.length})`}
        icono={MessageSquare}
        acciones={<Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Limpiar" onClick={() => setMensajes([])} />}
      >
        <div className="h-[60vh] space-y-1 overflow-y-auto" onScroll={(e) => {
          const t = e.currentTarget;
          setPausa(t.scrollHeight - t.scrollTop - t.clientHeight > 80);
        }}>
          {!mensajes.length ? <Vacio icono={MessageSquare} texto={canales.twitch || canales.kick ? "Esperando mensajes…" : "Escribe tus canales para ver el chat."} /> : null}
          {mensajes.map((m) => (
            <p key={m.id} className="break-words text-sm leading-snug [overflow-wrap:anywhere]">
              <span className={cx("mr-1 rounded px-1 text-[10px] font-bold text-black", m.plataforma === "twitch" ? "bg-[#a970ff]" : "bg-[#53fc18]")}>{m.plataforma === "twitch" ? "TW" : "KK"}</span>
              <span className="font-semibold" style={{ color: m.color }}>
                {m.usuario}
              </span>
              : {m.texto}
            </p>
          ))}
          <div ref={fin} />
        </div>
        {pausa ? <p className="mt-2 text-center text-xs text-tenue">Desplazamiento en pausa: baja hasta el final para seguir.</p> : null}
      </Tarjeta>
      <p className="text-xs text-tenue">YouTube no permite leer su chat sin su API de pago por cuota: ábrelo junto con este en otra ventana.</p>
    </div>
  );
}
