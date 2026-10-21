/**
 * OAuth 2.0 (código de autorización) para Twitch, YouTube, Kick y X. El
 * intercambio ocurre en el servidor; los tokens se guardan cifrados y nunca
 * llegan a los clientes. El `state` es de un solo uso (10 min) y Kick/X usan
 * PKCE.
 */
import { createHash, randomBytes } from "node:crypto";
import { can, type ModuleId } from "@mi-setup/shared";
import { and, eq, gt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Env } from "../../config.js";
import { oauthStates, socialAccounts } from "../../db/schema.js";
import { HttpError, missingConfig } from "../../http-error.js";
import { currentUser } from "../../security/rbac.js";
import { requireCipher, type ModuleDeps } from "../common.js";
import { pagina, pedirJson } from "../http-json.js";

export { pagina, pedirJson };

export const PLATAFORMAS = ["twitch", "youtube", "kick", "x", "tiktok"] as const;
export type PlataformaId = (typeof PLATAFORMAS)[number];

interface Plataforma {
  readonly nombre: string;
  readonly modulo: ModuleId;
  readonly idVar: keyof Env & string;
  readonly secretoVar: keyof Env & string;
  readonly authUrl: string;
  readonly tokenUrl: string;
  readonly scopes: readonly string[];
  readonly pkce: boolean;
  /** X usa autenticación básica (client_id:secret) en el intercambio. */
  readonly basica?: boolean;
  readonly extraAuth?: Record<string, string>;
  /** TikTok llama client_key a lo que los demás llaman client_id. */
  readonly paramId?: string;
  /** TikTok separa los permisos con comas. */
  readonly separadorScopes?: string;
  perfil(token: string, clientId: string): Promise<{ id: string; nombre: string }>;
}

interface RespuestaTikTok {
  data?: { user?: { open_id?: string; display_name?: string } };
}

export const PLATAFORMA: Record<PlataformaId, Plataforma> = {
  tiktok: {
    nombre: "TikTok",
    modulo: "streams",
    idVar: "TIKTOK_CLIENT_KEY",
    secretoVar: "TIKTOK_CLIENT_SECRET",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.upload", "video.publish"],
    pkce: true,
    paramId: "client_key",
    separadorScopes: ",",
    async perfil(token) {
      const r = await pedirJson<RespuestaTikTok>("TikTok", "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name", { headers: { authorization: `Bearer ${token}` } });
      const u = r.data?.user;
      if (!u?.open_id) throw new HttpError(502, "TikTok no devolvió el usuario");
      return { id: u.open_id, nombre: u.display_name ?? "TikTok" };
    },
  },
  twitch: {
    nombre: "Twitch",
    modulo: "streams",
    idVar: "TWITCH_CLIENT_ID",
    secretoVar: "TWITCH_CLIENT_SECRET",
    authUrl: "https://id.twitch.tv/oauth2/authorize",
    tokenUrl: "https://id.twitch.tv/oauth2/token",
    scopes: ["channel:manage:broadcast", "clips:edit"],
    pkce: false,
    async perfil(token, clientId) {
      const r = await pedirJson<{ data: { id: string; display_name: string }[] }>("Twitch", "https://api.twitch.tv/helix/users", {
        headers: { authorization: `Bearer ${token}`, "client-id": clientId },
      });
      const u = r.data[0];
      if (!u) throw new HttpError(502, "Twitch no devolvió el usuario");
      return { id: u.id, nombre: u.display_name };
    },
  },
  youtube: {
    nombre: "YouTube",
    modulo: "streams",
    idVar: "GOOGLE_CLIENT_ID",
    secretoVar: "GOOGLE_CLIENT_SECRET",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: ["https://www.googleapis.com/auth/youtube"],
    pkce: false,
    extraAuth: { access_type: "offline", prompt: "consent" },
    async perfil(token) {
      const r = await pedirJson<{ items?: { id: string; snippet: { title: string } }[] }>(
        "YouTube",
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        { headers: { authorization: `Bearer ${token}` } },
      );
      const c = r.items?.[0];
      if (!c) throw new HttpError(502, "La cuenta de Google no tiene canal de YouTube");
      return { id: c.id, nombre: c.snippet.title };
    },
  },
  kick: {
    nombre: "Kick",
    modulo: "streams",
    idVar: "KICK_CLIENT_ID",
    secretoVar: "KICK_CLIENT_SECRET",
    authUrl: "https://id.kick.com/oauth/authorize",
    tokenUrl: "https://id.kick.com/oauth/token",
    scopes: ["user:read", "channel:read", "channel:write"],
    pkce: true,
    async perfil(token) {
      const r = await pedirJson<{ data: { user_id: number; name: string }[] }>("Kick", "https://api.kick.com/public/v1/users", {
        headers: { authorization: `Bearer ${token}` },
      });
      const u = r.data[0];
      if (!u) throw new HttpError(502, "Kick no devolvió el usuario");
      return { id: String(u.user_id), nombre: u.name };
    },
  },
  x: {
    nombre: "X",
    modulo: "x",
    idVar: "X_CLIENT_ID",
    secretoVar: "X_CLIENT_SECRET",
    authUrl: "https://x.com/i/oauth2/authorize",
    tokenUrl: "https://api.x.com/2/oauth2/token",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    pkce: true,
    basica: true,
    async perfil(token) {
      const r = await pedirJson<{ data: { id: string; username: string } }>("X", "https://api.x.com/2/users/me", {
        headers: { authorization: `Bearer ${token}` },
      });
      return { id: r.data.id, nombre: `@${r.data.username}` };
    },
  },
};

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const aleatorio = () => randomBytes(32).toString("base64url");

