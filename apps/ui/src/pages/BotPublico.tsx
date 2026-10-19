/**
 * Página del dueño de un bot (sin cuenta de Mi Setup): entra con el enlace que le diste, ve cómo está su bot y
 * cambia su configuración, lo enciende, apaga o reinicia. No ve el token ni nada más de tu cuenta.
 */
import { useQuery } from "@tanstack/react-query";
import { Bot } from "lucide-react";
import { useParams } from "react-router-dom";
import { PanelBot, type ApiBot, type BotDetalle } from "../components/PanelBot";
import { Cargando, ErrorCaja } from "../components/ui";
import { api } from "../lib/api";
import { queryClient } from "../lib/consultas";

export default function BotPublico() {
  const { token = "" } = useParams();
  const base = `/api/bot-publico/${token}`;
  const q = useQuery({ queryKey: ["bot-publico", token], queryFn: () => api<BotDetalle>(base), refetchInterval: 15_000, retry: false });
  const apis: ApiBot = {
    guardar: (config) => api(`${base}/config`, { metodo: "PUT", cuerpo: config }),
    accion: (a) => api<BotDetalle>(`${base}/${a}`, { metodo: "POST" }),
    recargar: () => void queryClient.invalidateQueries({ queryKey: ["bot-publico", token] }),
  };
  return (
    <div className="mx-auto min-h-full max-w-4xl space-y-4 bg-fondo p-4 text-texto">
      <header className="flex items-center gap-2 pt-2">
        <Bot className="h-6 w-6" />
        <h1 className="font-titulo text-xl font-semibold">Panel de tu bot de Discord</h1>
      </header>
      {q.isLoading ? <Cargando /> : null}
      {q.error ? (
        <div className="rounded-tarjeta border border-borde bg-superficie p-6 text-center">
          <ErrorCaja error={q.error} />
          <p className="mt-2 text-sm text-tenue">Si crees que es un error, pídele a quien te vendió el bot un enlace nuevo.</p>
        </div>
      ) : null}
      {q.data ? <PanelBot bot={q.data} api={apis} cliente /> : null}
    </div>
  );
}
