/**
 * Guardia global de acceso. Toda ruta bajo /api DEBE declarar `config.acceso`;
 * si falta, core no arranca. Opciones:
 *
 *   { publico: true }                                     sin sesión (health, login)
 *   { autenticado: true, reauth?: "pin" | "fuerte" }      cualquier cuenta con sesión
 *   { modulo: "notas", nivel: "lectura", reauth?: ... }   permiso por módulo (RBAC)
 *
 * Sin sesión → 401. Sin permiso → 403 + auditoría "denegado".
 * Sin reautenticación vigente (5 min) → 403 con codigo "reauth_requerida".
 */
import {
  can,
  reauthSatisfies,
  type ModuleId,
  type PermissionLevel,
  type PermissionSubject,
  type ReauthMethod,
  type ReauthRequirement,
  type Role,
} from "@mi-setup/shared";
import type { FastifyInstance } from "fastify";
import type { AuditWriter } from "../audit/audit.js";

export interface AuthUser extends PermissionSubject {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: Role;
  readonly sessionId: string;
  readonly reauthAt: Date | null;
  readonly reauthMethod: ReauthMethod | null;
}

export type Acceso =
  | { readonly publico: true }
  | { readonly autenticado: true; readonly reauth?: ReauthRequirement }
  | {
      readonly modulo: ModuleId;
      readonly nivel: Exclude<PermissionLevel, "ninguno">;
      readonly reauth?: ReauthRequirement;
    };

declare module "fastify" {
  interface FastifyContextConfig {
    acceso?: Acceso;
  }
  interface FastifyRequest {
    authUser: AuthUser | null;
  }
  interface FastifyInstance {
    audit: AuditWriter;
  }
}

export interface GuardDeps {
  readonly audit: AuditWriter;
  readonly authenticate: (accessToken: string) => Promise<AuthUser | null>;
  readonly now: () => Date;
}

function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

export function registerAccessGuard(app: FastifyInstance, deps: GuardDeps): void {
  app.decorate("audit", deps.audit);
  app.decorateRequest("authUser", null);

  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/api")) return;
    const config = route.config as { acceso?: Acceso } | undefined;
    if (!config?.acceso) {
      throw new Error(`La ruta ${String(route.method)} ${route.url} no declara config.acceso`);
    }
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.is404) return;
    const acceso = request.routeOptions.config.acceso;
    if (!acceso || "publico" in acceso) return;

    const token = bearer(request.headers.authorization);
    const user = token ? await deps.authenticate(token) : null;
    request.authUser = user;
    if (!user) {
      return reply.code(401).send({ error: "No autenticado", codigo: "no_autenticado" });
    }

    if ("modulo" in acceso && !can(user, acceso.modulo, acceso.nivel)) {
      await deps.audit
        .record({
          actorType: "usuario",
          actorUserId: user.id,
          action: "acceso_denegado",
          module: acceso.modulo,
          target: `${request.method} ${request.routeOptions.url ?? request.url}`,
          outcome: "denegado",
          ip: request.ip,
          userAgent: request.headers["user-agent"] ?? null,
          details: { nivelRequerido: acceso.nivel },
        })
        .catch((err: unknown) => request.log.error({ err }, "No se pudo registrar auditoría"));
      return reply.code(403).send({ error: "Sin permiso para este módulo", codigo: "sin_permiso" });
    }

    if (acceso.reauth && !reauthSatisfies(user, acceso.reauth, deps.now())) {
      return reply.code(403).send({
        error:
          "Confirma tu identidad con tu PIN, tu huella o tu contraseña",
        codigo: "reauth_requerida",
        metodo: acceso.reauth,
      });
    }
  });
}

/** Usuario autenticado de la petición; solo para rutas no públicas. */
export function currentUser(request: { authUser: AuthUser | null }): AuthUser {
  if (!request.authUser) throw new Error("Ruta sin autenticación: revisa config.acceso");
  return request.authUser;
}
