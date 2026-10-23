import { Activity, MessageSquare, Pause, Play, Radio, Settings2, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Boton, Campo, Encabezado, Entrada, Insignia, Tarjeta, Vacio, avisar, cx } from "../components/ui";
import { api } from "../lib/api";
import { EtiquetaInvitados } from "../components/CuentaRed";
import { SUAVE } from "../components/vps/piezas";

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
            alMensaje({
              id: d.id,
              plataforma: "kick",
              usuario: d.sender.username,
              color: d.sender.identity?.color ?? "#53fc18",
              texto: d.content.replace(/\[emote:\d+:([^\]]+)\]/g, "$1"),
              hora: Date.now(),
            });
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
const MINUTOS = 15;

function usePorMinuto(mensajes: Mensaje[]) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return useMemo(() => {
    const cubetas = Array.from({ length: MINUTOS }, () => ({ twitch: 0, kick: 0 }));
    for (const m of mensajes) {
      const hace = Math.floor((ahora - m.hora) / 60_000);
      if (hace >= 0 && hace < MINUTOS) cubetas[MINUTOS - 1 - hace]![m.plataforma] += 1;
    }
    return cubetas;
  }, [mensajes, ahora]);
}

function Numero({ icono: Icono, valor, texto }: { icono: typeof Users; valor: string; texto: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-borde bg-superficie p-3">
      <Icono className="h-4 w-4 text-acento" />
      <p className="mt-2 text-2xl font-bold tabular-nums">{valor}</p>
      <p className="truncate text-xs text-tenue">{texto}</p>
    </div>
  );
}

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

  const porMinuto = usePorMinuto(mensajes);
  const personas = useMemo(() => {
    const cuenta = new Map<string, { usuario: string; plataforma: Mensaje["plataforma"]; color: string; n: number }>();
    for (const m of mensajes) {
      const k = `${m.plataforma}:${m.usuario}`;
      const x = cuenta.get(k);
      if (x) x.n += 1;
      else cuenta.set(k, { usuario: m.usuario, plataforma: m.plataforma, color: m.color, n: 1 });
    }
    return [...cuenta.values()].sort((a, b) => b.n - a.n);
  }, [mensajes]);
  const tope = Math.max(1, ...porMinuto.map((c) => c.twitch + c.kick));
  const ultimo = porMinuto[MINUTOS - 1]!;
  const alAire = estadoTwitch === "en vivo" || estadoKick === "en vivo";

  const guardar = () => {
    const limpio = {
      twitch: borrador.twitch
        .trim()
        .replace(/^.*twitch\.tv\//, "")
        .replace(/\W/g, ""),
      kick: borrador.kick
        .trim()
        .replace(/^.*kick\.com\//, "")
        .replace(/[^\w-]/g, ""),
    };
    setCanales(limpio);
    try {
      localStorage.setItem(CLAVE, JSON.stringify(limpio));
    } catch {
      void 0;
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
            <EtiquetaInvitados />
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
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Tarjeta
          titulo={`Chat (${mensajes.length})`}
          icono={MessageSquare}
          acciones={<Boton tamano="icono" variante="fantasma" icono={Trash2} aria-label="Limpiar" onClick={() => setMensajes([])} />}
          className="xl:row-span-4"
        >
          <div
            className="h-[min(62vh,40rem)] space-y-1 overflow-y-auto rounded-xl bg-fondo p-3"
            onScroll={(e) => {
              const t = e.currentTarget;
              setPausa(t.scrollHeight - t.scrollTop - t.clientHeight > 80);
            }}
          >
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <section className="rounded-tarjeta border border-borde bg-superficie p-4">
            <p className="text-sm font-semibold">Conexión</p>
            <div className="mt-3 space-y-2 text-sm">
              {[
                { n: "Twitch", canal: canales.twitch, estado: estadoTwitch },
                { n: "Kick", canal: canales.kick, estado: estadoKick },
              ].map((c) => (
                <div key={c.n} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {c.n} <span className="text-tenue">{c.canal || "sin canal"}</span>
                  </span>
                  {c.canal ? <Insignia tono={TONO[c.estado]}>{c.estado}</Insignia> : null}
                </div>
              ))}
            </div>
          </section>
          <section className={cx("flex flex-col justify-between rounded-tarjeta border border-borde p-4", alAire ? SUAVE.peligro : "bg-superficie text-tenue")}>
            <p className="flex items-center gap-2 text-sm font-bold">
              <span className={cx("h-2.5 w-2.5 rounded-full", alAire ? "animate-pulse bg-peligro" : "bg-tenue")} />
              {alAire ? "Al aire" : "Fuera del aire"}
            </p>
            <p className="mt-2 text-xs">{alAire ? "Estás leyendo el chat en vivo." : "Conecta tus canales para ver el chat."}</p>
          </section>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Numero icono={MessageSquare} valor={String(mensajes.length)} texto="Mensajes" />
          <Numero icono={Users} valor={String(personas.length)} texto="Personas" />
          <Numero icono={Activity} valor={String(ultimo.twitch + ultimo.kick)} texto="Por minuto" />
        </div>

        <Tarjeta titulo="Mensajes por minuto" icono={Activity}>
          <div className="flex h-28 items-end gap-1">
            {porMinuto.map((c, i) => (
              <div key={i} className="flex h-full flex-1 flex-col justify-end gap-[2px]" title={`${c.twitch + c.kick} mensajes`}>
                <span className="rounded-t-sm bg-[#53fc18]" style={{ height: `${(c.kick / tope) * 100}%` }} />
                <span className={cx("bg-[#a970ff]", !c.kick && "rounded-t-sm")} style={{ height: `${(c.twitch / tope) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-tenue">
            <span>hace {MINUTOS} min</span>
            <span className="flex gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#a970ff]" /> Twitch
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#53fc18]" /> Kick
              </span>
            </span>
            <span>ahora</span>
          </div>
        </Tarjeta>

        <Tarjeta titulo="Quién escribe más" icono={Users}>
          {!personas.length ? <p className="text-sm text-tenue">Aún no hay mensajes.</p> : null}
          <ol className="space-y-1.5">
            {personas.slice(0, 5).map((p, i) => (
              <li key={`${p.plataforma}:${p.usuario}`} className="flex items-center gap-2 text-sm">
                <span className="w-4 text-xs text-tenue">{i + 1}</span>
                <span className={cx("rounded px-1 text-[10px] font-bold text-black", p.plataforma === "twitch" ? "bg-[#a970ff]" : "bg-[#53fc18]")}>{p.plataforma === "twitch" ? "TW" : "KK"}</span>
                <span className="min-w-0 flex-1 truncate font-medium" style={{ color: p.color }}>
                  {p.usuario}
                </span>
                <span className="text-xs tabular-nums text-tenue">{p.n}</span>
              </li>
            ))}
          </ol>
        </Tarjeta>
      </div>
      <p className="text-xs text-tenue">YouTube no permite leer su chat sin su API de pago por cuota: ábrelo junto con este en otra ventana.</p>
    </div>
  );
}
