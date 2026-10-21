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
import { cuentaRoutes } from "./modules/cuenta.js";
import { aplicarClavesGuardadas, clavesRoutes } from "./modules/claves.js";
import { rolesRoutes, sembrarRoles } from "./modules/roles.js";
import { bovedaRoutes } from "./modules/boveda.js";
import type { ModuleDeps } from "./modules/common.js";
import { chatRoutes } from "./modules/chat.js";
import { descargasRoutes } from "./modules/descargas.js";
import { herramientasRoutes, limpiarCompartidos } from "./modules/herramientas.js";
import { personalRoutes, revisarSuscripciones } from "./modules/personal.js";
import { finanzasExtraRoutes, limpiarTickets } from "./modules/finanzas-extra.js";
import { clavesUsuarioRoutes } from "./modules/claves-usuario.js";
import { crearIaSimple } from "./modules/ia/simple.js";
import { iaExtrasRoutes } from "./modules/ia/extras.js";
import { extrasRoutes } from "./modules/extras.js";
import { entretenimientoRoutes } from "./modules/entretenimiento.js";
import { ciberseguridadRoutes } from "./modules/ciberseguridad.js";
import { comprasRoutes } from "./modules/compras.js";
import { ejerciciosRoutes } from "./modules/ejercicios.js";
import { botsDiscordModule, type FabricaMotor, type GestorBots, type ValidarToken } from "./modules/bots-discord/index.js";
import { clipsRoutes, limpiarFuentes } from "./modules/clips.js";
import { cloudflareRoutes } from "./modules/cloudflare.js";
import { estudioRoutes } from "./modules/estudio.js";
import { hostLocalRoutes } from "./modules/hostlocal.js";
import { crearDetectorSitios, sitiosModule } from "./modules/sitios/index.js";
import { imagenesRoutes } from "./modules/imagenes.js";
import { correoRoutes, purgarCorreos } from "./modules/correo.js";
import { iaRoutes } from "./modules/ia/rutas.js";
import { novedadesRoutes, revisarPrecios } from "./modules/novedades.js";
import { mercadosRoutes } from "./modules/mercados.js";
import { noticiasRoutes } from "./modules/noticias.js";
import { controlRemotoRoutes } from "./modules/control-remoto.js";
import { cuentasRoutes } from "./modules/cuentas.js";
import { redesModule } from "./modules/redes/index.js";
import type { ClienteIa } from "./modules/ia/servicio.js";
import { equiposModule } from "./modules/equipos.js";
import { notasRoutes } from "./modules/notas.js";
import { notasAdjuntosRoutes } from "./modules/notas-adjuntos.js";
import { notasCompartirRoutes } from "./modules/notas-compartir.js";
import { seguridadCuentaRoutes } from "./modules/seguridad-cuenta.js";
import { correoGoogleRoutes } from "./modules/correo-google.js";
import { dispararRecordatorios, recordatoriosRoutes } from "./modules/recordatorios.js";
import { negocioRoutes, recordarCobros } from "./modules/negocio.js";
import { pteroRoutes } from "./modules/ptero.js";
import { pteroAdminRoutes } from "./modules/ptero-admin.js";
import { respaldosRoutes } from "./modules/respaldos.js";
import { respaldosAutomaticos, respaldosVpsRoutes } from "./modules/respaldos-vps.js";
import { revisarVencimientos, vencimientosRoutes } from "./modules/vencimientos.js";
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
  /** Cliente de IA falso (pruebas). */
  readonly clienteIa?: ClienteIa;
  /** IA local falsa (pruebas). */
  readonly clienteIaLocal?: ClienteIa;
  /** Motor de bots de Discord falso (pruebas). */
  readonly fabricaBots?: FabricaMotor;
  /** Validación del token de un bot (pruebas). */
  readonly validarTokenBot?: ValidarToken;
}

export interface App {
  readonly app: FastifyInstance;
  readonly auth: AuthService;
  readonly hub: Hub;
  readonly deps: ModuleDeps;
  /** Tareas periódicas; index.ts las arranca. */
  readonly jobs: Job[];
  /** Gestor de los bots de Discord encendidos (pruebas y cierre ordenado). */
  readonly gestorBots: GestorBots;
  /** Se llama después de migrar: aplica las claves guardadas en Ajustes y crea los roles iniciales. */
  readonly preparar: () => Promise<void>;
}

