/**
 * Equipos: registro de dispositivos (PC, celular, web), presencia por latido
 * (15 s; desconectado a los 45 s) y métricas en vivo solo mientras alguien mira.
 */
import { can, OFFLINE_AFTER_MS, temas, type MetricasDispositivo } from "@mi-setup/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { devices } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";

interface Estado {
  userId: string;
  visto: number;
  conectado: boolean;
  metricas?: MetricasDispositivo;
  guardado: number;
}

export class Presencia {
  private readonly estado = new Map<string, Estado>();

  constructor(private readonly deps: ModuleDeps) {}

  async marcar(deviceId: string, userId: string, metricas?: MetricasDispositivo): Promise<void> {
    const ahora = this.deps.now().getTime();
    const previo = this.estado.get(deviceId);
    const estado: Estado = previo ?? { userId, visto: ahora, conectado: false, guardado: 0 };
    estado.visto = ahora;
    if (metricas) estado.metricas = metricas;
    this.estado.set(deviceId, estado);
    if (!estado.conectado) {
      estado.conectado = true;
      this.deps.hub.publicar(temas.dispositivos, { id: deviceId, conectado: true });
    }
    if (ahora - estado.guardado >= 10_000) {
      estado.guardado = ahora;
      await this.deps.db.update(devices).set({ lastSeenAt: new Date(ahora) }).where(eq(devices.id, deviceId));
    }
  }

  /** Se llama cada pocos segundos: marca como desconectados los que no laten. */
  tick(): void {
    const ahora = this.deps.now().getTime();
    for (const [id, e] of this.estado) {
      if (e.conectado && ahora - e.visto > OFFLINE_AFTER_MS) {
        e.conectado = false;
        this.deps.hub.publicar(temas.dispositivos, { id, conectado: false });
      }
    }
  }

  info(deviceId: string): { conectado: boolean; metricas: MetricasDispositivo | null; userId: string | null } {
    const e = this.estado.get(deviceId);
    return { conectado: e?.conectado ?? false, metricas: e?.metricas ?? null, userId: e?.userId ?? null };
  }

  olvidar(deviceId: string): void {
    this.estado.delete(deviceId);
  }
}

const registroSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  tipo: z.enum(["pc", "celular", "web"]),
  plataforma: z.string().trim().max(60).optional(),
});

export function equiposModule(deps: ModuleDeps) {
  const presencia = new Presencia(deps);
  const { hub, db } = deps;

  async function dueño(deviceId: string): Promise<string | null> {
    const [fila] = await db.select({ userId: devices.userId }).from(devices).where(eq(devices.id, deviceId)).limit(1);
    return fila?.userId ?? null;
  }

  async function verificarDispositivo(userId: string, deviceId: string): Promise<boolean> {
    return (await dueño(deviceId)) === userId;
  }

  hub.registrarTema(temas.dispositivos, (user) => can(user, "equipos", "lectura"));
  hub.registrarTema(
    "equipo:",
    async (user, tema) => {
      if (!can(user, "equipos", "lectura")) return false;
      const id = tema.split(":")[1] ?? "";
      if (user.role === "maestra") return true;
      return (await dueño(id)) === user.id;
    },
    (tema, activos) => {
      const id = tema.split(":")[1] ?? "";
      for (const con of hub.deDispositivo(id)) hub.enviar(con, { tipo: "interes", activo: activos > 0 });
    },
  );
  hub.registrarTema("usuario:", (user, tema) => tema === temas.usuario(user.id));

  hub.registrarManejador("latido", async (con, msg) => {
    if (!con.dispositivoId) return;
    await presencia.marcar(con.dispositivoId, con.user.id, msg.metricas);
    // Si alguien ya está mirando cuando el dispositivo se conecta, se le avisa.
    if (hub.activos(temas.metricasEquipo(con.dispositivoId)) > 0) hub.enviar(con, { tipo: "interes", activo: true });
  });
  hub.registrarManejador("metricas", async (con, msg) => {
    if (!con.dispositivoId) return;
    await presencia.marcar(con.dispositivoId, con.user.id, msg.metricas);
    hub.publicar(temas.metricasEquipo(con.dispositivoId), { t: deps.now().getTime(), ...msg.metricas });
  });

  async function routes(app: FastifyInstance): Promise<void> {
    // Cualquier cuenta con sesión registra sus propios dispositivos.
    app.post("/api/equipos/registrar", { config: { acceso: { autenticado: true } } }, async (request) => {
      const user = currentUser(request);
      const body = registroSchema.parse(request.body);
      const [creado] = await db
        .insert(devices)
        .values({ userId: user.id, name: body.nombre, kind: body.tipo, platform: body.plataforma ?? null })
        .returning();
      if (!creado) throw new HttpError(500, "No se pudo registrar el dispositivo");
      return { id: creado.id };
    });

    app.get("/api/equipos", { config: { acceso: { modulo: "equipos", nivel: "lectura" } } }, async (request) => {
      const user = currentUser(request);
      const filas = await db
        .select()
        .from(devices)
        .where(user.role === "maestra" ? undefined : eq(devices.userId, user.id))
        .orderBy(desc(devices.lastSeenAt));
      return filas.map((d) => {
        const info = presencia.info(d.id);
        return {
          id: d.id,
          nombre: d.name,
          tipo: d.kind,
          plataforma: d.platform,
          ultimaVez: d.lastSeenAt?.toISOString() ?? null,
          conectado: info.conectado,
          metricas: info.metricas,
        };
      });
    });

    app.patch(
      "/api/equipos/:id",
      { config: { acceso: { modulo: "equipos", nivel: "escritura" } } },
      async (request) => {
        const user = currentUser(request);
        const { id } = idParams.parse(request.params);
        const { nombre } = z.object({ nombre: z.string().trim().min(1).max(60) }).parse(request.body);
        const filtro = user.role === "maestra" ? eq(devices.id, id) : and(eq(devices.id, id), eq(devices.userId, user.id));
        await db.update(devices).set({ name: nombre }).where(filtro);
        return { ok: true };
      },
    );

    app.delete(
      "/api/equipos/:id",
      { config: { acceso: { modulo: "equipos", nivel: "escritura" } } },
      async (request) => {
        const user = currentUser(request);
        const { id } = idParams.parse(request.params);
        const filtro = user.role === "maestra" ? eq(devices.id, id) : and(eq(devices.id, id), eq(devices.userId, user.id));
        await db.delete(devices).where(filtro);
        presencia.olvidar(id);
        return { ok: true };
      },
    );
  }

  return { presencia, verificarDispositivo, routes };
}
