import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { createDbAuditWriter, type AuditWriter } from "./audit/audit.js";
import { AuthService } from "./auth/service.js";
import { createTokenSigner } from "./auth/tokens.js";
import type { Config } from "./config.js";
import type { Database } from "./db/client.js";
import { HttpError } from "./http-error.js";
import type { Job } from "./jobs.js";
import { aparienciaRoutes } from "./modules/apariencia.js";
import type { ModuleDeps } from "./modules/common.js";
import { chatRoutes } from "./modules/chat.js";
import { equiposModule } from "./modules/equipos.js";
import { notasRoutes } from "./modules/notas.js";
import { dispararRecordatorios, recordatoriosRoutes } from "./modules/recordatorios.js";
import { vpsModule } from "./modules/vps/index.js";
import { createNtfyNotifier, type Notifier } from "./notify/notifier.js";
import { Hub } from "./realtime/hub.js";
import { realtimeRoutes } from "./realtime/routes.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { createServerCipher } from "./security/crypto.js";
import { registerAccessGuard } from "./security/rbac.js";
import { LOG_REDACT_PATHS } from "./security/redact.js";
import { registerStatic } from "./static-ui.js";

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
  readonly hub: Hub;
  readonly deps: ModuleDeps;
  /** Tareas periódicas; index.ts las arranca. */
  readonly jobs: Job[];
}

export async function buildApp(appDeps: AppDeps): Promise<App> {
  const { config, db, logger = true } = appDeps;
  const now = appDeps.now ?? (() => new Date());

  const app = Fastify({
    logger: logger ? { level: config.env.LOG_LEVEL, redact: LOG_REDACT_PATHS } : false,
    // core solo es accesible a través de Caddy (red interna de Docker).
    trustProxy: true,
    bodyLimit: 2 * 1024 * 1024,
  });

  const audit = appDeps.audit ?? createDbAuditWriter(db);
  const notifier =
    appDeps.notifier ?? createNtfyNotifier({ url: config.ntfyUrl, topic: config.env.NTFY_TOPIC, log: app.log });
  const cipher = config.env.SERVER_ENC_KEY ? createServerCipher(config.env.SERVER_ENC_KEY) : null;
  const auth = new AuthService({
    db,
    audit,
    notifier,
    signer: config.env.JWT_SECRET ? createTokenSigner(config.env.JWT_SECRET) : null,
    cipher,
    now,
  });
  const hub = new Hub();
  const deps: ModuleDeps = { db, audit, notifier, hub, auth, config, cipher, now };
  const jobs: Job[] = [{ nombre: "limpieza-sesiones", cadaMs: 24 * 60 * 60 * 1000, alInicio: true, run: () => auth.purge() }];

  const pteroOrigin = new URL(config.env.PTERO_URL).origin;
  await app.register(helmet, {
    hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'", pteroOrigin],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(cors, { origin: [...config.corsOrigins], credentials: true });
  await app.register(websocket, { options: { maxPayload: 1024 * 1024 } });
  await app.register(multipart, { limits: { fileSize: 100 * 1024 * 1024, files: 1 } });

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

  const { hayUi } = await registerStatic(app, { uiDir: config.uiDir, uploadsDir: config.uploadsDir });
  app.setNotFoundHandler((request, reply) => {
    const ruta = request.url.split("?")[0] ?? "";
    if (hayUi && request.method === "GET" && !ruta.startsWith("/api") && !ruta.startsWith("/uploads")) {
      return reply.header("cache-control", "no-cache").sendFile("index.html");
    }
    return reply.code(404).send({ error: "No encontrado" });
  });

  const equipos = equiposModule(deps);
  jobs.push(
    { nombre: "presencia", cadaMs: 5_000, run: () => equipos.presencia.tick() },
    { nombre: "recordatorios", cadaMs: 30_000, alInicio: true, run: async () => void (await dispararRecordatorios(deps)) },
  );

  await app.register(healthRoutes);
  await app.register(authRoutes(auth));
  await app.register(realtimeRoutes({ ...deps, verificarDispositivo: equipos.verificarDispositivo }));
  await app.register(equipos.routes);
  await app.register(aparienciaRoutes(deps));
  await app.register(notasRoutes(deps));
  await app.register(recordatoriosRoutes(deps));
  await app.register(chatRoutes(deps));

  const vps = vpsModule(deps);
  jobs.push(...vps.jobs);
  await app.register(vps.routes);

  return { app, auth, hub, deps, jobs };
}