function credenciales(deps: ModuleDeps, p: PlataformaId) {
  const def = PLATAFORMA[p];
  const id = deps.config.env[def.idVar] as string | undefined;
  const secreto = deps.config.env[def.secretoVar] as string | undefined;
  if (!id) throw missingConfig(def.idVar);
  if (!secreto) throw missingConfig(def.secretoVar);
  return { id, secreto };
}

export function urlRetorno(deps: ModuleDeps, p: PlataformaId): string {
  const base = deps.config.isProduction ? `https://${deps.config.env.APP_HOST}` : `http://localhost:${deps.config.env.PORT}`;
  return `${base}/api/redes/oauth/${p}/callback`;
}

interface RespuestaToken {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string | string[];
}

async function pedirToken(deps: ModuleDeps, p: PlataformaId, cuerpo: Record<string, string>): Promise<RespuestaToken> {
  const def = PLATAFORMA[p];
  const { id, secreto } = credenciales(deps, p);
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  const form = new URLSearchParams({ ...cuerpo, [def.paramId ?? "client_id"]: id });
  if (def.basica) headers["authorization"] = `Basic ${Buffer.from(`${id}:${secreto}`).toString("base64")}`;
  else form.set("client_secret", secreto);
  return pedirJson<RespuestaToken>(def.nombre, def.tokenUrl, { method: "POST", headers, body: form.toString() });
}

async function guardarTokens(deps: ModuleDeps, p: PlataformaId, t: RespuestaToken, extra: { id: string; nombre: string; userId?: string }) {
  const cipher = requireCipher(deps);
  const valores = {
    externalId: extra.id,
    accountName: extra.nombre,
    accessTokenEnc: cipher.encrypt(t.access_token),
    ...(t.refresh_token ? { refreshTokenEnc: cipher.encrypt(t.refresh_token) } : {}),
    expiresAt: t.expires_in ? new Date(deps.now().getTime() + t.expires_in * 1000) : null,
    scopes: Array.isArray(t.scope) ? t.scope.join(" ") : (t.scope ?? ""),
    updatedAt: deps.now(),
  };
  await deps.db
    .insert(socialAccounts)
    .values({ platform: p, ...valores, connectedBy: extra.userId ?? null })
    .onConflictDoUpdate({ target: socialAccounts.platform, set: { ...valores, ...(extra.userId ? { connectedBy: extra.userId } : {}) } });
}

/** Token de acceso vigente (lo renueva si está por vencer). */
export async function tokenVigente(deps: ModuleDeps, p: PlataformaId): Promise<{ token: string; externalId: string; clientId: string }> {
  const [cuenta] = await deps.db.select().from(socialAccounts).where(eq(socialAccounts.platform, p));
  if (!cuenta) throw new HttpError(409, `Conecta tu cuenta de ${PLATAFORMA[p].nombre} primero`, "cuenta_no_conectada");
  const cipher = requireCipher(deps);
  const { id: clientId } = credenciales(deps, p);
  const porVencer = cuenta.expiresAt && cuenta.expiresAt.getTime() - deps.now().getTime() < 60_000;
  if (porVencer && cuenta.refreshTokenEnc) {
    const t = await pedirToken(deps, p, { grant_type: "refresh_token", refresh_token: cipher.decrypt(cuenta.refreshTokenEnc) });
    await guardarTokens(deps, p, t, { id: cuenta.externalId, nombre: cuenta.accountName });
    return { token: t.access_token, externalId: cuenta.externalId, clientId };
  }
  return { token: cipher.decrypt(cuenta.accessTokenEnc), externalId: cuenta.externalId, clientId };
}

const plataformaParams = z.object({ plataforma: z.enum(PLATAFORMAS) });

