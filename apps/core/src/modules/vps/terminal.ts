/**
 * Terminal tipo Termius sobre el WebSocket: el backend abre la sesión SSH
 * (shell interactiva) y reenvía datos en base64. Root exige reautenticación
 * fuerte (contraseña o huella) en los últimos 5 minutos.
 */
import { randomUUID } from "node:crypto";
import { can, reauthSatisfies } from "@mi-setup/shared";
import type { Client, ClientChannel } from "ssh2";
import type { Conexion } from "../../realtime/hub.js";
import type { ModuleDeps } from "../common.js";
import type { Servidores } from "./servidores.js";

interface Sesion {
  id: string;
  con: Conexion;
  cliente: Client;
  canal: ClientChannel;
  servidor: string;
  userId: string;
}

const MAX_POR_CONEXION = 10;

export function registrarTerminal(deps: ModuleDeps, servidores: Servidores): void {
  const { hub } = deps;
  const sesiones = new Map<string, Sesion>();

  const cerrar = (id: string, motivo?: string) => {
    const s = sesiones.get(id);
    if (!s) return;
    sesiones.delete(id);
    s.canal.close();
    s.cliente.end();
    hub.enviar(s.con, { tipo: "terminal.cerrada", id, ...(motivo ? { motivo } : {}) });
    void deps.audit.record({
      actorType: "usuario",
      actorUserId: s.userId,
      action: "terminal_cerrada",
      module: "vps_terminal",
      target: s.servidor,
      outcome: "ok",
    });
  };

  hub.registrarManejador("terminal.abrir", async (con, msg) => {
    const error = (texto: string) => hub.enviar(con, { tipo: "error", error: texto, ref: msg.ref });
    // Se vuelve a validar la sesión para conocer la reautenticación más reciente.
    const user = con.token ? await deps.auth.authenticate(con.token) : null;
    if (!user) return error("Sesión vencida");
    if (!can(user, "vps_terminal", "escritura")) return error("Sin permiso para la terminal");
    if ([...sesiones.values()].filter((s) => s.con === con).length >= MAX_POR_CONEXION) {
      return error("Demasiadas terminales abiertas");
    }
    try {
      const servidor = await servidores.obtener(msg.servidorId);
      if (servidor.username === "root" && !reauthSatisfies(user, "fuerte", deps.now())) {
        return hub.enviar(con, { tipo: "error", error: "reauth_requerida", ref: msg.ref });
      }
      const cliente = await servidores.conectar(servidor);
      cliente.shell({ term: "xterm-256color", cols: msg.cols, rows: msg.rows }, (err, canal) => {
        if (err) {
          cliente.end();
          return error(`No se pudo abrir la terminal: ${err.message}`);
        }
        const id = randomUUID();
        sesiones.set(id, { id, con, cliente, canal, servidor: servidor.name, userId: user.id });
        hub.enviar(con, { tipo: "terminal.abierta", ref: msg.ref, id });
        canal.on("data", (d: Buffer) => hub.enviar(con, { tipo: "terminal.datos", id, datos: d.toString("base64") }));
        canal.stderr.on("data", (d: Buffer) => hub.enviar(con, { tipo: "terminal.datos", id, datos: d.toString("base64") }));
        canal.on("close", () => cerrar(id));
        void deps.audit.record({
          actorType: "usuario",
          actorUserId: user.id,
          action: "terminal_abierta",
          module: "vps_terminal",
          target: servidor.name,
          outcome: "ok",
          details: { usuario: servidor.username },
        });
      });
      cliente.on("error", () => undefined);
    } catch (err) {
      error(err instanceof Error ? err.message : "No se pudo conectar");
    }
  });

  hub.registrarManejador("terminal.entrada", (con, msg) => {
    const s = sesiones.get(msg.id);
    if (s && s.con === con) s.canal.write(msg.datos);
  });

  hub.registrarManejador("terminal.tamano", (con, msg) => {
    const s = sesiones.get(msg.id);
    if (s && s.con === con) s.canal.setWindow(msg.rows, msg.cols, 0, 0);
  });

  hub.registrarManejador("terminal.cerrar", (con, msg) => {
    const s = sesiones.get(msg.id);
    if (s && s.con === con) cerrar(msg.id);
  });

  hub.onCerrar((con) => {
    for (const s of [...sesiones.values()]) if (s.con === con) cerrar(s.id, "conexión cerrada");
  });
}
