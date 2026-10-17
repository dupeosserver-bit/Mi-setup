/**
 * Bots de Discord en el VPS: ver estado y reiniciar. Cada bot se identifica por
 * servicio systemd, proceso pm2 o contenedor Docker (nombre validado: nunca se
 * concatena texto libre en el comando).
 */
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { discordBots } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import { currentUser } from "../../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "../common.js";
import type { Servidores } from "./servidores.js";
import { citar, ejecutar } from "./ssh.js";

const OBJETIVO = /^[A-Za-z0-9_.@:-]{1,100}$/;

const botSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  servidorId: z.string().uuid(),
  tipo: z.enum(["systemd", "pm2", "docker"]),
  objetivo: z.string().trim().regex(OBJETIVO, "Nombre de servicio, proceso o contenedor inválido"),
});

type Tipo = z.infer<typeof botSchema>["tipo"];

export function comandoEstado(tipo: Tipo, objetivo: string, root: boolean): string {
  const t = citar(objetivo);
  const sudo = root ? "" : "sudo -n ";
  if (tipo === "systemd") return `systemctl is-active ${t}`;
  if (tipo === "pm2") return "pm2 jlist";
  return `${sudo}docker inspect -f '{{.State.Status}}' ${t}`;
}

export function comandoReinicio(tipo: Tipo, objetivo: string, root: boolean): string {
  const t = citar(objetivo);
  const sudo = root ? "" : "sudo -n ";
  if (tipo === "systemd") return `${sudo}systemctl restart ${t}`;
  if (tipo === "pm2") return `pm2 restart ${t}`;
  return `${sudo}docker restart ${t}`;
}

export function interpretarEstado(tipo: Tipo, objetivo: string, salida: string): string {
  if (tipo === "pm2") {
    try {
      const lista = JSON.parse(salida) as { name: string; pm2_env?: { status?: string } }[];
      return lista.find((p) => p.name === objetivo)?.pm2_env?.status ?? "no encontrado";
    } catch {
      return "desconocido";
    }
  }
  return salida.trim().split("\n")[0] || "desconocido";
}

export function botsRoutes(deps: ModuleDeps, servidores: Servidores) {
  const { db } = deps;
  const aDto = (b: typeof discordBots.$inferSelect) => ({ id: b.id, nombre: b.name, servidorId: b.serverId, tipo: b.kind, objetivo: b.target });
  const obtener = async (id: string) => {
    const [b] = await db.select().from(discordBots).where(eq(discordBots.id, id)).limit(1);
    if (!b) throw new HttpError(404, "Bot no encontrado");
    return b;
  };

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/vps/bots", { config: { acceso: { modulo: "vps_bots", nivel: "lectura" } } }, async () =>
      (await db.select().from(discordBots).orderBy(asc(discordBots.name))).map(aDto),
    );

    app.post("/api/vps/bots", { config: { acceso: { modulo: "vps_bots", nivel: "administrar" } } }, async (request) => {
      const d = botSchema.parse(request.body);
      const [b] = await db.insert(discordBots).values({ name: d.nombre, serverId: d.servidorId, kind: d.tipo, target: d.objetivo }).returning();
      if (!b) throw new HttpError(500, "No se pudo guardar");
      return aDto(b);
    });

    app.delete("/api/vps/bots/:id", { config: { acceso: { modulo: "vps_bots", nivel: "administrar" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      await db.delete(discordBots).where(eq(discordBots.id, id));
      return { ok: true };
    });

    app.get("/api/vps/bots/:id/estado", { config: { acceso: { modulo: "vps_bots", nivel: "lectura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const b = await obtener(id);
      const tipo = b.kind as Tipo;
      return servidores.usar(b.serverId, async (c, s) => {
        const r = await ejecutar(c, comandoEstado(tipo, b.target, s.username === "root"), { timeoutMs: 15_000 });
        const estado = interpretarEstado(tipo, b.target, r.salida || r.error);
        return { estado, activo: ["active", "online", "running"].includes(estado) };
      });
    });

    app.post("/api/vps/bots/:id/reiniciar", { config: { acceso: { modulo: "vps_bots", nivel: "escritura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const b = await obtener(id);
      const r = await servidores.usar(b.serverId, (c, s) => ejecutar(c, comandoReinicio(b.kind as Tipo, b.target, s.username === "root"), { timeoutMs: 60_000 }));
      await deps.audit.record({
        actorType: "usuario",
        actorUserId: currentUser(request).id,
        action: "bot_reiniciado",
        module: "vps_bots",
        target: b.name,
        outcome: r.codigo === 0 ? "ok" : "error",
        details: { codigo: r.codigo },
        ...clientInfo(request),
      });
      if (r.codigo !== 0) throw new HttpError(502, `No se pudo reiniciar: ${(r.error || r.salida).slice(0, 300)}`);
      return { ok: true };
    });
  };
}
