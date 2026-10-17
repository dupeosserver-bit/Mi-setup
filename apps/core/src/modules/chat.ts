/**
 * Chat privado: canales entre dispositivos (celular ↔ PC) para mensajes,
 * enlaces y recordatorios. El modelo admite varios usuarios por canal (chat de
 * equipo a futuro). Cada cuenta tiene su canal personal "Mis dispositivos".
 */
import { temas } from "@mi-setup/shared";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { chatChannels, chatMembers, chatMessages, devices, users } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";
import { crearRecordatorio } from "./recordatorios.js";

const URL_SOLA = /^https?:\/\/\S+$/i;

const mensajeSchema = z.object({
  texto: z.string().trim().min(1).max(4000),
  dispositivoId: z.string().uuid().optional(),
  recordatorio: z.object({ fecha: z.coerce.date() }).optional(),
});

function aDto(m: typeof chatMessages.$inferSelect, autor: string | null) {
  return {
    id: m.id,
    canalId: m.channelId,
    usuarioId: m.userId,
    autor,
    dispositivoId: m.deviceId,
    tipo: m.kind,
    texto: m.body,
    meta: m.meta,
    fecha: m.createdAt.toISOString(),
  };
}

export async function esMiembro(deps: Pick<ModuleDeps, "db">, canalId: string, userId: string): Promise<boolean> {
  const filas = await deps.db
    .select({ c: chatMembers.channelId })
    .from(chatMembers)
    .where(and(eq(chatMembers.channelId, canalId), eq(chatMembers.userId, userId)))
    .limit(1);
  return filas.length > 0;
}

async function asegurarCanalPersonal(deps: ModuleDeps, userId: string): Promise<void> {
  const propios = await deps.db
    .select({ id: chatChannels.id })
    .from(chatChannels)
    .innerJoin(chatMembers, eq(chatMembers.channelId, chatChannels.id))
    .where(and(eq(chatMembers.userId, userId), eq(chatChannels.kind, "personal")))
    .limit(1);
  if (propios.length > 0) return;
  const [canal] = await deps.db
    .insert(chatChannels)
    .values({ name: "Mis dispositivos", kind: "personal", createdBy: userId })
    .returning({ id: chatChannels.id });
  if (canal) await deps.db.insert(chatMembers).values({ channelId: canal.id, userId });
}

/** Publica un mensaje en un canal (también lo usa la IA tras aprobación). */
export async function enviarMensaje(
  deps: ModuleDeps,
  userId: string,
  canalId: string,
  datos: z.input<typeof mensajeSchema>,
) {
  if (!(await esMiembro(deps, canalId, userId))) throw new HttpError(403, "No perteneces a este canal");
  const d = mensajeSchema.parse(datos);
  let deviceId: string | null = null;
  if (d.dispositivoId) {
    const [dev] = await deps.db.select({ userId: devices.userId }).from(devices).where(eq(devices.id, d.dispositivoId));
    if (dev?.userId === userId) deviceId = d.dispositivoId;
  }
  let kind = URL_SOLA.test(d.texto) ? "enlace" : "texto";
  let meta: Record<string, unknown> = {};
  if (d.recordatorio) {
    const r = await crearRecordatorio(deps, userId, { titulo: d.texto.slice(0, 200), fecha: d.recordatorio.fecha });
    kind = "recordatorio";
    meta = { recordatorioId: r.id, fecha: r.fecha };
  }
  const [m] = await deps.db
    .insert(chatMessages)
    .values({ channelId: canalId, userId, deviceId, kind, body: d.texto, meta })
    .returning();
  if (!m) throw new HttpError(500, "No se pudo enviar el mensaje");
  const [autor] = await deps.db.select({ nombre: users.displayName }).from(users).where(eq(users.id, userId));
  const dto = aDto(m, autor?.nombre ?? null);
  deps.hub.publicar(temas.chat(canalId), { mensaje: dto });
  return dto;
}

export function chatRoutes(deps: ModuleDeps) {
  const { db } = deps;
  deps.hub.registrarTema("chat:", async (user, tema) => esMiembro(deps, tema.slice("chat:".length), user.id));

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/chat/canales", { config: { acceso: { modulo: "chat", nivel: "lectura" } } }, async (request) => {
      const user = currentUser(request);
      await asegurarCanalPersonal(deps, user.id);
      const canales = await db
        .select({ id: chatChannels.id, nombre: chatChannels.name, tipo: chatChannels.kind })
        .from(chatChannels)
        .innerJoin(chatMembers, eq(chatMembers.channelId, chatChannels.id))
        .where(eq(chatMembers.userId, user.id))
        .orderBy(chatChannels.createdAt);
      return canales;
    });

    app.get("/api/chat/usuarios", { config: { acceso: { modulo: "chat", nivel: "lectura" } } }, async () =>
      db.select({ id: users.id, nombre: users.displayName }).from(users).where(eq(users.isActive, true)),
    );

    app.post("/api/chat/canales", { config: { acceso: { modulo: "chat", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const d = z
        .object({ nombre: z.string().trim().min(1).max(60), miembros: z.array(z.string().uuid()).max(50).default([]) })
        .parse(request.body);
      const ids = [...new Set([user.id, ...d.miembros])];
      const existentes = await db.select({ id: users.id }).from(users).where(inArray(users.id, ids));
      if (existentes.length !== ids.length) throw new HttpError(400, "Algún miembro no existe");
      const [canal] = await db.insert(chatChannels).values({ name: d.nombre, kind: "grupo", createdBy: user.id }).returning();
      if (!canal) throw new HttpError(500, "No se pudo crear el canal");
      await db.insert(chatMembers).values(ids.map((userId) => ({ channelId: canal.id, userId })));
      for (const id of ids) deps.hub.publicar(temas.usuario(id), { recurso: "chat" });
      return { id: canal.id, nombre: canal.name, tipo: canal.kind };
    });

    app.get("/api/chat/canales/:id/mensajes", { config: { acceso: { modulo: "chat", nivel: "lectura" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const { antesDe, limite } = z
        .object({ antesDe: z.coerce.date().optional(), limite: z.coerce.number().int().min(1).max(200).default(60) })
        .parse(request.query);
      if (!(await esMiembro(deps, id, user.id))) throw new HttpError(403, "No perteneces a este canal");
      const filas = await db
        .select({ m: chatMessages, autor: users.displayName })
        .from(chatMessages)
        .leftJoin(users, eq(users.id, chatMessages.userId))
        .where(antesDe ? and(eq(chatMessages.channelId, id), lt(chatMessages.createdAt, antesDe)) : eq(chatMessages.channelId, id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(limite);
      return filas.reverse().map((f) => aDto(f.m, f.autor));
    });

    app.post("/api/chat/canales/:id/mensajes", { config: { acceso: { modulo: "chat", nivel: "escritura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      return enviarMensaje(deps, currentUser(request).id, id, request.body as z.input<typeof mensajeSchema>);
    });
  };
}
