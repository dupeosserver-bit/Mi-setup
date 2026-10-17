/**
 * GET /api/ws — WebSocket único. El primer mensaje debe ser
 * {tipo:"auth", token} en menos de 10 s; la sesión se revalida cada minuto
 * (el cliente reenvía "auth" cuando renueva su token).
 */
import { clienteMensajeSchema } from "@mi-setup/shared";
import type { FastifyInstance } from "fastify";
import type { ModuleDeps } from "../modules/common.js";
import type { ConexionAutenticada } from "./hub.js";

export function realtimeRoutes(deps: ModuleDeps & { verificarDispositivo: (userId: string, id: string) => Promise<boolean> }) {
  const { hub, auth } = deps;
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/ws", { websocket: true, config: { acceso: { publico: true } } }, (socket, request) => {
      const con = hub.agregar(socket);

      const sinAuth = setTimeout(() => {
        if (!con.user) socket.close(4401, "Falta autenticación");
      }, 10_000);
      const revalidar = setInterval(() => {
        if (!con.token) return;
        void auth.authenticate(con.token).then((user) => {
          if (!user) socket.close(4401, "Sesión vencida");
          else con.user = user;
        });
      }, 60_000);

      socket.on("message", (raw) => {
        void (async () => {
          let msg;
          try {
            msg = clienteMensajeSchema.parse(JSON.parse(raw.toString()));
          } catch {
            hub.enviar(con, { tipo: "error", error: "Mensaje inválido" });
            return;
          }

          if (msg.tipo === "auth") {
            const user = await auth.authenticate(msg.token);
            if (!user) {
              hub.enviar(con, { tipo: "auth.error", error: "Sesión inválida" });
              socket.close(4401, "Sesión inválida");
              return;
            }
            con.user = user;
            con.token = msg.token;
            let dispositivo: boolean | null = null;
            if (msg.dispositivoId) {
              dispositivo = await deps.verificarDispositivo(user.id, msg.dispositivoId);
              con.dispositivoId = dispositivo ? msg.dispositivoId : null;
            }
            hub.enviar(con, { tipo: "auth.ok", usuarioId: user.id, dispositivo });
            return;
          }

          if (!con.user) {
            hub.enviar(con, { tipo: "error", error: "No autenticado" });
            return;
          }

          switch (msg.tipo) {
            case "ping":
              hub.enviar(con, { tipo: "pong" });
              return;
            case "sub":
              if (!(await hub.suscribir(con, msg.tema))) {
                hub.enviar(con, { tipo: "error", error: `Sin acceso al tema ${msg.tema}` });
              }
              return;
            case "unsub":
              hub.desuscribir(con, msg.tema);
              return;
            default: {
              const manejador = hub.manejador(msg.tipo);
              if (!manejador) {
                hub.enviar(con, { tipo: "error", error: "Tipo de mensaje no soportado" });
                return;
              }
              await manejador(con as ConexionAutenticada, msg as never);
            }
          }
        })().catch((err: unknown) => {
          request.log.error({ err }, "Error en el WebSocket");
          hub.enviar(con, { tipo: "error", error: "Error interno" });
        });
      });

      socket.on("close", () => {
        clearTimeout(sinAuth);
        clearInterval(revalidar);
        hub.quitar(con);
      });
    });
  };
}
