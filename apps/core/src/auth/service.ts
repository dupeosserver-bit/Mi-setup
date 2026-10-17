/**
 * Servicio de autenticación: inicio de sesión (contraseña + TOTP), bloqueo
 * temporal, sesiones con refresh rotativo, reautenticación y PIN.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import {
  levelRank,
  isModuleId,
  MODULE_IDS,
  effectiveLevel,
  REAUTH_WINDOW_MS,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
  type ModuleId,
  type PermissionLevel,
  type PermissionMap,
  type PublicUser,
  type ReauthMethod,
  type ReauthRequest,
} from "@mi-setup/shared";
import { and, count, eq, gt, isNull, lt, min, or, sql } from "drizzle-orm";
import type { AuditWriter } from "../audit/audit.js";
import type { Database } from "../db/client.js";
import { biometricKeys, loginAttempts, sessions, userModulePermissions, users, type UserRow } from "../db/schema.js";
import { HttpError, missingConfig } from "../http-error.js";
import type { Notifier } from "../notify/notifier.js";
import type { ServerCipher } from "../security/crypto.js";
import type { AuthUser } from "../security/rbac.js";
import { permisosDeRoles } from "../modules/roles.js";
import { dummyHash, hashSecret, verifySecret } from "./password.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  formatRefreshToken,
  hashToken,
  newRefreshSecret,
  parseRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  type TokenSigner,
} from "./tokens.js";
import { verifyTotp } from "./totp.js";

export const LOCKOUT = {
  ventanaMs: 15 * 60 * 1000,
  maxFallosPorCorreo: 5,
  maxFallosPorIp: 20,
} as const;

/** Fallos de reautenticación seguidos antes de cerrar la sesión. */
export const MAX_REAUTH_FAILURES = 5;

const RETENCION_MS = 30 * 24 * 60 * 60 * 1000;

