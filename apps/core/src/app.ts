import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { AuditWriter } from "./audit/audit.js";
import type { Config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { registerRbac } from "./security/rbac.js";
import { LOG_REDACT_PATHS } from "./security/redact.js";

export interface AppDeps {
  readonly config: Config;
  readonly audit: AuditWriter;
  /** false en pruebas para no ensuciar la salida. */
  readonly logger?: boolean;
}

export async function buildApp({ config, audit, logger = true }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: logger ? { level: config.env.LOG_LEVEL, redact: LOG_REDACT_PATHS } : false,
    // core solo es accesible a través de Caddy (red interna de Docker).
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await app.register(helmet, {
    hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  await app.register(cors, {
    origin: [...config.corsOrigins],
    credentials: true,
  });

  registerRbac(app, audit);

  app.setErrorHandler<FastifyError | ZodError>((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "Datos inválidos", detalles: error.issues });
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

  return app;
}
