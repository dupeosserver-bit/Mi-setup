/** Apartado IA: chat estilo Claude (proyectos, memoria y skills), cola de propuestas, historial y ajustes de la IA. */
import { useState } from "react";
import { AjustesIa } from "../components/AjustesIa";
import { ChatIa } from "../components/ChatIa";
import { Negociar } from "../components/IaExtras";
import { Cargando, FaltaConfigurar, Pestanas, Vacio } from "../components/ui";
import { TarjetaPropuesta, usePropuestas, useUsoIa } from "../lib/ia";
import { localeActual } from "../lib/idioma";
import { useModoPagina } from "../lib/marco";

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
          <p className="mt-1 text-xs text-tenue">{new Date(p.creada).toLocaleString(localeActual())}</p>
        </div>
      ))}
    </div>
  );
}

export default function Ia() {
  const [pestana, setPestana] = useState<"chat" | "pendientes" | "historial" | "deudas" | "ajustes">("chat");
  const uso = useUsoIa();
  const pendientes = (usePropuestas().data ?? []).filter((p) => p.estado === "pendiente").length;
  const enChat = pestana === "chat";
  useModoPagina("fijo", enChat);
  return (
    <div className={enChat ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-3"}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <h1 className="font-titulo text-xl font-semibold">IA asistente</h1>
        <Pestanas
          valor={pestana}
          alCambiar={setPestana}
          opciones={[
            { id: "chat", texto: "Chat" },
            { id: "pendientes", texto: `Pendientes${pendientes ? ` (${pendientes})` : ""}` },
            { id: "historial", texto: "Historial" },
            { id: "deudas", texto: "Deudas" },
            { id: "ajustes", texto: "Ajustes de la IA" },
          ]}
        />
      </div>
      {uso.data && !uso.data.configurada ? <FaltaConfigurar variable="ANTHROPIC_API_KEY" /> : null}
      {uso.data?.bloqueada ? <p className="text-sm text-peligro">Se alcanzó el tope mensual de la IA: queda bloqueada hasta el próximo mes (o usa una IA gratis del VPS).</p> : null}
      {enChat ? (
        <div className="min-h-0 flex-1">
          <ChatIa />
        </div>
      ) : pestana === "deudas" ? <Negociar /> : pestana === "ajustes" ? <AjustesIa /> : <Cola soloPendientes={pestana === "pendientes"} />}
    </div>
  );
}
