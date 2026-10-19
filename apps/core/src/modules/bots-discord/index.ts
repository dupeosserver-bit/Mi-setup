/**
 * Bots de Discord alojados en Mi Setup (estilo BotGhost): pegas el token de tu aplicación y Mi Setup mantiene el
 * bot encendido, con módulos que se configuran desde la app. Para vender el servicio, cada bot puede tener un
 * cliente, una fecha de vencimiento (se apaga solo) y un enlace para que su dueño edite el bot sin ver tu cuenta
 * ni el token. El token se guarda cifrado y nunca se devuelve.
 */
import { createHash, randomBytes } from "node:crypto";
import { botConfigSchema, CONFIG_BOT_INICIAL, enlaceInvitacion, validarCommandosPropios, type BotConfig } from "@mi-setup/shared";
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hostedBots } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import { currentUser, type AuthUser } from "../../security/rbac.js";
import { clientInfo, idParams, requireCipher, type ModuleDeps } from "../common.js";
import { explicarError, MotorDiscord, type FabricaMotor, type Motor } from "./motor.js";

export { construirComandos, explicarError, MotorDiscord } from "./motor.js";
export type { FabricaMotor, Motor } from "./motor.js";

type Fila = typeof hostedBots.$inferSelect;
export type ValidarToken = (token: string) => Promise<{ appId: string; nombre: string }>;