export function oauthRoutes(deps: ModuleDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/redes/cuentas", { config: { acceso: { autenticado: true } } }, async (request) => {
      const user = currentUser(request);
      const cuentas = await deps.db.select().from(socialAccounts);
      return PLATAFORMAS.filter((p) => can(user, PLATAFORMA[p].modulo, "lectura")).map((p) => {
        const c = cuentas.find((x) => x.platform === p);
        const def = PLATAFORMA[p];
        return {
          plataforma: p,
          nombre: def.nombre,
          configurada: Boolean(deps.config.env[def.idVar] && deps.config.env[def.secretoVar]),
          faltan: [def.idVar, def.secretoVar].filter((v) => !deps.config.env[v]),
          cuenta: c ? c.accountName : null,
          urlRetorno: urlRetorno(deps, p),
        };
      });
    });

    app.post("/api/redes/oauth/:plataforma/iniciar", { config: { acceso: { autenticado: true, reauth: "fuerte" } } }, async (request) => {
      const user = currentUser(request);
      const { plataforma } = plataformaParams.parse(request.params);
      const def = PLATAFORMA[plataforma];
      if (!can(user, def.modulo, "administrar")) throw new HttpError(403, "Sin permiso para conectar cuentas", "sin_permiso");
      const { id } = credenciales(deps, plataforma);
      const cipher = requireCipher(deps);
      const state = aleatorio();
      const verificador = def.pkce ? aleatorio() : null;
      await deps.db.insert(oauthStates).values({
        stateHash: sha256(state),
        platform: plataforma,
        userId: user.id,
        verifierEnc: verificador ? cipher.encrypt(verificador) : null,
        expiresAt: new Date(deps.now().getTime() + 10 * 60_000),
      });
      const url = new URL(def.authUrl);
      url.search = new URLSearchParams({
        response_type: "code",
        [def.paramId ?? "client_id"]: id,
        redirect_uri: urlRetorno(deps, plataforma),
        scope: def.scopes.join(def.separadorScopes ?? " "),
        state,
        ...(verificador ? { code_challenge: createHash("sha256").update(verificador).digest("base64url"), code_challenge_method: "S256" } : {}),
        ...def.extraAuth,
      }).toString();
      return { url: url.toString() };
    });

    // Público: lo abre el navegador al volver de la plataforma. Lo protege el state de un solo uso.
    app.get("/api/redes/oauth/:plataforma/callback", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { plataforma } = plataformaParams.parse(request.params);
      const q = z.object({ code: z.string().max(2000).optional(), state: z.string().max(200).optional(), error: z.string().max(200).optional() }).parse(request.query);
      const def = PLATAFORMA[plataforma];
      reply.type("text/html; charset=utf-8");
      if (q.error || !q.code || !q.state) return pagina("No se conectó la cuenta", `${def.nombre} canceló o rechazó el permiso.`);
      const [fila] = await deps.db
        .delete(oauthStates)
        .where(and(eq(oauthStates.stateHash, sha256(q.state)), eq(oauthStates.platform, plataforma), gt(oauthStates.expiresAt, deps.now())))
        .returning();
      if (!fila) {
        reply.code(400);
        return pagina("Enlace vencido", "Vuelve a tocar Conectar desde la app.");
      }
      try {
        const cipher = requireCipher(deps);
        const t = await pedirToken(deps, plataforma, {
          grant_type: "authorization_code",
          code: q.code,
          redirect_uri: urlRetorno(deps, plataforma),
          ...(fila.verifierEnc ? { code_verifier: cipher.decrypt(fila.verifierEnc) } : {}),
        });
        const perfil = await def.perfil(t.access_token, credenciales(deps, plataforma).id);
        await guardarTokens(deps, plataforma, t, { ...perfil, userId: fila.userId });
        await deps.audit.record({
          actorType: "usuario",
          actorUserId: fila.userId,
          action: "cuenta_conectada",
          module: def.modulo,
          target: `${def.nombre}: ${perfil.nombre}`,
          outcome: "ok",
        });
        deps.hub.publicar(`usuario:${fila.userId}`, { recurso: "redes" });
        return pagina(`${def.nombre} conectado`, `Cuenta ${perfil.nombre} conectada. Ya puedes cerrar esta ventana.`);
      } catch (err) {
        reply.code(502);
        return pagina("No se conectó la cuenta", err instanceof Error ? err.message : "Error desconocido");
      }
    });

    app.delete("/api/redes/cuentas/:plataforma", { config: { acceso: { autenticado: true, reauth: "fuerte" } } }, async (request) => {
      const user = currentUser(request);
      const { plataforma } = plataformaParams.parse(request.params);
      const def = PLATAFORMA[plataforma];
      if (!can(user, def.modulo, "administrar")) throw new HttpError(403, "Sin permiso", "sin_permiso");
      await deps.db.delete(socialAccounts).where(eq(socialAccounts.platform, plataforma));
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "cuenta_desconectada", module: def.modulo, target: def.nombre, outcome: "ok" });
      deps.hub.publicar(`usuario:${user.id}`, { recurso: "redes" });
      return { ok: true };
    });
  };
}
