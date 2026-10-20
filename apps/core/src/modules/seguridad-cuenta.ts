/**
 * Seguridad de tu cuenta: dónde tienes la sesión abierta (y cerrar las que no
 * reconozcas), tus inicios de sesión recientes (correctos, fallidos y desde un
 * lugar nuevo) y las alertas de entrada a tus VPS y home labs.
 */
import { and, desc, eq, gt, inArray, isNull, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { auditLog, sessions } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "./common.js";

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

    /** Tus últimos inicios de sesión y alertas (el registro no se puede borrar). */
    app.get("/api/seguridad/inicios", autenticado, async (request) => {
      const user = currentUser(request);
      const filas = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.actorUserId, user.id), inArray(auditLog.action, ["login", "login_fallido", "login_nuevo_lugar", "login_bloqueado", "sesion_cerrada_remota", "entrada_ssh"])))
        .orderBy(desc(auditLog.createdAt))
        .limit(60);
      return filas.map((f) => ({
        fecha: f.createdAt.toISOString(),
        tipo: f.action,
        ip: f.ip,
        detalle: (f.details as { dispositivo?: string | null; motivo?: string; servidor?: string; usuario?: string }) ?? {},
        navegador: (f.userAgent ?? "").slice(0, 160),
      }));
    });
  };
}
