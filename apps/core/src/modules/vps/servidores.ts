/**
 * Servidores VPS y sus credenciales (cifradas con SERVER_ENC_KEY, nunca
 * devueltas al cliente ni enviadas a la IA).
 */
import { can, type ModuleId } from "@mi-setup/shared";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Client } from "ssh2";
import { z } from "zod";
import { vpsServers, type VpsServerRow } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import { currentUser, type AuthUser } from "../../security/rbac.js";
import { clientInfo, idParams, requireCipher, type ModuleDeps } from "../common.js";
import { conectar, huellaDe } from "./ssh.js";

const MODULOS_VPS: ModuleId[] = ["vps_terminal", "vps_rendimiento", "vps_alertas", "vps_comandos", "vps_archivos", "vps_bots"];

export function puedeVerVps(user: AuthUser): boolean {
  return MODULOS_VPS.some((m) => can(user, m, "lectura"));
}

const servidorSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  host: z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9.:-]+$/, "Host inválido"),
  puerto: z.coerce.number().int().min(1).max(65535).default(22),
  usuario: z.string().trim().min(1).max(64).regex(/^[a-z_][a-z0-9_.-]*\$?$/i, "Usuario inválido"),
  tipo: z.enum(["llave", "password"]),
  /** Llave privada (PEM/OpenSSH) o contraseña. Vacío al editar = conservar. */
  secreto: z.string().max(20_000).optional(),
  frase: z.string().max(500).optional(),
  alertas: z.boolean().default(true),
  umbralRam: z.number().int().min(1).max(100).nullable().default(null),
  umbralDisco: z.number().int().min(1).max(100).nullable().default(null),
});

export function aDto(s: VpsServerRow) {
  return {
    id: s.id,
    nombre: s.name,
    host: s.host,
    puerto: s.port,
    usuario: s.username,
    tipo: s.authType,
    esRoot: s.username === "root",
    huella: s.hostKeyFingerprint,
    alertas: s.alerts,
    umbralRam: s.ramThreshold,
    umbralDisco: s.diskThreshold,
    estado: s.status,
    ultimaRevision: s.lastCheckAt?.toISOString() ?? null,
  };
}

export class Servidores {
  constructor(private readonly deps: ModuleDeps) {}

  async obtener(id: string): Promise<VpsServerRow> {
    const [s] = await this.deps.db.select().from(vpsServers).where(eq(vpsServers.id, id)).limit(1);
    if (!s) throw new HttpError(404, "Servidor no encontrado");
    return s;
  }

  async listar(): Promise<VpsServerRow[]> {
    return this.deps.db.select().from(vpsServers).orderBy(asc(vpsServers.name));
  }

  /** Abre una conexión SSH; guarda la huella la primera vez y avisa si cambió. */
  async conectar(servidor: VpsServerRow): Promise<Client> {
    try {
      const { cliente, huellaNueva } = await conectar(servidor, requireCipher(this.deps));
      if (huellaNueva) {
        await this.deps.db.update(vpsServers).set({ hostKeyFingerprint: huellaNueva }).where(eq(vpsServers.id, servidor.id));
        servidor.hostKeyFingerprint = huellaNueva;
        await this.deps.audit.record({
          actorType: "sistema",
          action: "huella_ssh_aceptada",
          module: "vps_terminal",
          target: servidor.name,
          outcome: "ok",
          details: { huella: huellaNueva },
        });
      }
      return cliente;
    } catch (err) {
      if (err instanceof HttpError && err.codigo === "huella_cambiada") {
        await this.deps.notifier.send({
          title: "Mi Setup: la huella SSH cambió",
          message: `${servidor.name} (${servidor.host}) presentó una llave distinta. No se conectó.`,
          priority: 5,
          tags: ["rotating_light"],
        });
        await this.deps.audit.record({
          actorType: "sistema",
          action: "huella_ssh_cambiada",
          module: "vps_terminal",
          target: servidor.name,
          outcome: "denegado",
          details: err.extra ?? {},
        });
      }
      throw err;
    }
  }

  async usar<T>(id: string, fn: (cliente: Client, servidor: VpsServerRow) => Promise<T>): Promise<T> {
    const servidor = await this.obtener(id);
    const cliente = await this.conectar(servidor);
    try {
      return await fn(cliente, servidor);
    } finally {
      cliente.end();
    }
  }
}

