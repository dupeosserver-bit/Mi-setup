/** Apartado IA: conversaciones, cola de propuestas pendientes, historial y gasto del mes. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessagesSquare, Paperclip, Trash2, Volume2 } from "lucide-react";
import { useState } from "react";
import { EntradaIa, type AdjuntoIa } from "../components/EntradaIa";
import { Boton, Cargando, Encabezado, ErrorCaja, FaltaConfigurar, Pestanas, Tarjeta, Vacio, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient } from "../lib/consultas";
import { TarjetaPropuesta, usePropuestas, useUsoIa, type Propuesta, type RespuestaChat } from "../lib/ia";
import { usePreferencias } from "../lib/preferencias";
import { hablar } from "../lib/voz";

interface Conversacion {
  id: string;
  titulo: string;
  actualizada: string;
}
interface Detalle {
  id: string;
  titulo: string;
  mensajes: { id: number; rol: string; texto: string; adjuntos: number; fecha: string }[];
  propuestas: Propuesta[];
}

function Uso() {
  const uso = useUsoIa();
  if (!uso.data) return null;
  const pct = Math.min(100, (uso.data.gastadoUsd / uso.data.presupuestoUsd) * 100);
  return (
    <Tarjeta titulo="Gasto del mes">
      <p className="text-sm">
        {uso.data.gastadoUsd.toFixed(4)} de {uso.data.presupuestoUsd} USD · modelo {uso.data.modelo}
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-tarjeta">
        <div className={cx("h-full", pct >= 100 ? "bg-peligro" : pct > 80 ? "bg-aviso" : "bg-acento")} style={{ width: `${pct}%` }} />
      </div>
      {uso.data.bloqueada ? <p className="mt-2 text-xs text-peligro">Tope alcanzado: la IA queda bloqueada hasta el próximo mes.</p> : null}
    </Tarjeta>
  );
}

function Chat() {
  const [actual, setActual] = useState<string | null>(null);
  const lista = useQuery({ queryKey: ["ia", "conversaciones"], queryFn: () => api<Conversacion[]>("/api/ia/conversaciones") });
  const detalle = useQuery({
    queryKey: ["ia", "conversacion", actual],
    queryFn: () => api<Detalle>(`/api/ia/conversaciones/${actual}`),
    enabled: Boolean(actual),
  });
  const propuestas = usePropuestas();
  const estado = new Map((propuestas.data ?? []).map((p) => [p.id, p]));

  const prefs = usePreferencias();
  const enviar = useMutation({
    mutationFn: ({ mensaje, adjuntos }: { mensaje: string; adjuntos: AdjuntoIa[] }) =>
      api<RespuestaChat>("/api/ia/chat", {
        metodo: "POST",
        cuerpo: { mensaje, conversacionId: actual ?? undefined, modulo: "ia", adjuntos: adjuntos.map(({ nombre, tipo, datos }) => ({ nombre, tipo, datos })) },
      }),
    onSuccess: (r) => {
      setActual(r.conversacionId);
      if (prefs.voz.leerRespuestas && r.respuesta) void hablar(r.respuesta, prefs.voz).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ["ia"] });
    },
  });
  const borrar = useMutation({
    mutationFn: (id: string) => api(`/api/ia/conversaciones/${id}`, { metodo: "DELETE" }),
    onSuccess: () => {
      setActual(null);
      void queryClient.invalidateQueries({ queryKey: ["ia"] });
    },
  });

  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]">
      <div className="space-y-1">
        <Boton className="w-full" variante="primario" onClick={() => setActual(null)}>
          Nueva conversación
        </Boton>
        {lista.data?.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActual(c.id)}
            className={cx("block w-full truncate rounded-xl px-3 py-2 text-left text-sm", actual === c.id ? "bg-tarjeta" : "text-tenue hover:bg-tarjeta")}
          >
            {c.titulo}
          </button>
        ))}
      </div>
      <Tarjeta
        titulo={detalle.data?.titulo ?? "Nueva conversación"}
        acciones={
          actual ? (
            <Boton
              tamano="icono"
              variante="fantasma"
              icono={Trash2}
              aria-label="Borrar conversación"
              onClick={async () => {
                if (await confirmar({ titulo: "Borrar conversación", mensaje: "Se borra el historial. Las propuestas quedan en la cola." })) {
                  borrar.mutate(actual);
                }
              }}
            />
          ) : null
        }
      >
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {actual && detalle.isLoading ? <Cargando /> : null}
          {!actual ? <Vacio icono={MessagesSquare} texto="Escribe para empezar. La IA solo propone; tú apruebas." /> : null}
          {detalle.data?.mensajes.map((m) => (
            <div key={m.id} className={cx(m.rol === "user" && "text-right")}>
              <p
                className={cx(
                  "inline-block max-w-[90%] whitespace-pre-wrap rounded-xl px-3 py-2 text-left text-sm",
                  m.rol === "user" ? "border border-borde bg-fondo" : "bg-tarjeta",
                )}
              >
                {m.texto}
                {m.adjuntos ? (
                  <span className="mt-1 flex items-center gap-1 text-xs text-tenue">
                    <Paperclip className="h-3 w-3" /> {m.adjuntos} archivo(s)
                  </span>
                ) : null}
                {m.rol === "assistant" ? (
                  <button type="button" className="mt-1 block text-tenue hover:text-texto" aria-label="Leer en voz alta" onClick={() => void hablar(m.texto, prefs.voz)}>
                    <Volume2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </p>
            </div>
          ))}
          {detalle.data?.propuestas.map((p) => <TarjetaPropuesta key={p.id} p={estado.get(p.id) ?? p} />)}
          {enviar.isPending ? <p className="text-sm text-tenue">Pensando…</p> : null}
          <ErrorCaja error={enviar.error} />
        </div>
        <div className="mt-3">
          <EntradaIa cargando={enviar.isPending} alEnviar={(mensaje, adjuntos) => enviar.mutate({ mensaje, adjuntos })} />
        </div>
      </Tarjeta>
    </div>
  );
}

function Cola({ soloPendientes }: { soloPendientes: boolean }) {
  const propuestas = usePropuestas();
  if (propuestas.isLoading) return <Cargando />;
  const lista = (propuestas.data ?? []).filter((p) => (soloPendientes ? p.estado === "pendiente" : p.estado !== "pendiente"));
  if (!lista.length) return <Vacio texto={soloPendientes ? "No hay propuestas pendientes." : "Sin historial todavía."} />;
  return (
    <div className="space-y-2">
      {lista.map((p) => (
        <div key={p.id}>
          <TarjetaPropuesta p={p} />
          <p className="mt-1 text-xs text-tenue">{new Date(p.creada).toLocaleString("es-MX")}</p>
        </div>
      ))}
    </div>
  );
}

export default function Ia() {
  const [pestana, setPestana] = useState<"chat" | "pendientes" | "historial">("chat");
  const uso = useUsoIa();
  const pendientes = (usePropuestas().data ?? []).filter((p) => p.estado === "pendiente").length;
  return (
    <div className="space-y-4">
      <Encabezado titulo="IA asistente" descripcion="Propone acciones; solo se ejecutan cuando tocas Aprobar. Las peligrosas piden doble confirmación." />
      {uso.data && !uso.data.configurada ? <FaltaConfigurar variable="ANTHROPIC_API_KEY" /> : null}
      <Uso />
      <Pestanas
        valor={pestana}
        alCambiar={setPestana}
        opciones={[
          { id: "chat", texto: "Chat" },
          { id: "pendientes", texto: `Pendientes${pendientes ? ` (${pendientes})` : ""}` },
          { id: "historial", texto: "Historial" },
        ]}
      />
      {pestana === "chat" ? <Chat /> : <Cola soloPendientes={pestana === "pendientes"} />}
    </div>
  );
}