export interface ClientInfo {
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface AuthDeps {
  readonly db: Database;
  readonly audit: AuditWriter;
  readonly notifier: Notifier;
  readonly signer: TokenSigner | null;
  readonly cipher: ServerCipher | null;
  readonly now: () => Date;
}

const CREDENCIALES_INVALIDAS = "Correo, contraseña o código incorrectos";

function publicUser(user: Pick<UserRow, "id" | "email" | "displayName" | "role">): PublicUser {
  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}

function iguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Recorta texto que viene del cliente antes de ponerlo en un aviso. */
function corto(value: string | null | undefined, max = 100): string {
  if (!value) return "desconocido";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export class AuthService {
  constructor(private readonly deps: AuthDeps) {}

  private signer(): TokenSigner {
    if (!this.deps.signer) throw missingConfig("JWT_SECRET");
    return this.deps.signer;
  }

  private cipher(): ServerCipher {
    if (!this.deps.cipher) throw missingConfig("SERVER_ENC_KEY");
    return this.deps.cipher;
  }

  // ---------------------------------------------------------------- login

  async login(input: LoginRequest, client: ClientInfo): Promise<LoginResponse> {
    const signer = this.signer();
    const { db } = this.deps;
    const now = this.deps.now();
    const email = input.email;

    await this.checkLockout(email, client, now, input.dispositivo);

    const [user] = await db
      .select()
      .from(users)
      .where(eq(sql`lower(${users.email})`, email))
      .limit(1);
    const passwordOk = await verifySecret(user?.passwordHash ?? (await dummyHash()), input.password);

    if (!user) return this.failLogin(email, client, input.dispositivo, "correo_desconocido", null);
    if (!passwordOk) return this.failLogin(email, client, input.dispositivo, "contraseña_incorrecta", user.id);
    if (!user.isActive) return this.failLogin(email, client, input.dispositivo, "cuenta_desactivada", user.id);

    if (user.role === "maestra" && !user.totpSecretEnc) {
      return this.failLogin(email, client, input.dispositivo, "maestra_sin_2fa", user.id);
    }
    if (user.totpSecretEnc) {
      const secret = this.cipher().decrypt(user.totpSecretEnc);
      const step = input.totp ? verifyTotp(secret, input.totp, now, user.totpLastStep) : null;
      if (step === null) return this.failLogin(email, client, input.dispositivo, "codigo_2fa", user.id);
      // Anti-repetición atómica: solo un inicio de sesión puede consumir este paso.
      const consumido = await db
        .update(users)
        .set({ totpLastStep: step })
        .where(and(eq(users.id, user.id), or(isNull(users.totpLastStep), lt(users.totpLastStep, step))))
        .returning({ id: users.id });
      if (consumido.length === 0) {
        return this.failLogin(email, client, input.dispositivo, "codigo_2fa_reutilizado", user.id);
      }
    }

    await db.insert(loginAttempts).values({ email, ip: client.ip, success: true, createdAt: now });

    const sessionId = randomUUID();
    const secret = newRefreshSecret();
    await db.insert(sessions).values({
      id: sessionId,
      userId: user.id,
      refreshHash: hashToken(secret),
      deviceName: input.dispositivo ?? null,
      ip: client.ip,
      userAgent: client.userAgent?.slice(0, 512) ?? null,
      createdAt: now,
      lastUsedAt: now,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
      // Contraseña + 2FA recién verificados cuentan como reautenticación fuerte.
      reauthAt: now,
      reauthMethod: "password",
    });

    await this.deps.audit.record({
      actorType: "usuario",
      actorUserId: user.id,
      action: "login",
      outcome: "ok",
      ip: client.ip,
      userAgent: client.userAgent,
      details: { sesion: sessionId, dispositivo: input.dispositivo ?? null },
    });

    return {
      accessToken: await signer.sign({ userId: user.id, sessionId }, now),
      refreshToken: formatRefreshToken(sessionId, secret),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      usuario: publicUser(user),
    };
  }

  private async checkLockout(email: string, client: ClientInfo, now: Date, dispositivo?: string): Promise<void> {
    const { db } = this.deps;
    const desde = new Date(now.getTime() - LOCKOUT.ventanaMs);

    const contar = async (filtro: ReturnType<typeof eq>) => {
      const [fila] = await db
        .select({ n: count(), primero: min(loginAttempts.createdAt) })
        .from(loginAttempts)
        .where(and(filtro, eq(loginAttempts.success, false), gt(loginAttempts.createdAt, desde)));
      return { n: fila?.n ?? 0, primero: fila?.primero ? new Date(fila.primero) : null };
    };

    const porCorreo = await contar(eq(loginAttempts.email, email));
    const porIp = client.ip ? await contar(eq(loginAttempts.ip, client.ip)) : { n: 0, primero: null };
    const bloqueo =
      porCorreo.n >= LOCKOUT.maxFallosPorCorreo ? porCorreo : porIp.n >= LOCKOUT.maxFallosPorIp ? porIp : null;
    if (!bloqueo) return;

    const liberaEn = (bloqueo.primero?.getTime() ?? now.getTime()) + LOCKOUT.ventanaMs;
    const segundos = Math.max(1, Math.ceil((liberaEn - now.getTime()) / 1000));

    await this.deps.audit.record({
      actorType: "usuario",
      action: "login_bloqueado",
      outcome: "denegado",
      ip: client.ip,
      userAgent: client.userAgent,
      details: { correo: email, dispositivo: dispositivo ?? null },
    });
    await this.deps.notifier.send({
      title: "Mi Setup: inicio de sesión bloqueado",
      message: `Intento bloqueado por demasiados fallos.\nCorreo: ${corto(email)}\nIP: ${corto(client.ip)}\nDispositivo: ${corto(dispositivo ?? client.userAgent)}`,
      priority: 4,
      tags: ["lock"],
    });
    throw new HttpError(
      429,
      `Demasiados intentos. Intenta de nuevo en ${Math.ceil(segundos / 60)} min.`,
      "bloqueo_temporal",
      { reintentarEnSegundos: segundos },
    );
  }

  private async failLogin(
    email: string,
    client: ClientInfo,
    dispositivo: string | undefined,
    motivo: string,
    userId: string | null,
  ): Promise<never> {
    const now = this.deps.now();
    await this.deps.db.insert(loginAttempts).values({ email, ip: client.ip, success: false, createdAt: now });
    await this.deps.audit.record({
      actorType: "usuario",
      actorUserId: userId,
      action: "login_fallido",
      outcome: "denegado",
      ip: client.ip,
      userAgent: client.userAgent,
      details: { motivo, correo: email, dispositivo: dispositivo ?? null },
    });
    await this.deps.notifier.send({
      title: "Mi Setup: intento fallido de inicio de sesión",
      message: `Correo: ${corto(email)}\nIP: ${corto(client.ip)}\nDispositivo: ${corto(dispositivo ?? client.userAgent)}`,
      priority: 4,
      tags: ["warning"],
    });
    throw new HttpError(401, CREDENCIALES_INVALIDAS, "credenciales_invalidas");
  }

  // ---------------------------------------------------------------- refresh

  async refresh(refreshToken: string, client: ClientInfo): Promise<LoginResponse> {
    const signer = this.signer();
    const { db } = this.deps;
    const now = this.deps.now();
    const invalida = new HttpError(401, "La sesión expiró, inicia sesión de nuevo", "sesion_invalida");

    const parsed = parseRefreshToken(refreshToken);
    if (!parsed) throw invalida;

    const [fila] = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(eq(sessions.id, parsed.sessionId))
      .limit(1);
    if (!fila || fila.session.revokedAt || fila.session.expiresAt <= now) throw invalida;
    const { session, user } = fila;

    const presented = hashToken(parsed.secret);
    if (session.prevRefreshHash && presented === session.prevRefreshHash) {
      await this.revokeSession(session.id, now);
      await this.deps.audit.record({
        actorType: "usuario",
        actorUserId: user.id,
        action: "refresh_reutilizado",
        outcome: "denegado",
        ip: client.ip,
        userAgent: client.userAgent,
        details: { sesion: session.id },
      });
      await this.deps.notifier.send({
        title: "Mi Setup: posible robo de sesión",
        message: `Se reutilizó un token antiguo y se cerró la sesión "${corto(session.deviceName)}".\nIP: ${corto(client.ip)}`,
        priority: 5,
        tags: ["rotating_light"],
      });
      throw invalida;
    }

    if (!user.isActive) {
      await this.revokeSession(session.id, now);
      throw invalida;
    }

    const secret = newRefreshSecret();
    const rotada = await db
      .update(sessions)
      .set({
        refreshHash: hashToken(secret),
        prevRefreshHash: presented,
        lastUsedAt: now,
        ip: client.ip,
        userAgent: client.userAgent?.slice(0, 512) ?? null,
      })
      .where(and(eq(sessions.id, session.id), eq(sessions.refreshHash, presented), isNull(sessions.revokedAt)))
      .returning({ id: sessions.id });
    if (rotada.length === 0) throw invalida;

    return {
      accessToken: await signer.sign({ userId: user.id, sessionId: session.id }, now),
      refreshToken: formatRefreshToken(session.id, secret),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      usuario: publicUser(user),
    };
  }

  private async revokeSession(sessionId: string, now: Date): Promise<void> {
    await this.deps.db.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, sessionId));
  }

