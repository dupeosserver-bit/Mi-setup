/** Utilidades compartidas por los módulos de la API. */
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuditWriter } from "../audit/audit.js";
import type { AuthService, ClientInfo } from "../auth/service.js";
import type { Config } from "../config.js";
import type { Database } from "../db/client.js";
import { missingConfig } from "../http-error.js";
import type { Notifier } from "../notify/notifier.js";
import type { Hub } from "../realtime/hub.js";
import type { ServerCipher } from "../security/crypto.js";

export interface ModuleDeps {
  readonly db: Database;
  readonly audit: AuditWriter;
  readonly notifier: Notifier;
  readonly hub: Hub;
  readonly auth: AuthService;
  readonly config: Config;
  readonly cipher: ServerCipher | null;
  readonly now: () => Date;
}

export function clientInfo(request: FastifyRequest): ClientInfo {
  return { ip: request.ip ?? null, userAgent: request.headers["user-agent"] ?? null };
}

export function requireCipher(deps: Pick<ModuleDeps, "cipher">): ServerCipher {
  if (!deps.cipher) throw missingConfig("SERVER_ENC_KEY");
  return deps.cipher;
}

export const idParams = z.object({ id: z.string().uuid("Identificador inválido") });

/** Aviso de sincronización a todos los dispositivos del usuario. */
export function sync(deps: Pick<ModuleDeps, "hub">, userId: string, recurso: string): void {
  deps.hub.publicar(`usuario:${userId}`, { recurso });
}

/** Paginación simple con límite máximo. */
export const paginaQuery = z.object({
  limite: z.coerce.number().int().min(1).max(200).default(50),
  antesDe: z.coerce.date().optional(),
});