export function servidoresRoutes(deps: ModuleDeps, servidores: Servidores) {
  const { db } = deps;
  return async function (app: FastifyInstance): Promise<void> {
    // Lista sin credenciales: la ve cualquiera con acceso a algún apartado del VPS.
    app.get("/api/vps/servidores", { config: { acceso: { autenticado: true } } }, async (request) => {
      if (!puedeVerVps(currentUser(request))) throw new HttpError(403, "Sin permiso para el VPS", "sin_permiso");
      return (await servidores.listar()).map(aDto);
    });

    app.post(
      "/api/vps/servidores",
      { config: { acceso: { modulo: "vps_terminal", nivel: "administrar", reauth: "fuerte" } } },
      async (request) => {
        const cipher = requireCipher(deps);
        const d = servidorSchema.parse(request.body);
        if (!d.secreto) throw new HttpError(400, d.tipo === "llave" ? "Pega la llave privada" : "Escribe la contraseña");
        const [s] = await db
          .insert(vpsServers)
          .values({
            name: d.nombre,
            host: d.host,
            port: d.puerto,
            username: d.usuario,
            authType: d.tipo,
            secretEnc: cipher.encrypt(d.secreto),
            passphraseEnc: d.frase ? cipher.encrypt(d.frase) : null,
            alerts: d.alertas,
            ramThreshold: d.umbralRam,
            diskThreshold: d.umbralDisco,
          })
          .returning();
        if (!s) throw new HttpError(500, "No se pudo guardar el servidor");
        await deps.audit.record({
          actorType: "usuario",
          actorUserId: currentUser(request).id,
          action: "servidor_creado",
          module: "vps_terminal",
          target: s.name,
          outcome: "ok",
          ...clientInfo(request),
        });
        return aDto(s);
      },
    );

    app.patch(
      "/api/vps/servidores/:id",
      { config: { acceso: { modulo: "vps_terminal", nivel: "administrar", reauth: "fuerte" } } },
      async (request) => {
        const cipher = requireCipher(deps);
        const { id } = idParams.parse(request.params);
        const d = servidorSchema.partial().parse(request.body);
        const actual = await servidores.obtener(id);
        const cambiaDestino = (d.host && d.host !== actual.host) || (d.puerto && d.puerto !== actual.port);
        const [s] = await db
          .update(vpsServers)
          .set({
            ...(d.nombre !== undefined ? { name: d.nombre } : {}),
            ...(d.host !== undefined ? { host: d.host } : {}),
            ...(d.puerto !== undefined ? { port: d.puerto } : {}),
            ...(d.usuario !== undefined ? { username: d.usuario } : {}),
            ...(d.tipo !== undefined ? { authType: d.tipo } : {}),
            ...(d.secreto ? { secretEnc: cipher.encrypt(d.secreto) } : {}),
            ...(d.frase !== undefined ? { passphraseEnc: d.frase ? cipher.encrypt(d.frase) : null } : {}),
            ...(d.alertas !== undefined ? { alerts: d.alertas } : {}),
            ...(d.umbralRam !== undefined ? { ramThreshold: d.umbralRam } : {}),
            ...(d.umbralDisco !== undefined ? { diskThreshold: d.umbralDisco } : {}),
            // Otro host = otra llave: la huella se vuelve a aceptar en la próxima conexión.
            ...(cambiaDestino ? { hostKeyFingerprint: null } : {}),
          })
          .where(eq(vpsServers.id, id))
          .returning();
        if (!s) throw new HttpError(404, "Servidor no encontrado");
        return aDto(s);
      },
    );

    // Aceptar una huella nueva (p. ej. tras reinstalar el VPS).
    app.put(
      "/api/vps/servidores/:id/huella",
      { config: { acceso: { modulo: "vps_terminal", nivel: "administrar", reauth: "fuerte" } } },
      async (request) => {
        const { id } = idParams.parse(request.params);
        const { huella } = z.object({ huella: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/) }).parse(request.body);
        await db.update(vpsServers).set({ hostKeyFingerprint: huella }).where(eq(vpsServers.id, id));
        await deps.audit.record({
          actorType: "usuario",
          actorUserId: currentUser(request).id,
          action: "huella_ssh_reemplazada",
          module: "vps_terminal",
          target: id,
          outcome: "ok",
          details: { huella },
          ...clientInfo(request),
        });
        return { ok: true };
      },
    );

    app.post(
      "/api/vps/servidores/:id/probar",
      { config: { acceso: { modulo: "vps_terminal", nivel: "lectura" } } },
      async (request) => {
        const { id } = idParams.parse(request.params);
        return servidores.usar(id, async (cliente, s) => ({ ok: true, huella: s.hostKeyFingerprint, conectado: Boolean(cliente) }));
      },
    );

    app.delete(
      "/api/vps/servidores/:id",
      { config: { acceso: { modulo: "vps_terminal", nivel: "administrar", reauth: "fuerte" } } },
      async (request) => {
        const { id } = idParams.parse(request.params);
        const s = await servidores.obtener(id);
        await db.delete(vpsServers).where(eq(vpsServers.id, id));
        await deps.audit.record({
          actorType: "usuario",
          actorUserId: currentUser(request).id,
          action: "servidor_borrado",
          module: "vps_terminal",
          target: s.name,
          outcome: "ok",
          ...clientInfo(request),
        });
        return { ok: true };
      },
    );
  };
}

export { huellaDe };
