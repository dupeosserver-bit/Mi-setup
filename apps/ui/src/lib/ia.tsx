/** Piezas compartidas de la IA: tipos, consultas y la tarjeta de propuesta con Aprobar / Rechazar. */
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Sparkles, X } from "lucide-react";
import { Boton, Insignia, avisar, avisarError } from "../components/ui";
import { api } from "./api";
import { confirmar } from "./confirmar";
import { queryClient } from "./consultas";

export interface Propuesta {
  id: string;
  conversacionId: string | null;
  herramienta: string;
  entrada: Record<string, unknown>;
  descripcion: string;
  peligrosa: boolean;
  estado: "pendiente" | "aprobada" | "rechazada" | "ejecutada" | "fallida";
  resultado: unknown;
  error: string | null;
  creada: string;
}

export interface UsoIa {
  configurada: boolean;
  modelo: string;
  presupuestoUsd: number;
  gastadoUsd: number;
  bloqueada: boolean;
  /** Hay clave de Claude. */
  claude?: boolean;
  /** Hay IA local gratis (Ollama) configurada. */
  local?: boolean;
  modeloLocal?: string | null;
  topeAlcanzado?: boolean;
}

export interface RespuestaChat {
  conversacionId: string;
  respuesta: string;
  propuestas: Propuesta[];
  costoUsd: number;
  /** Aviso cuando respondió la IA local en lugar de Claude. */
  aviso?: string | null;
  local?: boolean;
}

export const CONFIRMACION_PELIGROSA = "EJECUTAR";

export function useUsoIa() {
  return useQuery({ queryKey: ["ia", "uso"], queryFn: () => api<UsoIa>("/api/ia/uso") });
}

/** Propuestas recientes (todas) — fuente del estado actual de cada tarjeta. */
export function usePropuestas() {
  return useQuery({ queryKey: ["ia", "propuestas"], queryFn: () => api<Propuesta[]>("/api/ia/propuestas") });
}

const TONO = { pendiente: "aviso", aprobada: "neutro", rechazada: "neutro", ejecutada: "ok", fallida: "peligro" } as const;

/** Herramientas de diagnóstico: su salida vuelve a la IA para que la analice. */
export const HERRAMIENTAS_DIAGNOSTICO = new Set(["diagnosticar_vps", "leer_archivo_vps", "estado_servidor_juego"]);
export const MENSAJE_ANALIZAR = "Analiza el resultado de la revisión: dime en palabras simples qué está mal, por qué y cómo arreglarlo.";

function textoSalida(r: unknown): string | null {
  if (r == null) return null;
  const c = r as { salida?: string; error?: string; codigo?: number | null };
  if (typeof c === "object" && "salida" in c) return `${c.salida ?? ""}${c.error ? `\n${c.error}` : ""}`.trim() || `(sin salida, código ${c.codigo ?? "?"})`;
  return JSON.stringify(r, null, 2);
}

export function TarjetaPropuesta({ p, alAnalizar }: { p: Propuesta; alAnalizar?: (() => void) | undefined }) {
  const salida = textoSalida(p.resultado);
  const decidir = useMutation({
    mutationFn: async (accion: "aprobar" | "rechazar") => {
      if (accion === "rechazar") return api<Propuesta>(`/api/ia/propuestas/${p.id}/rechazar`, { metodo: "POST" });
      const ok = await confirmar({
        titulo: p.peligrosa ? "Acción peligrosa propuesta por la IA" : "Aprobar propuesta de la IA",
        mensaje: p.peligrosa
          ? "Esto puede borrar datos o cortar un servicio. Revisa el detalle; después se pedirá tu contraseña o huella."
          : "Se ejecutará exactamente esto:",
        detalle: `${p.descripcion}\n\n${JSON.stringify(p.entrada, null, 2)}`,
        peligroso: p.peligrosa,
        ...(p.peligrosa ? { textoExacto: CONFIRMACION_PELIGROSA } : {}),
        boton: "Aprobar y ejecutar",
      });
      if (!ok) return null;
      return api<Propuesta>(`/api/ia/propuestas/${p.id}/aprobar`, {
        metodo: "POST",
        cuerpo: p.peligrosa ? { confirmacion: CONFIRMACION_PELIGROSA } : {},
      });
    },
    onSuccess: (r) => {
      if (!r) return;
      if (r.estado === "ejecutada") avisar("Acción ejecutada");
      else if (r.estado === "fallida") avisar(`Falló: ${r.error ?? "error"}`, "error");
      else if (r.estado === "rechazada") avisar("Propuesta rechazada", "info");
      void queryClient.invalidateQueries({ queryKey: ["ia"] });
    },
    onError: avisarError,
  });

  return (
    <div className="rounded-xl border border-borde bg-tarjeta p-3 text-left text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words font-medium">
          {p.peligrosa ? <AlertTriangle className="mr-1 inline h-4 w-4 text-peligro" /> : null}
          {p.descripcion}
        </p>
        <Insignia tono={TONO[p.estado]}>{p.estado}</Insignia>
      </div>
      {p.error ? <p className="mt-1 text-xs text-peligro">{p.error}</p> : null}
      {p.estado === "ejecutada" && salida ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-tenue">Ver salida</summary>
          <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-fondo p-2 font-mono text-[11px]">{salida}</pre>
        </details>
      ) : null}
      {p.estado === "ejecutada" && alAnalizar ? (
        <Boton tamano="sm" variante="secundario" icono={Sparkles} className="mt-2" onClick={alAnalizar}>
          Analizar con la IA
        </Boton>
      ) : null}
      {p.estado === "pendiente" ? (
        <div className="mt-3 flex gap-2">
          <Boton
            tamano="sm"
            variante={p.peligrosa ? "peligro" : "primario"}
            icono={Check}
            cargando={decidir.isPending}
            onClick={() => decidir.mutate("aprobar")}
          >
            Aprobar
          </Boton>
          <Boton tamano="sm" variante="fantasma" icono={X} disabled={decidir.isPending} onClick={() => decidir.mutate("rechazar")}>
            Rechazar
          </Boton>
        </div>
      ) : null}
    </div>
  );
}
