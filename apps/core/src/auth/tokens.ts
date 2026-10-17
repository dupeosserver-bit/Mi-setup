/**
 * Tokens de sesión.
 * - accessToken: JWT HS256 firmado con JWT_SECRET, vida corta (15 min).
 * - refreshToken: "<idSesión>.<secreto aleatorio>"; en la base solo se guarda
 *   el SHA-256 del secreto. Se rota en cada uso.
 */
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const ISSUER = "mi-setup";
const AUDIENCE = "mi-setup";

export interface AccessClaims {
  readonly userId: string;
  readonly sessionId: string;
}

export interface TokenSigner {
  sign(claims: AccessClaims, now: Date): Promise<string>;
  verify(token: string, now: Date): Promise<AccessClaims | null>;
}

export function createTokenSigner(secret: string): TokenSigner {
  const key = new TextEncoder().encode(secret);
  return {
    async sign({ userId, sessionId }, now) {
      const iat = Math.floor(now.getTime() / 1000);
      return new SignJWT({ sid: sessionId })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt(iat)
        .setExpirationTime(iat + ACCESS_TOKEN_TTL_SECONDS)
        .sign(key);
    },
    async verify(token, now) {
      try {
        const { payload } = await jwtVerify(token, key, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ["HS256"],
          currentDate: now,
        });
        if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
        return { userId: payload.sub, sessionId: payload.sid };
      } catch {
        return null;
      }
    },
  };
}

export function newRefreshSecret(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

export function parseRefreshToken(token: string): { sessionId: string; secret: string } | null {
  const dot = token.indexOf(".");
  if (dot === -1) return null;
  const sessionId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!UUID.test(sessionId) || secret.length < 20) return null;
  return { sessionId, secret };
}
