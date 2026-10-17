/** Apartado IA: conversaciones, cola de propuestas pendientes, historial y gasto del mes. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { MessagesSquare, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { AreaTexto, Boton, Cargando, Encabezado, ErrorCaja, FaltaConfigurar, Pestanas, Tarjeta, Vacio, cx } from "../components/ui";
import { api } from "../lib/api";
import { confirmar } from "../lib/confirmar";
import { queryClient } from "../lib/consultas";
import { TarjetaPropuesta, usePropuestas, useUsoIa, type Propuesta, type RespuestaChat } from "../lib/ia";

interface Conversacion {
  id: string;
  titulo: string;
  actualizada: string;
}
interface Detalle {
  id: string;
  titulo: string;
  mensajes: { id: number; rol: string; texto: string; fecha: string }[];
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
  const [texto, setTexto] = useState("");
  const lista = useQuery({ queryKey: ["ia", "conversaciones"], queryFn: () => api<Conversacion[]>("/api/ia/conversaciones") });
  const detalle = useQuery({
    queryKey: ["ia", "conversacion", actual],
    queryFn: () => api<Detalle>(`/api/ia/conversaciones/${actual}`),
    enabled: Boolean(actual),
  });
  const propuestas = usePropuestas();
  const estado = new Map((propuestas.data ?? []).map((p) => [p.id, p]));

  const enviar = useMutation({
    mutationFn: (mensaje: string) =>
      api<RespuestaChat>("/api/ia/chat", { metodo: "POST", cuerpo: { mensaje, conversacionId: actual ?? undefined, modulo: "ia" } }),
    onSuccess: (r) => {
      setActual(r.conversacionId);
      setTexto("");
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
  const mandar = () => {
    if (texto.trim() && !enviar.isPending) enviar.mutate(texto.trim());
  };

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
                  m.rol === "user" ? "bg-acento/15" : "bg-tarjeta",
                )}
              >
                {m.texto}
              </p>
            </div>
          ))}
          {detalle.data?.propuestas.map((p) => <TarjetaPropuesta key={p.id} p={estado.get(p.id) ?? p} />)}
          {enviar.isPending ? <p className="text-sm text-tenue">Pensando…</p> : null}
          <ErrorCaja error={enviar.error} />
        </div>
        <div className="mt-3 flex items-end gap-2">
          <AreaTexto
            rows={2}
            value={texto}
            placeholder="Escribe tu mensaje…"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                mandar();
              }
            }}
          />
          <Boton variante="primario" tamano="icono" icono={Send} aria-label="Enviar" cargando={enviar.isPending} disabled={!texto.trim()} onClick={mandar} />
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
