import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { createDbAuditWriter, type AuditWriter } from "./audit/audit.js";
import { AuthService } from "./auth/service.js";
import { createTokenSigner } from "./auth/tokens.js";
import type { Config } from "./config.js";
import type { Database } from "./db/client.js";
import { HttpError } from "./http-error.js";
import { createNtfyNotifier, type Notifier } from "./notify/notifier.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { createServerCipher } from "./security/crypto.js";
import { registerAccessGuard } from "./security/rbac.js";
import { LOG_REDACT_PATHS } from "./security/redact.js";

export interface AppDeps {
  readonly config: Config;
  readonly db: Database;
  readonly audit?: AuditWriter;
  readonly notifier?: Notifier;
  /** Reloj inyectable (pruebas). */
  readonly now?: () => Date;
  /** false en pruebas para no ensuciar la salida. */
  readonly logger?: boolean;
}

export interface App {
  readonly app: FastifyInstance;
  readonly auth: AuthService;
}

export async function buildApp(deps: AppDeps): Promise<App> {
  const { config, db, logger = true } = deps;
  const now = deps.now ?? (() => new Date());

  const app = Fastify({
    logger: logger ? { level: config.env.LOG_LEVEL, redact: LOG_REDACT_PATHS } : false,
    // core solo es accesible a través de Caddy (red interna de Docker).
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  const audit = deps.audit ?? createDbAuditWriter(db);
  const notifier =
    deps.notifier ?? createNtfyNotifier({ url: config.ntfyUrl, topic: config.env.NTFY_TOPIC, log: app.log });
  const auth = new AuthService({
    db,
    audit,
    notifier,
    signer: config.env.JWT_SECRET ? createTokenSigner(config.env.JWT_SECRET) : null,
    cipher: config.env.SERVER_ENC_KEY ? createServerCipher(config.env.SERVER_ENC_KEY) : null,
    now,
  });

  await app.register(helmet, {
    hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  await app.register(cors, {
    origin: [...config.corsOrigins],
    credentials: true,
  });

  registerAccessGuard(app, { audit, authenticate: (token) => auth.authenticate(token), now });

  app.setErrorHandler<FastifyError | ZodError | HttpError>((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Datos inválidos", detalles: error.issues });
    }
    if (error instanceof HttpError) {
      const segundos = error.extra?.["reintentarEnSegundos"];
      if (typeof segundos === "number") void reply.header("retry-after", String(segundos));
      return reply.code(error.statusCode).send({ error: error.message, codigo: error.codigo, ...error.extra });
    }
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error({ err: error }, "Error interno");
      return reply.code(500).send({ error: "Error interno" });
    }
    return reply.code(status).send({ error: error.message });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: "No encontrado" }));

  await app.register(healthRoutes);
  await app.register(authRoutes(auth));

  return { app, auth };
}
