import {
  loginRequestSchema,
  reauthRequestSchema,
  refreshRequestSchema,
  setPinRequestSchema,
} from "@mi-setup/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthService, ClientInfo } from "../auth/service.js";
import { currentUser } from "../security/rbac.js";

function clientInfo(request: FastifyRequest): ClientInfo {
  return { ip: request.ip ?? null, userAgent: request.headers["user-agent"] ?? null };
}

export function authRoutes(auth: AuthService) {
  return async function (app: FastifyInstance): Promise<void> {
    app.post("/api/auth/login", { config: { acceso: { publico: true } } }, async (request) =>
      auth.login(loginRequestSchema.parse(request.body), clientInfo(request)),
    );

    app.post("/api/auth/refresh", { config: { acceso: { publico: true } } }, async (request) =>
      auth.refresh(refreshRequestSchema.parse(request.body).refreshToken, clientInfo(request)),
    );

    app.post("/api/auth/logout", { config: { acceso: { autenticado: true } } }, async (request) => {
      await auth.logout(currentUser(request), clientInfo(request));
      return { ok: true };
    });

    app.get("/api/auth/me", { config: { acceso: { autenticado: true } } }, async (request) =>
      auth.describe(currentUser(request)),
    );

    app.post("/api/auth/reauth", { config: { acceso: { autenticado: true } } }, async (request) =>
      auth.reauth(currentUser(request), reauthRequestSchema.parse(request.body), clientInfo(request)),
    );

    // Activar la huella exige haber confirmado con contraseña en los últimos 5 min.
    app.post("/api/auth/biometria", { config: { acceso: { autenticado: true, reauth: "fuerte" } } }, async (request) => {
      const { dispositivo } = z.object({ dispositivo: z.string().trim().min(1).max(60) }).parse(request.body);
      return auth.crearLlaveBiometrica(currentUser(request), dispositivo, clientInfo(request));
    });

    app.delete("/api/auth/biometria/:id", { config: { acceso: { autenticado: true } } }, async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      await auth.revocarLlaveBiometrica(currentUser(request), id);
      return { ok: true };
    });

    // Configurar o cambiar el PIN exige haber confirmado con contraseña o huella.
    app.put("/api/auth/pin", { config: { acceso: { autenticado: true, reauth: "fuerte" } } }, async (request) => {
      await auth.setPin(currentUser(request), setPinRequestSchema.parse(request.body).pin, clientInfo(request));
      return { ok: true };
    });
  };
}
