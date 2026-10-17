/**
 * Protocolo del WebSocket único y multiplexado (/api/ws).
 * El cliente se autentica con el primer mensaje y luego se suscribe a temas.
 */
import { z } from "zod";

/** Latido cada 15 s; un dispositivo se considera desconectado a los 45 s sin latido. */
export const HEARTBEAT_INTERVAL_MS = 15_000;
export const OFFLINE_AFTER_MS = 45_000;
/** Ventana de las gráficas en vivo (solo en memoria). */
export const LIVE_WINDOW_MS = 5 * 60_000;

export const metricasSchema = z.object({
  cpu: z.number().min(0).max(100).optional(),
  ram: z.object({ usado: z.number().nonnegative(), total: z.number().nonnegative() }).optional(),
  discos: z
    .array(z.object({ nombre: z.string().max(100), usado: z.number().nonnegative(), total: z.number().nonnegative() }))
    .max(32)
    .optional(),
  red: z.object({ rxBps: z.number().nonnegative(), txBps: z.number().nonnegative() }).optional(),
  bateria: z.object({ nivel: z.number().min(0).max(100), cargando: z.boolean() }).optional(),
  conexion: z.string().max(40).optional(),
  uptime: z.number().nonnegative().optional(),
});
export type MetricasDispositivo = z.infer<typeof metricasSchema>;

export const clienteMensajeSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("auth"), token: z.string().min(10).max(4096), dispositivoId: z.string().uuid().optional() }),
  z.object({ tipo: z.literal("sub"), tema: z.string().min(1).max(200) }),
  z.object({ tipo: z.literal("unsub"), tema: z.string().min(1).max(200) }),
  z.object({ tipo: z.literal("ping") }),
  z.object({ tipo: z.literal("latido"), metricas: metricasSchema.optional() }),
  z.object({ tipo: z.literal("metricas"), metricas: metricasSchema }),
  z.object({
    tipo: z.literal("terminal.abrir"),
    ref: z.string().max(64),
    servidorId: z.string().uuid(),
    cols: z.number().int().min(10).max(500),
    rows: z.number().int().min(5).max(300),
  }),
  z.object({ tipo: z.literal("terminal.entrada"), id: z.string().max(64), datos: z.string().max(65536) }),
  z.object({
    tipo: z.literal("terminal.tamano"),
    id: z.string().max(64),
    cols: z.number().int().min(10).max(500),
    rows: z.number().int().min(5).max(300),
  }),
  z.object({ tipo: z.literal("terminal.cerrar"), id: z.string().max(64) }),
]);
export type ClienteMensaje = z.infer<typeof clienteMensajeSchema>;

export type ServidorMensaje =
  | { tipo: "auth.ok"; usuarioId: string; /** null si no se envió dispositivo; false si no es válido. */ dispositivo: boolean | null }
  | { tipo: "auth.error"; error: string }
  | { tipo: "evento"; tema: string; datos: unknown }
  | { tipo: "error"; error: string; ref?: string }
  | { tipo: "interes"; activo: boolean }
  | { tipo: "pong" }
  | { tipo: "terminal.abierta"; ref: string; id: string }
  | { tipo: "terminal.datos"; id: string; datos: string }
  | { tipo: "terminal.cerrada"; id: string; motivo?: string };

/** Temas conocidos (prefijos). */
export const temas = {
  dispositivos: "dispositivos",
  metricasEquipo: (id: string) => `equipo:${id}:metricas`,
  usuario: (id: string) => `usuario:${id}`,
  chat: (canalId: string) => `chat:${canalId}`,
  metricasVps: (id: string) => `vps:${id}:metricas`,
  consolaPtero: (id: string) => `ptero:${id}:consola`,
} as const;

/** Evento de sincronización enviado al tema `usuario:<id>` para refrescar datos. */
export interface EventoSync {
  readonly recurso: string;
}