/** Comprueba el token con Discord sin conectar el bot. */
export const validarTokenDiscord: ValidarToken = async (token) => {
  const cab = { authorization: `Bot ${token}`, "user-agent": "MiSetup (https://setup.mexicanland.net, 1.0)" };
  const yo = await fetch("https://discord.com/api/v10/users/@me", { headers: cab, signal: AbortSignal.timeout(12_000) }).catch(() => null);
  if (!yo) throw new HttpError(502, "No pude hablar con Discord. Intenta de nuevo.");
  if (yo.status === 401) throw new HttpError(400, "Ese token no es válido. Copia uno nuevo desde discord.com/developers → tu aplicación → Bot → Reset Token.");
  if (!yo.ok) throw new HttpError(502, `Discord respondió ${yo.status}`);
  const u = (await yo.json()) as { id: string; username: string; bot?: boolean };
  if (!u.bot) throw new HttpError(400, "Ese token no es de un bot.");
  const app = await fetch("https://discord.com/api/v10/oauth2/applications/@me", { headers: cab, signal: AbortSignal.timeout(12_000) }).catch(() => null);
  const a = app?.ok ? ((await app.json()) as { id: string }) : null;
  return { appId: a?.id ?? u.id, nombre: u.username };
};

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export class GestorBots {
  private motores = new Map<string, Motor>();
  private bloqueos = new Map<string, Promise<unknown>>();
  private errores = new Map<string, string>();

  constructor(
    private readonly deps: ModuleDeps,
    private readonly fabrica: FabricaMotor,
  ) {}

  estado(id: string): "apagado" | "conectando" | "encendido" | "error" {
    return this.motores.get(id)?.estado() ?? (this.errores.has(id) ? "error" : "apagado");
  }
  errorDe(id: string): string | null {
    return this.errores.get(id) ?? null;
  }
  servidores(id: string) {
    return this.motores.get(id)?.servidores() ?? [];
  }

  private serializar<T>(id: string, tarea: () => Promise<T>): Promise<T> {
    const previa = this.bloqueos.get(id) ?? Promise.resolve();
    const nueva = previa.catch(() => undefined).then(tarea);
    this.bloqueos.set(id, nueva);
    return nueva.finally(() => {
      if (this.bloqueos.get(id) === nueva) this.bloqueos.delete(id);
    });
  }

  encender(bot: Fila): Promise<void> {
    return this.serializar(bot.id, async () => {
      if (this.motores.get(bot.id)?.estado() === "encendido") return;
      if (bot.expiresAt && bot.expiresAt.getTime() <= this.deps.now().getTime()) throw new HttpError(403, "El servicio de este bot venció.", "bot_vencido");
      const token = requireCipher(this.deps).decrypt(bot.tokenEnc);
      const motor = this.fabrica({
        botId: bot.id,
        token,
        config: botConfigSchema.parse(bot.config),
        db: this.deps.db,
        ahora: this.deps.now,
        alError: (m) => this.errores.set(bot.id, m),
      });
      this.errores.delete(bot.id);
      try {
        const r = await motor.iniciar();
        this.motores.set(bot.id, motor);
        await this.deps.db.update(hostedBots).set({ enabled: true, applicationId: r.appId, botName: r.nombre, lastError: null, updatedAt: this.deps.now() }).where(eq(hostedBots.id, bot.id));
      } catch (err) {
        const msg = explicarError(err);
        this.errores.set(bot.id, msg);
        await this.deps.db.update(hostedBots).set({ enabled: false, lastError: msg, updatedAt: this.deps.now() }).where(eq(hostedBots.id, bot.id));
        throw new HttpError(502, msg, "bot_error");
      }
    });
  }

  apagar(id: string): Promise<void> {
    return this.serializar(id, async () => {
      const m = this.motores.get(id);
      this.motores.delete(id);
      this.errores.delete(id);
      await m?.detener();
      await this.deps.db.update(hostedBots).set({ enabled: false, updatedAt: this.deps.now() }).where(eq(hostedBots.id, id));
    });
  }

  async reiniciar(bot: Fila): Promise<void> {
    await this.apagar(bot.id);
    const [fresco] = await this.deps.db.select().from(hostedBots).where(eq(hostedBots.id, bot.id));
    if (fresco) await this.encender(fresco);
  }

  async aplicarConfig(id: string, cfg: BotConfig): Promise<void> {
    await this.motores.get(id)?.aplicarConfig(cfg);
  }

  /** Al arrancar Mi Setup: vuelve a encender los bots que estaban encendidos. */
  async encenderPendientes(): Promise<void> {
    const filas = await this.deps.db.select().from(hostedBots).where(eq(hostedBots.enabled, true));
    for (const b of filas) {
      if (this.motores.has(b.id)) continue;
      await this.encender(b).catch(() => undefined);
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  /** Apaga los bots cuyo servicio ya venció y avisa. */
  async apagarVencidos(): Promise<number> {
    const filas = await this.deps.db.select().from(hostedBots).where(and(isNotNull(hostedBots.expiresAt), lte(hostedBots.expiresAt, this.deps.now()), eq(hostedBots.enabled, true)));
    for (const b of filas) {
      await this.apagar(b.id);
      await this.deps.notifier
        .send({ title: "Mi Setup: venció un bot", message: `${b.name}${b.clientName ? ` (${b.clientName})` : ""} se apagó porque su servicio venció.`, priority: 3, tags: ["robot"] })
        .catch(() => undefined);
      await this.deps.audit.record({ actorType: "sistema", action: "bot_vencido", module: "bots_discord", target: b.name, outcome: "ok" });
    }
    return filas.length;
  }

  async detenerTodos(): Promise<void> {
    await Promise.all([...this.motores.keys()].map((id) => this.apagarSinMarcar(id)));
  }
  /** Para cerrar Mi Setup: se desconectan pero siguen marcados como encendidos para volver a levantarlos. */
  private async apagarSinMarcar(id: string): Promise<void> {
    const m = this.motores.get(id);
    this.motores.delete(id);
    await m?.detener();
  }
}

export interface OpcionesBots {
  fabrica?: FabricaMotor;
  validarToken?: ValidarToken;
}

export function botsDiscordModule(deps: ModuleDeps, opciones: OpcionesBots = {}) {
  const { db } = deps;
  const fabrica: FabricaMotor = opciones.fabrica ?? ((o) => new MotorDiscord(o));
  const validarToken = opciones.validarToken ?? validarTokenDiscord;
  const gestor = new GestorBots(deps, fabrica);

  const vencido = (b: Fila) => Boolean(b.expiresAt && b.expiresAt.getTime() <= deps.now().getTime());
  const dto = (b: Fila) => ({
    id: b.id,
    nombre: b.name,
    botNombre: b.botName,
    cliente: b.clientName,
    estado: gestor.estado(b.id),
    deberiaEstarEncendido: b.enabled,
    vence: b.expiresAt?.toISOString() ?? null,
    vencido: vencido(b),
    compartido: b.shareEnabled,
    error: gestor.errorDe(b.id) ?? b.lastError,
    invitacion: b.applicationId ? enlaceInvitacion(b.applicationId) : null,
    creado: b.createdAt.toISOString(),
  });
  const detalle = (b: Fila) => ({ ...dto(b), config: botConfigSchema.parse(b.config), servidores: gestor.servidores(b.id) });

  async function botPara(user: AuthUser, id: string): Promise<Fila> {
    const [b] = await db.select().from(hostedBots).where(eq(hostedBots.id, id));
    if (!b || (b.ownerId !== user.id && user.role !== "maestra")) throw new HttpError(404, "Bot no encontrado");
    return b;
  }
  async function botPorEnlace(token: string): Promise<Fila> {
    const [b] = await db.select().from(hostedBots).where(and(eq(hostedBots.shareHash, sha256(token)), eq(hostedBots.shareEnabled, true)));
    if (!b) throw new HttpError(404, "Este enlace ya no sirve. Pide uno nuevo a quien te vendió el bot.");
    return b;
  }

  async function guardarConfig(b: Fila, cuerpo: unknown): Promise<BotConfig> {
    const cfg = botConfigSchema.parse(cuerpo);
    const choque = validarCommandosPropios(cfg.comandos);
    if (choque) throw new HttpError(400, choque);
    for (const r of cfg.economia.tienda) if (cfg.economia.tienda.filter((x) => x.id === r.id).length > 1) throw new HttpError(400, `El artículo «${r.id}» está repetido`);
    await db.update(hostedBots).set({ config: cfg, updatedAt: deps.now() }).where(eq(hostedBots.id, b.id));
    await gestor.aplicarConfig(b.id, cfg).catch((err: unknown) => {
      throw new HttpError(502, `Se guardó, pero no se pudo aplicar en Discord: ${explicarError(err)}`);
    });
    return cfg;
  }

  // Limita el uso del enlace público (por si se filtra).
  const usos = new Map<string, { n: number; desde: number }>();
  function limitar(hash: string): void {
    const ahora = Date.now();
    const u = usos.get(hash);
    if (!u || ahora - u.desde > 60_000) usos.set(hash, { n: 1, desde: ahora });
    else if (++u.n > 90) throw new HttpError(429, "Demasiadas peticiones. Espera un minuto.");
  }

  const rutas = async function (app: FastifyInstance): Promise<void> {
    const leer = { config: { acceso: { modulo: "bots_discord" as const, nivel: "lectura" as const } } };
    const escribir = { config: { acceso: { modulo: "bots_discord" as const, nivel: "escritura" as const } } };
    const delicado = { config: { acceso: { modulo: "bots_discord" as const, nivel: "escritura" as const, reauth: "fuerte" as const } } };

    app.get("/api/bots", leer, async (request) => {
      const user = currentUser(request);
      const filas = await db.select().from(hostedBots).where(user.role === "maestra" ? undefined : eq(hostedBots.ownerId, user.id)).orderBy(asc(hostedBots.name));
      return filas.map(dto);
    });

    app.post("/api/bots", delicado, async (request) => {
      const user = currentUser(request);
      const d = z
        .object({ nombre: z.string().trim().min(1).max(60), token: z.string().trim().min(40).max(200), cliente: z.string().trim().max(80).default(""), vence: z.string().datetime().nullable().default(null) })
        .parse(request.body);
      const info = await validarToken(d.token);
      const [b] = await db
        .insert(hostedBots)
        .values({ ownerId: user.id, name: d.nombre, clientName: d.cliente, tokenEnc: requireCipher(deps).encrypt(d.token), applicationId: info.appId, botName: info.nombre, config: CONFIG_BOT_INICIAL, expiresAt: d.vence ? new Date(d.vence) : null })
        .returning();
      if (!b) throw new HttpError(500, "No se pudo guardar");
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "bot_creado", module: "bots_discord", target: `${d.nombre} (${info.nombre})`, outcome: "ok", ...clientInfo(request) });
      return detalle(b);
    });

    app.get("/api/bots/:id", leer, async (request) => detalle(await botPara(currentUser(request), idParams.parse(request.params).id)));

    app.patch("/api/bots/:id", escribir, async (request) => {
      const b = await botPara(currentUser(request), idParams.parse(request.params).id);
      const d = z.object({ nombre: z.string().trim().min(1).max(60).optional(), cliente: z.string().trim().max(80).optional(), vence: z.string().datetime().nullable().optional() }).parse(request.body);
      const [n] = await db
        .update(hostedBots)
        .set({ ...(d.nombre !== undefined ? { name: d.nombre } : {}), ...(d.cliente !== undefined ? { clientName: d.cliente } : {}), ...(d.vence !== undefined ? { expiresAt: d.vence ? new Date(d.vence) : null } : {}), updatedAt: deps.now() })
        .where(eq(hostedBots.id, b.id))
        .returning();
      return detalle(n!);
    });

    /** Cambiar el token (por ejemplo, si lo regeneraste en Discord). Pide reautenticación fuerte. */
    app.put("/api/bots/:id/token", delicado, async (request) => {
      const user = currentUser(request);
      const b = await botPara(user, idParams.parse(request.params).id);
      const { token } = z.object({ token: z.string().trim().min(40).max(200) }).parse(request.body);
      const info = await validarToken(token);
      await gestor.apagar(b.id);
      await db.update(hostedBots).set({ tokenEnc: requireCipher(deps).encrypt(token), applicationId: info.appId, botName: info.nombre, lastError: null, updatedAt: deps.now() }).where(eq(hostedBots.id, b.id));
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "bot_token_cambiado", module: "bots_discord", target: b.name, outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });

    app.put("/api/bots/:id/config", escribir, async (request) => {
      const b = await botPara(currentUser(request), idParams.parse(request.params).id);
      return { config: await guardarConfig(b, request.body) };
    });

    for (const accion of ["encender", "apagar", "reiniciar"] as const) {
      app.post(`/api/bots/:id/${accion}`, escribir, async (request) => {
        const user = currentUser(request);
        const b = await botPara(user, idParams.parse(request.params).id);
        if (accion === "apagar") await gestor.apagar(b.id);
        else if (accion === "encender") await gestor.encender(b);
        else await gestor.reiniciar(b);
        await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: `bot_${accion}`, module: "bots_discord", target: b.name, outcome: "ok", ...clientInfo(request) });
        const [n] = await db.select().from(hostedBots).where(eq(hostedBots.id, b.id));
        return detalle(n!);
      });
    }

    app.delete("/api/bots/:id", delicado, async (request) => {
      const user = currentUser(request);
      const b = await botPara(user, idParams.parse(request.params).id);
      await gestor.apagar(b.id);
      await db.delete(hostedBots).where(eq(hostedBots.id, b.id));
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "bot_borrado", module: "bots_discord", target: b.name, outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });

    /** Crea (o cambia) el enlace para que el dueño del bot lo configure. Se muestra una sola vez. */
    app.post("/api/bots/:id/compartir", delicado, async (request) => {
      const user = currentUser(request);
      const b = await botPara(user, idParams.parse(request.params).id);
      const token = randomBytes(32).toString("base64url");
      await db.update(hostedBots).set({ shareHash: sha256(token), shareEnabled: true, updatedAt: deps.now() }).where(eq(hostedBots.id, b.id));
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "bot_enlace_creado", module: "bots_discord", target: b.name, outcome: "ok", ...clientInfo(request) });
      return { ruta: `/bot/${token}` };
    });
    app.delete("/api/bots/:id/compartir", delicado, async (request) => {
      const b = await botPara(currentUser(request), idParams.parse(request.params).id);
      await db.update(hostedBots).set({ shareEnabled: false, shareHash: null, updatedAt: deps.now() }).where(eq(hostedBots.id, b.id));
      return { ok: true };
    });

    // ------------------------------------------------------------ enlace del cliente (sin cuenta de Mi Setup)
    const publico = { config: { acceso: { publico: true as const } } };
    const tokenParams = z.object({ token: z.string().min(20).max(80) });
    const ver = (b: Fila) => ({ ...detalle(b), invitacion: b.applicationId ? enlaceInvitacion(b.applicationId) : null });

    app.get("/api/bot-publico/:token", publico, async (request) => {
      const { token } = tokenParams.parse(request.params);
      limitar(sha256(token));
      const { cliente: _cliente, ...resto } = ver(await botPorEnlace(token));
      void _cliente;
      return resto;
    });
    app.put("/api/bot-publico/:token/config", publico, async (request) => {
      const { token } = tokenParams.parse(request.params);
      limitar(sha256(token));
      const b = await botPorEnlace(token);
      return { config: await guardarConfig(b, request.body) };
    });
    for (const accion of ["encender", "apagar", "reiniciar"] as const) {
      app.post(`/api/bot-publico/:token/${accion}`, publico, async (request) => {
        const { token } = tokenParams.parse(request.params);
        limitar(sha256(token));
        const b = await botPorEnlace(token);
        if (accion !== "apagar" && vencido(b)) throw new HttpError(403, "El servicio de este bot venció. Contacta a quien te lo vendió.", "bot_vencido");
        if (accion === "apagar") await gestor.apagar(b.id);
        else if (accion === "encender") await gestor.encender(b);
        else await gestor.reiniciar(b);
        await deps.audit.record({ actorType: "sistema", action: `bot_${accion}_cliente`, module: "bots_discord", target: b.name, outcome: "ok" });
        const [n] = await db.select().from(hostedBots).where(eq(hostedBots.id, b.id));
        const { cliente: _cliente, ...resto } = ver(n!);
        void _cliente;
        return resto;
      });
    }
  };

  return { routes: rutas, gestor };
}
