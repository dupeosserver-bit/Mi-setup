/** Apartado IA: chat estilo Claude (proyectos, memoria y skills), cola de propuestas, historial y ajustes de la IA. */
import { useState } from "react";
import { AjustesIa } from "../components/AjustesIa";
import { ChatIa } from "../components/ChatIa";
import { Negociar } from "../components/IaExtras";
import { Cargando, FaltaConfigurar, Pestanas, Vacio } from "../components/ui";
import { TarjetaPropuesta, usePropuestas, useUsoIa } from "../lib/ia";

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
  const [pestana, setPestana] = useState<"chat" | "pendientes" | "historial" | "deudas" | "ajustes">("chat");
  const uso = useUsoIa();
  const pendientes = (usePropuestas().data ?? []).filter((p) => p.estado === "pendiente").length;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
      {pestana === "chat" ? <ChatIa /> : pestana === "deudas" ? <Negociar /> : pestana === "ajustes" ? <AjustesIa /> : <Cola soloPendientes={pestana === "pendientes"} />}
    </div>
  );
}
