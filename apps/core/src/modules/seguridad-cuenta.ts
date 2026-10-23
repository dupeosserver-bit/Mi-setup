/**
 * Sesiones abiertas de tu cuenta (viven en Equipos) y entradas recientes con
 * alertas de todo el servidor (viven en VPS → Seguridad del servidor).
 */
import { and, count, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auditLog, sessions, users } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "./common.js";

const TIPOS_ENTRADA = ["login", "login_fallido", "login_nuevo_lugar", "login_bloqueado", "sesion_cerrada_remota", "entrada_ssh"];

export function seguridadCuentaRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const autenticado = { config: { acceso: { autenticado: true as const } } };
  const conPin = { config: { acceso: { autenticado: true as const, reauth: "pin" as const } } };

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/seguridad/sesiones", autenticado, async (request) => {
      const user = currentUser(request);
      const filas = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.userId, user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, deps.now())))
        .orderBy(desc(sessions.lastUsedAt))
        .limit(50);
      return filas.map((s) => ({
        id: s.id,
        dispositivo: s.deviceName ?? "Sin nombre",
        navegador: (s.userAgent ?? "").slice(0, 160),
        ip: s.ip,
        creada: s.createdAt.toISOString(),
        ultimoUso: s.lastUsedAt.toISOString(),
        actual: s.id === user.sessionId,
      }));
    });

    app.delete("/api/seguridad/sesiones/:id", conPin, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      if (id === user.sessionId) throw new HttpError(400, "Esa es la sesión que estás usando; para salir usa «Cerrar sesión».");
      const r = await db
        .update(sessions)
        .set({ revokedAt: deps.now() })
        .where(and(eq(sessions.id, id), eq(sessions.userId, user.id), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      if (!r.length) throw new HttpError(404, "Esa sesión ya no está abierta");
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "sesion_cerrada_remota", target: id, outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });

    app.post("/api/seguridad/sesiones/cerrar-otras", conPin, async (request) => {
      const user = currentUser(request);
      const r = await db
        .update(sessions)
        .set({ revokedAt: deps.now() })
        .where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId), isNull(sessions.revokedAt)))
        .returning({ id: sessions.id });
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "sesiones_cerradas", outcome: "ok", details: { cerradas: r.length }, ...clientInfo(request) });
      return { cerradas: r.length };
    });

    app.get("/api/vps/seguridad/entradas", { config: { acceso: { modulo: "vps_seguridad", nivel: "lectura" } } }, async (request) => {
      const { pagina, porPagina } = z.object({ pagina: z.coerce.number().int().min(1).max(1000).default(1), porPagina: z.coerce.number().int().min(5).max(50).default(15) }).parse(request.query);
      const filtro = inArray(auditLog.action, TIPOS_ENTRADA);
      const [total] = await db.select({ n: count() }).from(auditLog).where(filtro);
      const filas = await db
        .select({ fila: auditLog, email: users.email, nombre: users.displayName })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.actorUserId, users.id))
        .where(filtro)
        .orderBy(desc(auditLog.createdAt))
        .limit(porPagina)
        .offset((pagina - 1) * porPagina);
      return {
        total: Number(total?.n ?? 0),
        pagina,
        porPagina,
        entradas: filas.map(({ fila: f, email, nombre }) => ({
          fecha: f.createdAt.toISOString(),
          tipo: f.action,
          ip: f.ip,
          usuario: nombre ?? email ?? null,
          detalle: (f.details as { dispositivo?: string | null; motivo?: string; servidor?: string; usuario?: string }) ?? {},
          navegador: (f.userAgent ?? "").slice(0, 160),
        })),
      };
    });
  };
}