  async logout(user: AuthUser, client: ClientInfo): Promise<void> {
    await this.revokeSession(user.sessionId, this.deps.now());
    await this.deps.audit.record({
      actorType: "usuario",
      actorUserId: user.id,
      action: "logout",
      outcome: "ok",
      ip: client.ip,
      userAgent: client.userAgent,
      details: { sesion: user.sessionId },
    });
  }

  // ---------------------------------------------------------------- sesión actual

  /** Valida un accessToken y carga usuario, sesión y permisos. null si no es válido. */
  async authenticate(accessToken: string): Promise<AuthUser | null> {
    if (!this.deps.signer) return null;
    const { db } = this.deps;
    const now = this.deps.now();
    const claims = await this.deps.signer.verify(accessToken, now);
    if (!claims) return null;

    const [fila] = await db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, claims.sessionId), eq(users.id, claims.userId)))
      .limit(1);
    if (!fila) return null;
    const { session, user } = fila;
    if (session.revokedAt || session.expiresAt <= now || !user.isActive) return null;

    let permissions: PermissionMap = {};
    if (user.role !== "maestra") {
      // Permisos propios + los de sus roles (gana el nivel más alto).
      permissions = (await permisosDeRoles(db, user.id)).permisos;
      const filas = await db.select().from(userModulePermissions).where(eq(userModulePermissions.userId, user.id));
      for (const p of filas) {
        if (!isModuleId(p.module)) continue;
        const actual = permissions[p.module];
        if (!actual || levelRank(p.level) > levelRank(actual)) permissions[p.module] = p.level;
      }
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      permissions,
      sessionId: session.id,
      reauthAt: session.reauthAt,
      reauthMethod: session.reauthMethod,
    };
  }

  async describe(user: AuthUser): Promise<MeResponse> {
    const [fila] = await this.deps.db
      .select({ pinHash: users.pinHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    const permisos = Object.fromEntries(MODULE_IDS.map((m) => [m, effectiveLevel(user, m)])) as Record<
      ModuleId,
      PermissionLevel
    >;
    const hasta = user.reauthAt ? new Date(user.reauthAt.getTime() + REAUTH_WINDOW_MS) : null;
    const vigente = hasta !== null && hasta > this.deps.now();
    return {
      usuario: publicUser(user),
      permisos,
      roles: (await permisosDeRoles(this.deps.db, user.id)).roles,
      tienePin: Boolean(fila?.pinHash),
      reauth: { metodo: vigente ? user.reauthMethod : null, hasta: vigente ? hasta.toISOString() : null },
    };
  }

  // ---------------------------------------------------------------- reautenticación

  async reauth(
    user: AuthUser,
    input: ReauthRequest,
    client: ClientInfo,
  ): Promise<{ metodo: ReauthMethod; hasta: string }> {
    const { db } = this.deps;
    const now = this.deps.now();
    const [fila] = await db
      .select({ passwordHash: users.passwordHash, pinHash: users.pinHash })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    let ok = false;
    if (input.metodo === "password") {
      ok = await verifySecret(fila?.passwordHash ?? (await dummyHash()), input.password);
    } else if (input.metodo === "pin") {
      ok = fila?.pinHash ? await verifySecret(fila.pinHash, input.pin) : false;
    } else {
      const [llave] = await db
        .select({ hash: biometricKeys.secretHash })
        .from(biometricKeys)
        .where(and(eq(biometricKeys.id, input.llaveId), eq(biometricKeys.userId, user.id), isNull(biometricKeys.revokedAt)))
        .limit(1);
      ok = Boolean(llave && iguales(llave.hash, hashToken(input.secreto)));
      if (ok) await db.update(biometricKeys).set({ lastUsedAt: now }).where(eq(biometricKeys.id, input.llaveId));
    }

    if (ok) {
      await db
        .update(sessions)
        .set({ reauthAt: now, reauthMethod: input.metodo, reauthFailures: 0 })
        .where(eq(sessions.id, user.sessionId));
      await this.deps.audit.record({
        actorType: "usuario",
        actorUserId: user.id,
        action: "reautenticacion",
        outcome: "ok",
        ip: client.ip,
        userAgent: client.userAgent,
        details: { metodo: input.metodo },
      });
      return { metodo: input.metodo, hasta: new Date(now.getTime() + REAUTH_WINDOW_MS).toISOString() };
    }

    const [actualizada] = await db
      .update(sessions)
      .set({ reauthFailures: sql`${sessions.reauthFailures} + 1` })
      .where(eq(sessions.id, user.sessionId))
      .returning({ fallos: sessions.reauthFailures });
    const fallos = actualizada?.fallos ?? MAX_REAUTH_FAILURES;

    await this.deps.audit.record({
      actorType: "usuario",
      actorUserId: user.id,
      action: "reautenticacion_fallida",
      outcome: "denegado",
      ip: client.ip,
      userAgent: client.userAgent,
      details: { metodo: input.metodo, fallos },
    });

    if (fallos >= MAX_REAUTH_FAILURES) {
      await this.revokeSession(user.sessionId, now);
      await this.deps.notifier.send({
        title: "Mi Setup: sesión cerrada",
        message: `Demasiados fallos de reautenticación (${input.metodo}). Se cerró la sesión.\nIP: ${corto(client.ip)}`,
        priority: 4,
        tags: ["lock"],
      });
      throw new HttpError(401, "Demasiados intentos. La sesión se cerró.", "sesion_revocada");
    }
    throw new HttpError(
      401,
      input.metodo === "pin" && !fila?.pinHash ? "No tienes un PIN configurado" : "Reautenticación incorrecta",
      "reauth_fallida",
      { intentosRestantes: MAX_REAUTH_FAILURES - fallos },
    );
  }

  /** Activa la huella en un celular: devuelve una llave que solo ve ese celular. */
  async crearLlaveBiometrica(
    user: AuthUser,
    dispositivo: string,
    client: ClientInfo,
  ): Promise<{ id: string; secreto: string }> {
    const secreto = newRefreshSecret();
    const [llave] = await this.deps.db
      .insert(biometricKeys)
      .values({ userId: user.id, deviceName: dispositivo, secretHash: hashToken(secreto) })
      .returning({ id: biometricKeys.id });
    if (!llave) throw new HttpError(500, "No se pudo activar la huella");
    await this.deps.audit.record({
      actorType: "usuario",
      actorUserId: user.id,
      action: "biometria_activada",
      outcome: "ok",
      ip: client.ip,
      userAgent: client.userAgent,
      details: { dispositivo },
    });
    return { id: llave.id, secreto };
  }

  async revocarLlaveBiometrica(user: AuthUser, id: string): Promise<void> {
    await this.deps.db
      .update(biometricKeys)
      .set({ revokedAt: this.deps.now() })
      .where(and(eq(biometricKeys.id, id), eq(biometricKeys.userId, user.id)));
  }

  async setPin(user: AuthUser, pin: string, client: ClientInfo): Promise<void> {
    await this.deps.db
      .update(users)
      .set({ pinHash: await hashSecret(pin), updatedAt: this.deps.now() })
      .where(eq(users.id, user.id));
    await this.deps.audit.record({
      actorType: "usuario",
      actorUserId: user.id,
      action: "pin_configurado",
      outcome: "ok",
      ip: client.ip,
      userAgent: client.userAgent,
    });
  }

  /** Borra intentos de login viejos y sesiones vencidas o revocadas hace más de 30 días. */
  async purge(): Promise<void> {
    const limite = new Date(this.deps.now().getTime() - RETENCION_MS);
    await this.deps.db.delete(loginAttempts).where(lt(loginAttempts.createdAt, limite));
    await this.deps.db
      .delete(sessions)
      .where(or(lt(sessions.expiresAt, limite), lt(sessions.revokedAt, limite)));
  }
}
