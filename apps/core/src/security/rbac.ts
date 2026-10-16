/**
 * Chequeo de permisos por módulo para rutas de Fastify.
 *
 * Cada ruta protegida declara el módulo y el nivel mínimo:
 *   app.get("/api/notas", { preHandler: requirePermission("notas", "lectura") }, handler)
 *
 * `request.authUser` lo rellena la autenticación (fase 2). Sin usuario → 401;
 * sin permiso → 403 y se registra en auditoría como "denegado".
 */
import { can, type ModuleId, type PermissionLevel, type PermissionSubject } from "@mi-setup/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { AuditWriter } from "../audit/audit.js";

export interface AuthUser extends PermissionSubject {
  readonly id: string;
  readonly email: string;
}

declare module "fastify" {
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
  interface FastifyInstance {
    audit: AuditWriter;
  }
}

export function registerRbac(app: FastifyInstance, audit: AuditWriter): void {
  app.decorate("audit", audit);
  app.decorateRequest("authUser", null);
}

export function requirePermission(module: ModuleId, level: PermissionLevel): preHandlerAsyncHookHandler {
  return async function (this: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
    const user = request.authUser;
    if (!user) {
      await reply.code(401).send({ error: "No autenticado" });
      return;
    }
    if (!can(user, module, level)) {
      await request.server.audit
        .record({
          actorType: "usuario",
          actorUserId: user.id,
          action: "acceso_denegado",
          module,
          target: `${request.method} ${request.routeOptions.url ?? request.url}`,
          outcome: "denegado",
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
          details: { nivelRequerido: level },
        })
        .catch((err: unknown) => request.log.error({ err }, "No se pudo registrar auditoría"));
      await reply.code(403).send({ error: "Sin permiso para este módulo" });
    }
  };
}
