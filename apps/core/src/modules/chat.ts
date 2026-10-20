/**
 * Chat privado: canales entre dispositivos (celular ↔ PC) para mensajes,
 * enlaces, recordatorios, código, fotos, archivos, notas de voz y notas
 * compartidas. El modelo admite varios usuarios por canal (chat de
 * equipo a futuro). Cada cuenta tiene su canal personal "Mis dispositivos".
 */
import { temas } from "@mi-setup/shared";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { chatChannels, chatMembers, chatMessages, devices, users } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";
import { crearRecordatorio } from "./recordatorios.js";
import { carpetaArchivos, disposicion } from "./herramientas.js";
import { AUDIO_SEGURO, tipoPorBytes } from "./notas-adjuntos.js";

const MAX_ARCHIVO_CHAT = 25 * 1024 * 1024;
const IMAGEN_CHAT = /^image\/(png|jpeg|webp|gif)$/;

export function firmarArchivoChat(secreto: string, mensajeId: string): string {
  return createHmac("sha256", secreto).update(`chat-archivo:${mensajeId}`).digest("base64url").slice(0, 24);
}

const URL_SOLA = /^https?:\/\/\S+$/i;

const mensajeSchema = z.object({
  // El código puede ser largo; el texto normal hasta 4000.
  texto: z.string().trim().min(1).max(20000),
  dispositivoId: z.string().uuid().optional(),
  recordatorio: z.object({ fecha: z.coerce.date() }).optional(),
  /** Bloque de código (se ve con letra de código y botón de copiar). */
  codigo: z.object({ lenguaje: z.string().trim().max(30).default("") }).optional(),
  /** Nota compartida con su enlace de solo lectura. */
  nota: z.object({ enlace: z.string().url().max(300), titulo: z.string().max(200), extracto: z.string().max(400).default("") }).optional(),
});

let secretoChat = "desarrollo-sin-secreto";

