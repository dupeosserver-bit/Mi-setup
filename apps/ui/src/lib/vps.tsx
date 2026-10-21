/** Datos compartidos del VPS: lista de servidores y selector. */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Selector } from "../components/ui";
import { api } from "./api";

export interface Servidor {
  id: string;
  nombre: string;
  host: string;
  puerto: number;
  usuario: string;
  tipo: "llave" | "password";
  /** Hay frase guardada para la llave (nunca se envía la frase). */
  conFrase?: boolean;
  esRoot: boolean;
  huella: string | null;
  alertas: boolean;
  umbralRam: number | null;
  umbralDisco: number | null;
  umbralCpu?: number | null;
  estado: "arriba" | "caido" | "desconocido";
  ultimaRevision: string | null;
}

export function useServidores() {
  return useQuery({ queryKey: ["vps", "servidores"], queryFn: () => api<Servidor[]>("/api/vps/servidores"), refetchInterval: 60_000 });
}

/** Selector de servidor; elige el primero si no hay ninguno elegido. */
export function SelectorServidor({ valor, alCambiar }: { valor: string | null; alCambiar: (id: string) => void }) {
  const { data } = useServidores();
  useEffect(() => {
    if (!valor && data?.[0]) alCambiar(data[0].id);
  }, [valor, data, alCambiar]);
  if (!data?.length) return null;
  return (
    <Selector value={valor ?? ""} onChange={(e) => alCambiar(e.target.value)} className="max-w-64">
      {data.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nombre} ({s.usuario}@{s.host})
        </option>
      ))}
    </Selector>
  );
}
