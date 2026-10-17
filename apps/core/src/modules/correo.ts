/**
 * Correos temporales: Cloudflare Email Routing (catch-all) → Email Worker →
 * POST /api/mail/inbound firmado con HMAC-SHA256 (MAIL_INBOUND_SECRET).
 * Se rechaza una firma inválida o una fecha con más de 5 minutos de diferencia.
 * Los correos no guardados se borran a las 24 h.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mailAliases, mailMessages } from "../db/schema.js";
import { HttpError, missingConfig } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";

export const VENTANA_FIRMA_S = 300;
export const RETENCION_MS = 24 * 60 * 60_000;
const MAX_CUERPO = 1024 * 1024;

export function firmar(secreto: string, fecha: string, cuerpo: string): string {
  return createHmac("sha256", secreto).update(`${fecha}.${cuerpo}`).digest("hex");
}

/** Verifica firma y fecha. Devuelve un motivo de rechazo o null si es válida. */
export function verificarFirma(secreto: string, fecha: string | undefined, firma: string | undefined, cuerpo: string, ahora: Date): string | null {
  if (!fecha || !firma || !/^\d{9,12}$/.test(fecha) || !/^[a-f0-9]{64}$/.test(firma)) return "faltan cabeceras";
  if (Math.abs(ahora.getTime() / 1000 - Number(fecha)) > VENTANA_FIRMA_S) return "fecha fuera de la ventana";
  const esperada = Buffer.from(firmar(secreto, fecha, cuerpo), "hex");
  const recibida = Buffer.from(firma, "hex");
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida) ? null : "firma inválida";
}

const entranteSchema = z.object({
  para: z.string().trim().toLowerCase().email().max(254),
  de: z.string().trim().max(500),
  asunto: z.string().max(1000).default(""),
  texto: z.string().max(400_000).default(""),
  html: z.string().max(800_000).nullable().optional(),
  messageId: z.string().max(500).optional(),
  tamano: z.number().int().nonnegative().optional(),
});

const ALIAS = /^[a-z0-9][a-z0-9._-]{1,40}$/;
const PALABRAS = ["sol", "luna", "rio", "nopal", "maiz", "cobre", "jade", "nube", "trueno", "cielo", "fuego", "piedra"];

export async function purgarCorreos(deps: ModuleDeps): Promise<void> {
  await deps.db.delete(mailMessages).where(and(eq(mailMessages.saved, false), lt(mailMessages.receivedAt, new Date(deps.now().getTime() - RETENCION_MS))));
}

