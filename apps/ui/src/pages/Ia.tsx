import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AjustesIa } from "../components/AjustesIa";
import type { AdjuntoIa } from "../components/EntradaIa";
import { Conversacion } from "../components/ia/Conversacion";
import { Deudas } from "../components/ia/Deudas";
import { InicioIa } from "../components/ia/InicioIa";
import { Cargando, FaltaConfigurar, Pestanas, Vacio } from "../components/ui";
import { TarjetaPropuesta, usePropuestas, useUsoIa } from "../lib/ia";
import { localeActual } from "../lib/idioma";
import { useModoPagina } from "../lib/marco";

type Pestana = "chat" | "pendientes" | "historial" | "deudas" | "ajustes";
const PESTANAS: readonly Pestana[] = ["chat", "pendientes", "historial", "deudas", "ajustes"];

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

function leerPreguntaLarga(): string | null {
  try {
    return sessionStorage.getItem("mi-setup.pregunta");
  } catch {
    return null;
  }
}

export default function Ia() {
  const [params, setParams] = useSearchParams();
  const pedida = params.get("pestana") as Pestana | null;
  const pestana: Pestana = pedida && PESTANAS.includes(pedida) ? pedida : "chat";
  const chat = params.get("chat");
  const caso = params.get("caso");
  const pregunta = params.get("pregunta") === "@sesion" ? leerPreguntaLarga() : params.get("pregunta");
  const [inicial, setInicial] = useState<{ mensaje: string; adjuntos: AdjuntoIa[] } | null>(null);
  const uso = useUsoIa();
  const pendientes = (usePropuestas().data ?? []).filter((p) => p.estado === "pendiente").length;
  const enInicio = pestana === "chat" && !chat;
  useModoPagina("fijo", enInicio);

  const ir = (p: Pestana) => setParams(p === "chat" ? {} : { pestana: p });

  if (pestana === "chat" && chat) {
    return (
      <Conversacion
        key={chat === "nuevo" ? `nuevo-${params.get("proyecto") ?? ""}` : chat}
        id={chat === "nuevo" ? null : chat}
        proyectoId={params.get("proyecto")}
        inicial={chat === "nuevo" ? inicial : null}
        alSalir={() => {
          setInicial(null);
          setParams({});
        }}
        alAbierto={(id) => setParams({ chat: id }, { replace: true })}
      />
    );
  }
  if (pestana === "deudas" && caso) return <Deudas abierto={caso} alAbrir={(id) => setParams({ pestana: "deudas", caso: id })} alSalir={() => setParams({ pestana: "deudas" })} />;

  const pestanas = (
    <Pestanas
      valor={pestana}
      alCambiar={ir}
      opciones={[
        { id: "chat", texto: "Chat" },
        { id: "pendientes", texto: `Pendientes${pendientes ? ` (${pendientes})` : ""}` },
        { id: "historial", texto: "Historial" },
        { id: "deudas", texto: "Deudas" },
        { id: "ajustes", texto: "Ajustes de la IA" },
      ]}
    />
  );
  const avisos = (
    <>
      {uso.data && !uso.data.configurada ? <FaltaConfigurar variable="ANTHROPIC_API_KEY" /> : null}
      {uso.data?.bloqueada ? <p className="text-sm text-peligro">Se alcanzó el tope mensual de la IA: queda bloqueada hasta el próximo mes (o usa una IA gratis del VPS).</p> : null}
    </>
  );

  if (enInicio) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {avisos}
        <div className="min-h-0 flex-1">
          <InicioIa
            pestanas={pestanas}
            textoInicial={pregunta}
            alAbrir={(id) => setParams({ chat: id })}
            alNuevo={(proyectoId, mensaje) => {
              setInicial(mensaje ?? null);
              setParams({ chat: "nuevo", ...(proyectoId ? { proyecto: proyectoId } : {}) });
            }}
            alPestana={ir}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-titulo text-xl font-semibold">IA asistente</h1>
        {pestanas}
      </div>
      {avisos}
      {pestana === "deudas" ? (
        <Deudas abierto={null} alAbrir={(id) => setParams({ pestana: "deudas", caso: id })} alSalir={() => setParams({ pestana: "deudas" })} />
      ) : pestana === "ajustes" ? (
        <AjustesIa />
      ) : (
        <Cola soloPendientes={pestana === "pendientes"} />
      )}
    </div>
  );
}