function aDto(m: typeof chatMessages.$inferSelect, autor: string | null) {
  const archivo = typeof (m.meta as { archivo?: unknown }).archivo === "string";
  return {
    archivoUrl: archivo ? `/api/chat/archivo/${m.id}/${firmarArchivoChat(secretoChat, m.id)}` : null,
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
  if (!d.codigo && d.texto.length > 4000) throw new HttpError(400, "El mensaje es muy largo (máximo 4000 letras)");
  let deviceId: string | null = null;
  if (d.dispositivoId) {
    const [dev] = await deps.db.select({ userId: devices.userId }).from(devices).where(eq(devices.id, d.dispositivoId));
    if (dev?.userId === userId) deviceId = d.dispositivoId;
  }
  let kind = d.codigo ? "codigo" : d.nota ? "nota" : URL_SOLA.test(d.texto) ? "enlace" : "texto";
  let meta: Record<string, unknown> = d.codigo ? { lenguaje: d.codigo.lenguaje } : d.nota ? { ...d.nota } : {};
  if (d.nota && !d.nota.enlace.startsWith(`https://${deps.config.env.APP_HOST}/n/`)) throw new HttpError(400, "Ese enlace no es de una nota de Mi Setup");
  if (d.recordatorio) {
    const r = await crearRecordatorio(deps, userId, { titulo: d.texto.slice(0, 200), fecha: d.recordatorio.fecha });
    kind = "recordatorio";
    meta = { recordatorioId: r.id, fecha: r.fecha };
  }
  return publicar(deps, { canalId, userId, deviceId, kind, body: d.texto, meta, aviso: kind === "codigo" ? "Te mandó código" : d.texto });
}

/** Guarda el mensaje, lo manda en tiempo real y avisa a los demás. */
async function publicar(
  deps: ModuleDeps,
  m0: { canalId: string; userId: string; deviceId: string | null; kind: string; body: string; meta: Record<string, unknown>; aviso: string },
) {
  const [m] = await deps.db
    .insert(chatMessages)
    .values({ channelId: m0.canalId, userId: m0.userId, deviceId: m0.deviceId, kind: m0.kind, body: m0.body, meta: m0.meta })
    .returning();
  if (!m) throw new HttpError(500, "No se pudo enviar el mensaje");
  const [autor] = await deps.db.select({ nombre: users.displayName }).from(users).where(eq(users.id, m0.userId));
  const dto = aDto(m, autor?.nombre ?? null);
  deps.hub.publicar(temas.chat(m0.canalId), { mensaje: dto });
  await avisarMiembros(deps, m0.canalId, m0.userId, autor?.nombre ?? "Alguien", m0.aviso).catch(() => undefined);
  return dto;
}

/**
 * Notificación a los demás miembros (privados y grupos; "Mis dispositivos" no
 * avisa porque eres tú mismo). A la cuenta maestra también le llega push por
 * ntfy, que funciona aunque la app esté cerrada.
 */
async function avisarMiembros(deps: ModuleDeps, canalId: string, autorId: string, autor: string, texto: string) {
  const [canal] = await deps.db.select({ nombre: chatChannels.name, tipo: chatChannels.kind }).from(chatChannels).where(eq(chatChannels.id, canalId));
  if (!canal || canal.tipo === "personal") return;
  const destinatarios = await deps.db
    .select({ id: users.id, rol: users.role })
    .from(chatMembers)
    .innerJoin(users, eq(users.id, chatMembers.userId))
    .where(and(eq(chatMembers.channelId, canalId), eq(users.isActive, true)));
  const titulo = canal.tipo === "privado" ? `Mensaje de ${autor}` : `${autor} en ${canal.nombre}`;
  const cuerpo = texto.length > 140 ? `${texto.slice(0, 140)}…` : texto;
  for (const u of destinatarios) {
    if (u.id === autorId) continue;
    deps.hub.publicar(`usuario:${u.id}`, { recurso: "chat", aviso: { titulo, cuerpo } });
    if (u.rol === "maestra") {
      await deps.notifier.send({ title: titulo, message: cuerpo, priority: 3, tags: ["speech_balloon"], click: `https://${deps.config.env.APP_HOST}/chat?canal=${canalId}` });
    }
  }
}

export function chatRoutes(deps: ModuleDeps) {
  const { db } = deps;
  secretoChat = deps.config.env.JWT_SECRET ?? deps.config.env.SERVER_ENC_KEY ?? "desarrollo-sin-secreto";
  const carpetaCanal = (canalId: string) => join(carpetaArchivos(deps), "chat", canalId);
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
      // Miembros de cada canal: en los privados el nombre que ves es el de la otra persona.
      const ids = canales.map((c) => c.id);
      const miembros = ids.length
        ? await db
            .select({ canal: chatMembers.channelId, id: users.id, nombre: users.displayName })
            .from(chatMembers)
            .innerJoin(users, eq(users.id, chatMembers.userId))
            .where(inArray(chatMembers.channelId, ids))
        : [];
      return canales.map((c) => {
        const de = miembros.filter((m) => m.canal === c.id).map((m) => ({ id: m.id, nombre: m.nombre }));
        const otro = de.find((m) => m.id !== user.id);
        return { ...c, nombre: c.tipo === "privado" ? (otro?.nombre ?? c.nombre) : c.nombre, miembros: de };
      });
    });

    /** Mensaje privado con otra cuenta: abre la conversación que ya existe o crea una nueva. */
    app.post("/api/chat/privado", { config: { acceso: { modulo: "chat", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const { usuarioId } = z.object({ usuarioId: z.string().uuid() }).parse(request.body);
      if (usuarioId === user.id) throw new HttpError(400, "Para escribirte a ti mismo usa 'Mis dispositivos'");
      const [otro] = await db.select({ id: users.id, nombre: users.displayName }).from(users).where(and(eq(users.id, usuarioId), eq(users.isActive, true)));
      if (!otro) throw new HttpError(404, "Esa cuenta no existe");
      const mios = await db
        .select({ id: chatChannels.id })
        .from(chatChannels)
        .innerJoin(chatMembers, eq(chatMembers.channelId, chatChannels.id))
        .where(and(eq(chatChannels.kind, "privado"), eq(chatMembers.userId, user.id)));
      for (const c of mios) {
        const m = await db.select({ userId: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.channelId, c.id));
        if (m.length === 2 && m.some((x) => x.userId === usuarioId)) return { id: c.id, nombre: otro.nombre, tipo: "privado" };
      }
      const [canal] = await db.insert(chatChannels).values({ name: "Privado", kind: "privado", createdBy: user.id }).returning();
      if (!canal) throw new HttpError(500, "No se pudo crear la conversación");
      await db.insert(chatMembers).values([
        { channelId: canal.id, userId: user.id },
        { channelId: canal.id, userId: usuarioId },
      ]);
      for (const id of [user.id, usuarioId]) deps.hub.publicar(temas.usuario(id), { recurso: "chat" });
      return { id: canal.id, nombre: otro.nombre, tipo: "privado" };
    });

    /** Grupos: cambiar nombre y agregar personas (cualquier miembro), o salirse. */
    app.patch("/api/chat/canales/:id", { config: { acceso: { modulo: "chat", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const d = z.object({ nombre: z.string().trim().min(1).max(60).optional(), agregar: z.array(z.string().uuid()).max(50).default([]) }).parse(request.body);
      const [canal] = await db.select().from(chatChannels).where(eq(chatChannels.id, id));
      if (!canal || canal.kind !== "grupo" || !(await esMiembro(deps, id, user.id))) throw new HttpError(404, "Grupo no encontrado");
      if (d.nombre) await db.update(chatChannels).set({ name: d.nombre }).where(eq(chatChannels.id, id));
      if (d.agregar.length) {
        const validos = await db.select({ id: users.id }).from(users).where(and(inArray(users.id, d.agregar), eq(users.isActive, true)));
        const ya = new Set((await db.select({ u: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.channelId, id))).map((x) => x.u));
        const nuevos = validos.filter((v) => !ya.has(v.id));
        if (nuevos.length) await db.insert(chatMembers).values(nuevos.map((v) => ({ channelId: id, userId: v.id })));
      }
      const todos = await db.select({ u: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.channelId, id));
      for (const m of todos) deps.hub.publicar(temas.usuario(m.u), { recurso: "chat" });
      return { ok: true };
    });

    app.post("/api/chat/canales/:id/salir", { config: { acceso: { modulo: "chat", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const [canal] = await db.select().from(chatChannels).where(eq(chatChannels.id, id));
      if (!canal || canal.kind === "personal") throw new HttpError(400, "No puedes salir de este canal");
      await db.delete(chatMembers).where(and(eq(chatMembers.channelId, id), eq(chatMembers.userId, user.id)));
      const quedan = await db.select({ u: chatMembers.userId }).from(chatMembers).where(eq(chatMembers.channelId, id));
      // Si ya nadie queda, se borra el canal con sus mensajes.
      if (!quedan.length) await db.delete(chatChannels).where(eq(chatChannels.id, id));
      for (const m of [...quedan.map((q) => q.u), user.id]) deps.hub.publicar(temas.usuario(m), { recurso: "chat" });
      return { ok: true };
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

    /** Foto, archivo o nota de voz (campo «archivo»; antes, opcionales «texto» y «duracion»). */
    app.post("/api/chat/canales/:id/archivo", { config: { acceso: { modulo: "chat", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      if (!(await esMiembro(deps, id, user.id))) throw new HttpError(403, "No perteneces a este canal");
      let texto = "";
      let duracion: number | null = null;
      let voz = false;
      let guardado: { id: string; nombre: string; mime: string; tamano: number } | null = null;
      for await (const parte of request.parts({ limits: { fileSize: MAX_ARCHIVO_CHAT, files: 1 } })) {
        if (parte.type === "field") {
          if (parte.fieldname === "texto") texto = String(parte.value).slice(0, 1000);
          if (parte.fieldname === "duracion") duracion = Math.min(3600, Math.max(0, Number(parte.value) || 0));
          if (parte.fieldname === "voz") voz = String(parte.value) === "1";
          continue;
        }
        const buf = await parte.toBuffer();
        if (parte.file.truncated) throw new HttpError(413, "El archivo pasa de 25 MB");
        if (!buf.length) throw new HttpError(400, "El archivo está vacío");
        const archivoId = randomUUID();
        await mkdir(carpetaCanal(id), { recursive: true });
        await writeFile(join(carpetaCanal(id), `${archivoId}.bin`), buf);
        const nombre = basename(parte.filename || "archivo").replace(/[^\w.() áéíóúñÁÉÍÓÚÑ-]/g, "_").slice(0, 120) || "archivo";
        guardado = { id: archivoId, nombre, mime: tipoPorBytes(buf, parte.mimetype), tamano: buf.length };
      }
      if (!guardado) throw new HttpError(400, "Falta el archivo");
      const kind = voz && AUDIO_SEGURO.test(guardado.mime.split(";")[0]!) ? "voz" : IMAGEN_CHAT.test(guardado.mime) ? "foto" : "archivo";
      const aviso = kind === "voz" ? "🎤 Nota de voz" : kind === "foto" ? "📷 Foto" : `📎 ${guardado.nombre}`;
      return publicar(deps, {
        canalId: id,
        userId: user.id,
        deviceId: null,
        kind,
        body: texto || (kind === "archivo" ? guardado.nombre : ""),
        meta: { archivo: guardado.id, nombre: guardado.nombre, mime: guardado.mime, tamano: guardado.tamano, ...(duracion !== null ? { duracion } : {}) },
        aviso: texto ? `${aviso}: ${texto}` : aviso,
      });
    });

    /** Ver o bajar el archivo de un mensaje (dirección firmada: sirve para <img> y <audio>). */
    app.get("/api/chat/archivo/:id/:firma", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { id, firma } = z.object({ id: z.string().uuid(), firma: z.string().max(40) }).parse(request.params);
      const esperada = Buffer.from(firmarArchivoChat(secretoChat, id));
      const recibida = Buffer.from(firma);
      if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) throw new HttpError(404, "No encontrado");
      const [m] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
      const meta = (m?.meta ?? {}) as { archivo?: string; nombre?: string; mime?: string };
      if (!m || typeof meta.archivo !== "string") throw new HttpError(404, "No encontrado");
      const ruta = join(carpetaCanal(m.channelId), `${basename(meta.archivo)}.bin`);
      const s = await stat(ruta).catch(() => null);
      if (!s?.isFile()) throw new HttpError(404, "El archivo ya no está");
      const mime = (meta.mime ?? "").split(";")[0]!;
      const enLinea = IMAGEN_CHAT.test(mime) || AUDIO_SEGURO.test(mime);
      return reply
        .header("content-type", enLinea ? mime : "application/octet-stream")
        .header("content-length", String(s.size))
        .header("content-disposition", disposicion(meta.nombre ?? "archivo", enLinea ? "inline" : "attachment"))
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "private, max-age=3600")
        .send(createReadStream(ruta));
    });

    /** Borrar un mensaje propio (y su archivo). */
    app.delete("/api/chat/mensajes/:id", { config: { acceso: { modulo: "chat", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const [m] = await db.delete(chatMessages).where(and(eq(chatMessages.id, id), eq(chatMessages.userId, user.id))).returning();
      if (!m) throw new HttpError(404, "Ese mensaje no existe o no es tuyo");
      const archivo = (m.meta as { archivo?: unknown }).archivo;
      if (typeof archivo === "string") await rm(join(carpetaCanal(m.channelId), `${basename(archivo)}.bin`), { force: true });
      deps.hub.publicar(temas.chat(m.channelId), { borrado: m.id });
      return { ok: true };
    });
  };
}