export function correoRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const dominio = deps.config.env.DOMAIN.toLowerCase();

  async function entrante(app: FastifyInstance): Promise<void> {
    // En este plugin el cuerpo llega sin parsear: la firma se calcula sobre el texto exacto.
    app.addContentTypeParser("application/json", { parseAs: "string", bodyLimit: MAX_CUERPO }, (_req, cuerpo, hecho) => hecho(null, cuerpo));
    app.post("/api/mail/inbound", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const secreto = deps.config.env.MAIL_INBOUND_SECRET;
      if (!secreto) throw missingConfig("MAIL_INBOUND_SECRET");
      const crudo = typeof request.body === "string" ? request.body : "";
      const motivo = verificarFirma(
        secreto,
        request.headers["x-mi-setup-fecha"] as string | undefined,
        request.headers["x-mi-setup-firma"] as string | undefined,
        crudo,
        deps.now(),
      );
      if (motivo) {
        request.log.warn({ motivo }, "Correo entrante rechazado");
        throw new HttpError(401, "Firma inválida");
      }
      let datos: z.infer<typeof entranteSchema>;
      try {
        datos = entranteSchema.parse(JSON.parse(crudo));
      } catch {
        throw new HttpError(400, "Cuerpo inválido");
      }
      const [local, dom] = datos.para.split("@");
      if (dom !== dominio || !local) return reply.code(202).send({ aceptado: false });
      const [alias] = await db.select().from(mailAliases).where(and(eq(mailAliases.alias, local), eq(mailAliases.active, true)));
      // Alias desconocido o desactivado: se acepta en silencio para no revelar cuáles existen.
      if (!alias) return reply.code(202).send({ aceptado: false });
      const messageId = datos.messageId || `${datos.de}|${datos.asunto}|${Date.now()}`;
      const insertado = await db
        .insert(mailMessages)
        .values({
          aliasId: alias.id,
          messageId,
          from: datos.de,
          to: datos.para,
          subject: datos.asunto,
          text: datos.texto,
          html: datos.html ?? null,
          size: datos.tamano ?? crudo.length,
          receivedAt: deps.now(),
        })
        .onConflictDoNothing()
        .returning({ id: mailMessages.id });
      if (insertado.length) {
        deps.hub.publicar(`usuario:${alias.userId}`, { recurso: "correos", aviso: { titulo: `Correo para ${alias.alias}`, cuerpo: datos.asunto || datos.de } });
      }
      return reply.code(202).send({ aceptado: true });
    });
  }

  const L = { config: { acceso: { modulo: "correos_temporales" as const, nivel: "lectura" as const } } };
  const E = { config: { acceso: { modulo: "correos_temporales" as const, nivel: "escritura" as const } } };

  async function propias(userId: string): Promise<string[]> {
    return (await db.select({ id: mailAliases.id }).from(mailAliases).where(eq(mailAliases.userId, userId))).map((a) => a.id);
  }

  return async function (app: FastifyInstance): Promise<void> {
    await app.register(entrante);

    app.get("/api/correos/alias", L, async (request) => {
      const user = currentUser(request);
      const filas = await db.select().from(mailAliases).where(eq(mailAliases.userId, user.id)).orderBy(desc(mailAliases.createdAt));
      return { dominio, alias: filas.map((a) => ({ id: a.id, alias: a.alias, direccion: `${a.alias}@${dominio}`, etiqueta: a.label, activo: a.active })) };
    });

    app.post("/api/correos/alias", E, async (request) => {
      const user = currentUser(request);
      const d = z.object({ alias: z.string().trim().toLowerCase().optional(), etiqueta: z.string().trim().max(60).default("") }).parse(request.body);
      const alias = d.alias || `${PALABRAS[randomInt(PALABRAS.length)]}${randomInt(1000, 9999)}`;
      if (!ALIAS.test(alias)) throw new HttpError(400, "El alias solo puede tener letras, números, punto, guion y guion bajo (2 a 41)");
      const [existente] = await db.select({ id: mailAliases.id }).from(mailAliases).where(eq(mailAliases.alias, alias));
      if (existente) throw new HttpError(409, "Ese alias ya existe");
      const [a] = await db.insert(mailAliases).values({ userId: user.id, alias, label: d.etiqueta }).returning();
      return { id: a?.id, direccion: `${alias}@${dominio}` };
    });

    app.patch("/api/correos/alias/:id", E, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const d = z.object({ activo: z.boolean().optional(), etiqueta: z.string().trim().max(60).optional() }).parse(request.body);
      await db
        .update(mailAliases)
        .set({ ...(d.activo !== undefined ? { active: d.activo } : {}), ...(d.etiqueta !== undefined ? { label: d.etiqueta } : {}) })
        .where(and(eq(mailAliases.id, id), eq(mailAliases.userId, user.id)));
      return { ok: true };
    });

    app.delete("/api/correos/alias/:id", E, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await db.delete(mailAliases).where(and(eq(mailAliases.id, id), eq(mailAliases.userId, user.id)));
      return { ok: true };
    });

    app.get("/api/correos/mensajes", L, async (request) => {
      const user = currentUser(request);
      const { alias } = z.object({ alias: z.string().uuid().optional() }).parse(request.query);
      const ids = await propias(user.id);
      const filtro = alias ? (ids.includes(alias) ? [alias] : []) : ids;
      if (filtro.length === 0) return [];
      const filas = await db.select().from(mailMessages).where(inArray(mailMessages.aliasId, filtro)).orderBy(desc(mailMessages.receivedAt)).limit(300);
      const ahora = deps.now().getTime();
      return filas.map((m) => ({
        id: m.id,
        aliasId: m.aliasId,
        de: m.from,
        para: m.to,
        asunto: m.subject,
        vistaPrevia: m.text.slice(0, 160),
        recibido: m.receivedAt.toISOString(),
        guardado: m.saved,
        expiraEn: m.saved ? null : new Date(m.receivedAt.getTime() + RETENCION_MS).toISOString(),
        vencido: !m.saved && ahora - m.receivedAt.getTime() > RETENCION_MS,
      }));
    });

    app.get("/api/correos/mensajes/:id", L, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const [m] = await db.select().from(mailMessages).where(and(eq(mailMessages.id, id), inArray(mailMessages.aliasId, await propias(user.id))));
      if (!m) throw new HttpError(404, "Correo no encontrado");
      return { id: m.id, de: m.from, para: m.to, asunto: m.subject, texto: m.text, html: m.html, recibido: m.receivedAt.toISOString(), guardado: m.saved };
    });

    app.post("/api/correos/mensajes/:id/guardar", E, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const { guardado } = z.object({ guardado: z.boolean() }).parse(request.body);
      await db.update(mailMessages).set({ saved: guardado }).where(and(eq(mailMessages.id, id), inArray(mailMessages.aliasId, await propias(user.id))));
      return { ok: true };
    });

    app.delete("/api/correos/mensajes/:id", E, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await db.delete(mailMessages).where(and(eq(mailMessages.id, id), inArray(mailMessages.aliasId, await propias(user.id))));
      return { ok: true };
    });
  };
}
