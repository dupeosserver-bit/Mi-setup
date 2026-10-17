/**
 * Terminal tipo Termius sobre el WebSocket: el backend abre la sesión SSH
 * (shell interactiva) y reenvía datos en base64. Root exige reautenticación
 * fuerte (contraseña o huella) en los últimos 5 minutos.
 *
 * Las sesiones pertenecen a la cuenta, no a la conexión: si cambias de
 * pantalla o el celular pierde la conexión, la sesión sigue viva en el
 * servidor (guardando los últimos 64 KB de salida) y se retoma al volver.
 * Se cierra sola tras 30 minutos sin nadie conectado.
 */
import { randomUUID } from "node:crypto";
import { can, reauthSatisfies } from "@mi-setup/shared";
import type { Client, ClientChannel } from "ssh2";
import type { Conexion } from "../../realtime/hub.js";
import type { ModuleDeps } from "../common.js";
import type { Servidores } from "./servidores.js";

interface Sesion {
  id: string;
  /** Conexión que la está mirando (null = suelta, sigue viva en el servidor). */
  con: Conexion | null;
  cliente: Client;
  canal: ClientChannel;
  servidorId: string;
  servidor: string;
  userId: string;
  /** Salida reciente para mostrarla al retomar. */
  buffer: Buffer[];
  bytes: number;
  vence: NodeJS.Timeout | null;
}

const MAX_POR_CUENTA = 10;
const MAX_BUFFER = 64 * 1024;
const VIDA_SUELTA_MS = 30 * 60_000;

export function registrarTerminal(deps: ModuleDeps, servidores: Servidores): void {
  const { hub } = deps;
  const sesiones = new Map<string, Sesion>();

  const cerrar = (id: string, motivo?: string) => {
    const s = sesiones.get(id);
    if (!s) return;
    sesiones.delete(id);
    if (s.vence) clearTimeout(s.vence);
    s.canal.close();
    s.cliente.end();
    if (s.con) hub.enviar(s.con, { tipo: "terminal.cerrada", id, ...(motivo ? { motivo } : {}) });
    void deps.audit.record({ actorType: "usuario", actorUserId: s.userId, action: "terminal_cerrada", module: "vps_terminal", target: s.servidor, outcome: "ok" });
  };

  /** La sesión queda sin pantalla: sigue viva hasta 30 min. */
  const soltar = (s: Sesion) => {
    s.con = null;
    if (s.vence) clearTimeout(s.vence);
    s.vence = setTimeout(() => cerrar(s.id, "inactiva 30 minutos"), VIDA_SUELTA_MS);
  };

  const guardarSalida = (s: Sesion, d: Buffer) => {
    s.buffer.push(d);
    s.bytes += d.length;
    while (s.bytes > MAX_BUFFER && s.buffer.length > 1) s.bytes -= s.buffer.shift()!.length;
  };

  const usuarioDe = async (con: Conexion) => (con.token ? deps.auth.authenticate(con.token) : null);

  hub.registrarManejador("terminal.abrir", async (con, msg) => {
    const error = (texto: string) => hub.enviar(con, { tipo: "error", error: texto, ref: msg.ref });
    // Se vuelve a validar la sesión para conocer la reautenticación más reciente.
    const user = await usuarioDe(con);
    if (!user) return error("Sesión vencida");
    if (!can(user, "vps_terminal", "escritura")) return error("Sin permiso para la terminal");
    if ([...sesiones.values()].filter((s) => s.userId === user.id).length >= MAX_POR_CUENTA) {
      return error("Demasiadas terminales abiertas: cierra alguna");
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
        const s: Sesion = { id, con, cliente, canal, servidorId: servidor.id, servidor: servidor.name, userId: user.id, buffer: [], bytes: 0, vence: null };
        sesiones.set(id, s);
        hub.enviar(con, { tipo: "terminal.abierta", ref: msg.ref, id });
        const salida = (d: Buffer) => {
          guardarSalida(s, d);
          if (s.con) hub.enviar(s.con, { tipo: "terminal.datos", id, datos: d.toString("base64") });
        };
        canal.on("data", salida);
        canal.stderr.on("data", salida);
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

  /** Sesiones abiertas de la cuenta (para retomarlas). */
  hub.registrarManejador("terminal.lista", async (con) => {
    const user = await usuarioDe(con);
    if (!user || !can(user, "vps_terminal", "escritura")) return;
    const lista = [...sesiones.values()].filter((s) => s.userId === user.id).map((s) => ({ id: s.id, servidorId: s.servidorId, servidor: s.servidor }));
    hub.enviar(con, { tipo: "terminal.sesiones", sesiones: lista });
  });

  /** Retoma una sesión de la misma cuenta y le reenvía la salida reciente. */
  hub.registrarManejador("terminal.reanudar", async (con, msg) => {
    const s = sesiones.get(msg.id);
    const user = await usuarioDe(con);
    if (!s || !user || s.userId !== user.id || !can(user, "vps_terminal", "escritura")) {
      return hub.enviar(con, { tipo: "terminal.cerrada", id: msg.id, motivo: "la sesión ya no existe" });
    }
    if (s.vence) clearTimeout(s.vence);
    s.vence = null;
    // Si otra pantalla la tenía, deja de recibir.
    s.con = con;
    s.canal.setWindow(msg.rows, msg.cols, 0, 0);
    hub.enviar(con, { tipo: "terminal.reanudada", id: s.id });
    if (s.bytes) hub.enviar(con, { tipo: "terminal.datos", id: s.id, datos: Buffer.concat(s.buffer).toString("base64") });
  });

  hub.registrarManejador("terminal.soltar", (con, msg) => {
    const s = sesiones.get(msg.id);
    if (s && s.con === con) soltar(s);
  });

  hub.registrarManejador("terminal.entrada", (con, msg) => {
    const s = sesiones.get(msg.id);
    if (s && s.con === con) s.canal.write(msg.datos);
  });

  hub.registrarManejador("terminal.tamano", (con, msg) => {
    const s = sesiones.get(msg.id);
    if (s && s.con === con) s.canal.setWindow(msg.rows, msg.cols, 0, 0);
  });

  hub.registrarManejador("terminal.cerrar", async (con, msg) => {
    const s = sesiones.get(msg.id);
    const user = s && s.con !== con ? await usuarioDe(con) : null;
    // Se cierra desde la pantalla que la mira o desde cualquier dispositivo de la misma cuenta.
    if (s && (s.con === con || user?.id === s.userId)) cerrar(msg.id);
  });

  // Si se corta la conexión (cambio de app, sin señal), las sesiones quedan sueltas, no se cierran.
  hub.onCerrar((con) => {
    for (const s of sesiones.values()) if (s.con === con) soltar(s);
  });
}
