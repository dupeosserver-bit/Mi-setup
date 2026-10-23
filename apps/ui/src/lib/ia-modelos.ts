/** Modelos de IA además de Claude: los de Ollama descargados en el VPS y los agentes (IA → Agentes de IA). */
import type { ModeloElegido } from "@mi-setup/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface ModeloExtra {
  id: ModeloElegido;
  nombre: string;
  detalle: string;
}

export function useModelosExtra(): ModeloExtra[] {
  const q = useQuery({
    queryKey: ["ia", "modelos-extra"],
    queryFn: () =>
      api<{ ollama: { id: ModeloElegido; nombre: string }[]; agentes: { id: ModeloElegido; nombre: string; detalle: string }[] }>("/api/ia/modelos-extra"),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return [
    ...(q.data?.ollama ?? []).map((m) => ({ id: m.id, nombre: `${m.nombre} (Ollama, gratis)`, detalle: "Descargado en tu VPS. Solo conversa (no propone acciones)." })),
    ...(q.data?.agentes ?? []),
  ];
}
