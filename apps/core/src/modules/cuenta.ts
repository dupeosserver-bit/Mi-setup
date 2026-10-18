/**
 * Tu cuenta: preferencias sincronizadas (tema, fuente, zoom, terminal, voz,
 * modelo de IA), nombre visible y cambio de contraseña.
 */
import { passwordSchema, preferenciasSchema, type Preferencias } from "@mi-setup/shared";
import { and, eq, isNull, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashSecret, verifySecret } from "../auth/password.js";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../auth/totp.js";
import { sessions, users } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, requireCipher, type ModuleDeps } from "./common.js";
import { deleteSetting, getSetting, setSetting } from "./settings.js";

const clavePrefs = (userId: string) => `prefs:${userId}`;

/** Preferencias guardadas (completadas con los valores por defecto). */
export async function leerPreferencias(deps: ModuleDeps, userId: string): Promise<Preferencias> {
  const guardadas = await getSetting<unknown>(deps.db, clavePrefs(userId));
  const r = preferenciasSchema.safeParse(guardadas ?? {});
  return r.success ? r.data : preferenciasSchema.parse({});
}

export function cuentaRoutes(deps: ModuleDeps) {
  const { db } = deps;
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/preferencias", { config: { acceso: { autenticado: true } } }, async (request) => leerPreferencias(deps, currentUser(request).id));

    app.put("/api/preferencias", { config: { acceso: { autenticado: true } } }, async (request) => {
      const user = currentUser(request);
      const prefs = preferenciasSchema.parse(request.body);
      await setSetting(db, clavePrefs(user.id), prefs, deps.now());
      deps.hub.publicar(`usuario:${user.id}`, { recurso: "preferencias" });
      return prefs;
    });

    app.patch("/api/cuenta/perfil", { config: { acceso: { autenticado: true } } }, async (request) => {
      const user = currentUser(request);
      const { nombre } = z.object({ nombre: z.string().trim().min(1, "Escribe tu nombre").max(80) }).parse(request.body);
      await db.update(users).set({ displayName: nombre, updatedAt: deps.now() }).where(eq(users.id, user.id));
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "perfil_actualizado", outcome: "ok", ...clientInfo(request), details: { nombre } });
      deps.hub.publicar(`usuario:${user.id}`, { recurso: "me" });
      return { ok: true };
    });

    /** Cambiar tu propia contraseña: pide la actual y cierra las demás sesiones. */
    app.post("/api/cuenta/contrasena", { config: { acceso: { autenticado: true, reauth: "fuerte" } } }, async (request) => {
      const user = currentUser(request);
      const { actual, nueva } = z.object({ actual: z.string().min(1).max(256), nueva: passwordSchema }).parse(request.body);
      const [fila] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id));
      if (!fila || !(await verifySecret(fila.hash, actual))) {
        await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "contrasena_cambiada", outcome: "denegado", ...clientInfo(request) });
        throw new HttpError(400, "La contraseña actual no es correcta");
      }
      if (actual === nueva) throw new HttpError(400, "La nueva contraseña debe ser distinta");
      await db.update(users).set({ passwordHash: await hashSecret(nueva), updatedAt: deps.now() }).where(eq(users.id, user.id));
      await db
        .update(sessions)
        .set({ revokedAt: deps.now() })
        .where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId), isNull(sessions.revokedAt)));
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "contrasena_cambiada", outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });

    // -------- código 2FA para cualquier cuenta (la maestra ya lo trae desde su creación)
    const clavePendiente = (id: string) => `2fa-pendiente:${id}`;

    app.get("/api/cuenta/2fa", { config: { acceso: { autenticado: true } } }, async (request) => {
      const [fila] = await db.select({ t: users.totpSecretEnc }).from(users).where(eq(users.id, currentUser(request).id));
      return { activo: Boolean(fila?.t) };
    });

    /** Paso 1: secreto nuevo (pendiente 10 min) para agregarlo a la app autenticadora. */
    app.post("/api/cuenta/2fa/iniciar", { config: { acceso: { autenticado: true, reauth: "fuerte" } } }, async (request) => {
      const user = currentUser(request);
      const secreto = generateTotpSecret();
      await setSetting(db, clavePendiente(user.id), { cifrado: requireCipher(deps).encrypt(secreto), vence: deps.now().getTime() + 10 * 60_000 }, deps.now());
      return { secreto, uri: otpauthUri({ secret: secreto, account: user.email, issuer: "Mi Setup" }) };
    });

    /** Paso 2: confirmar con un código de la app; desde ahí el inicio de sesión lo pide. */
    app.post("/api/cuenta/2fa/confirmar", { config: { acceso: { autenticado: true, reauth: "fuerte" } } }, async (request) => {
      const user = currentUser(request);
      const { codigo } = z.object({ codigo: z.string().trim().regex(/^\d{6}$/, "Escribe los 6 dígitos") }).parse(request.body);
      const pendiente = await getSetting<{ cifrado: string; vence: number }>(db, clavePendiente(user.id));
      if (!pendiente || pendiente.vence < deps.now().getTime()) throw new HttpError(400, "Se venció: vuelve a empezar");
      const secreto = requireCipher(deps).decrypt(pendiente.cifrado);
      const paso = verifyTotp(secreto, codigo, deps.now(), null);
      if (paso === null) throw new HttpError(400, "Ese código no coincide. Revisa la hora del celular y vuelve a intentar.");
      await db.update(users).set({ totpSecretEnc: requireCipher(deps).encrypt(secreto), totpLastStep: paso, updatedAt: deps.now() }).where(eq(users.id, user.id));
      await deleteSetting(db, clavePendiente(user.id));
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "2fa_activado", outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });

    app.delete("/api/cuenta/2fa", { config: { acceso: { autenticado: true, reauth: "fuerte" } } }, async (request) => {
      const user = currentUser(request);
      if (user.role === "maestra") throw new HttpError(400, "La cuenta maestra siempre necesita el código 2FA");
      await db.update(users).set({ totpSecretEnc: null, totpLastStep: null, updatedAt: deps.now() }).where(eq(users.id, user.id));
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "2fa_desactivado", outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });
  };
}