export async function buildApp(appDeps: AppDeps): Promise<App> {
  const { config, db, logger = true } = appDeps;
  const now = appDeps.now ?? (() => new Date());

  // Sitios publicados (nombre.DOMINIO o dominio propio): se atienden en /__sitio/… (módulo sitios).
  const detectorSitios = crearDetectorSitios(config);
  const app = Fastify({
    rewriteUrl: (req) => (detectorSitios.esSitio(req.headers.host) ? `/__sitio${req.url ?? "/"}` : (req.url ?? "/")),
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
        // Google Fonts: tipografías del creador de sitios.
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        // Portadas de ofertas (CheapShark) vienen de CDNs de cada tienda: se permiten solo imágenes https.
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        // Chats en vivo (Twitch y Kick) y modelo para quitar fondos (IA creativa).
        connectSrc: ["'self'", "wss://irc-ws.chat.twitch.tv", "wss://ws-us2.pusher.com", "https://staticimgly.com"],
        workerSrc: ["'self'", "blob:"],
        frameSrc: ["'self'", pteroOrigin, "https://www.youtube-nocookie.com"],
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
  await app.register(cuentaRoutes(deps));
  await app.register(clavesRoutes(deps));
  await app.register(rolesRoutes(deps));
  await app.register(notasRoutes(deps));
  const iaSimple = crearIaSimple(deps, { ...(appDeps.clienteIa ? { cliente: appDeps.clienteIa } : {}), ...(appDeps.clienteIaLocal ? { local: appDeps.clienteIaLocal } : {}) });
  await app.register(notasAdjuntosRoutes(deps));
  await app.register(notasCompartirRoutes(deps));
  await app.register(seguridadCuentaRoutes(deps));
  await app.register(correoGoogleRoutes(deps, iaSimple));
  await app.register(iaExtrasRoutes(deps, iaSimple));
  await app.register(recordatoriosRoutes(deps));
  await app.register(chatRoutes(deps));
  await app.register(descargasRoutes(deps));
  await app.register(herramientasRoutes(deps));
  await app.register(personalRoutes(deps));
  await app.register(finanzasExtraRoutes(deps, iaSimple));
  await app.register(clavesUsuarioRoutes(deps));
  jobs.push({ nombre: "limpiar-tickets", cadaMs: 12 * 60 * 60_000, alInicio: false, run: () => limpiarTickets(deps) });
  await app.register(extrasRoutes(deps));
  await app.register(entretenimientoRoutes(deps));
  await app.register(ciberseguridadRoutes(deps));
  await app.register(comprasRoutes(deps, iaSimple));
  await app.register(ejerciciosRoutes(deps));
  await app.register(hostLocalRoutes(deps));
  await app.register(cloudflareRoutes(deps));
  await app.register(estudioRoutes(deps));
  await app.register(clipsRoutes(deps, appDeps.clienteIa));
  const bots = botsDiscordModule(deps, { ...(appDeps.fabricaBots ? { fabrica: appDeps.fabricaBots } : {}), ...(appDeps.validarTokenBot ? { validarToken: appDeps.validarTokenBot } : {}) });
  await app.register(bots.routes);
  app.addHook("onClose", async () => bots.gestor.detenerTodos());
  jobs.push(
    { nombre: "bots-encender", cadaMs: 24 * 60 * 60_000, alInicio: true, run: () => bots.gestor.encenderPendientes() },
    { nombre: "bots-vencimiento", cadaMs: 5 * 60_000, alInicio: true, run: async () => void (await bots.gestor.apagarVencidos()) },
  );
  jobs.push({ nombre: "limpiar-clips", cadaMs: 6 * 60 * 60_000, alInicio: false, run: () => limpiarFuentes(deps) });
  await app.register(sitiosModule(deps, detectorSitios, appDeps.clienteIa));
  await app.register(imagenesRoutes(deps));
  jobs.push({ nombre: "suscripciones", cadaMs: 60 * 60_000, alInicio: true, run: () => revisarSuscripciones(deps) });
  jobs.push({ nombre: "limpiar-compartidos", cadaMs: 24 * 60 * 60_000, alInicio: true, run: () => limpiarCompartidos(deps) });

  const vps = vpsModule(deps);
  jobs.push(...vps.jobs);
  await app.register(vps.routes);
  await app.register(respaldosVpsRoutes(deps, vps.servidores));
  jobs.push({ nombre: "respaldos-automaticos", cadaMs: 15 * 60_000, alInicio: false, run: () => respaldosAutomaticos(deps, vps.servidores) });

  const ptero = pteroRoutes(deps);
  await app.register(ptero.routes);
  await app.register(pteroAdminRoutes(deps, ptero.ptero, vps.servidores));
  await app.register(vencimientosRoutes(deps));
  await app.register(negocioRoutes(deps));
  await app.register(respaldosRoutes(deps));
  await app.register(bovedaRoutes(deps));
  await app.register(correoRoutes(deps));
  const redes = redesModule(deps);
  await app.register(redes.routes);
  await app.register(novedadesRoutes(deps));
  await app.register(mercadosRoutes(deps));
  await app.register(noticiasRoutes(deps));
  await app.register(cuentasRoutes(deps));
  await app.register(controlRemotoRoutes(deps));
  jobs.push({ nombre: "vigilante-precios", cadaMs: 3 * 60 * 60_000, alInicio: false, run: () => revisarPrecios(deps) });
  await app.register(
    iaRoutes(deps, {
      contexto: { servidores: vps.servidores, ptero: ptero.ptero },
      extras: redes.herramientas,
      contextos: [redes.contexto],
      ...(appDeps.clienteIa ? { cliente: appDeps.clienteIa } : {}),
      ...(appDeps.clienteIaLocal ? { clienteLocal: appDeps.clienteIaLocal } : {}),
    }),
  );
  jobs.push({ nombre: "correos-24h", cadaMs: 60 * 60_000, alInicio: true, run: () => purgarCorreos(deps) });
  jobs.push(
    { nombre: "vencimientos", cadaMs: 6 * 60 * 60_000, alInicio: true, run: () => revisarVencimientos(deps) },
    { nombre: "cobros", cadaMs: 6 * 60 * 60_000, alInicio: true, run: async () => void (await recordarCobros(deps)) },
  );

  const preparar = async () => {
    // Si la base aún no responde, se sigue con el .env.
    await aplicarClavesGuardadas(deps).catch((err: unknown) => app.log.warn({ err }, "No se pudieron cargar las claves guardadas"));
    await sembrarRoles(deps).catch((err: unknown) => app.log.warn({ err }, "No se pudieron crear los roles iniciales"));
  };

  return { app, auth, hub, deps, jobs, gestorBots: bots.gestor, preparar };
}
