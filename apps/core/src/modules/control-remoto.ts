/**
 * Control remoto con RustDesk autoalojado (hbbs/hbbr en RD_HOST). Se guarda
 * el ID del equipo y su contraseña cifrada; la contraseña solo se entrega
 * con reautenticación fuerte, al tocar "Conectar".
 */
import { desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { devices, remoteHosts } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, idParams, requireCipher, type ModuleDeps } from "./common.js";

/** Un dispositivo cuenta como conectado si su último latido fue hace menos de 45 s. */
const CONECTADO_MS = 45_000;

const equipoSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
  rustdeskId: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{6,32}$/, "ID de RustDesk inválido (números o letras, 6 a 32)"),
  contrasena: z.string().max(128).optional(),
  dispositivoId: z.string().uuid().nullable().optional(),
});

export function controlRemotoRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const leer = { config: { acceso: { modulo: "control_remoto" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "control_remoto" as const, nivel: "escritura" as const, reauth: "fuerte" as const } } };

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/control-remoto", leer, async () => {
      const lista = await db.select().from(remoteHosts).orderBy(desc(remoteHosts.createdAt));
      const ids = lista.map((e) => e.deviceId).filter((v): v is string => Boolean(v));
      const devs = ids.length ? await db.select().from(devices).where(inArray(devices.id, ids)) : [];
      const ahora = deps.now().getTime();
      return {
        servidor: deps.config.env.RD_HOST,
        clavePublica: deps.config.env.RD_PUBLIC_KEY ?? null,
        equipos: lista.map((e) => {
          const d = devs.find((x) => x.id === e.deviceId);
          return {
            id: e.id,
            nombre: e.name,
            rustdeskId: e.rustdeskId,
            tieneContrasena: Boolean(e.passwordEnc),
            dispositivo: d
              ? { id: d.id, nombre: d.name, conectado: Boolean(d.lastSeenAt && ahora - d.lastSeenAt.getTime() < CONECTADO_MS), visto: d.lastSeenAt?.toISOString() ?? null }
              : null,
          };
        }),
      };
    });

    app.post("/api/control-remoto", escribir, async (request) => {
      const d = equipoSchema.parse(request.body);
      const cipher = requireCipher(deps);
      const [e] = await db
        .insert(remoteHosts)
        .values({
          name: d.nombre,
          rustdeskId: d.rustdeskId,
          passwordEnc: d.contrasena ? cipher.encrypt(d.contrasena) : null,
          deviceId: d.dispositivoId ?? null,
        })
        .returning({ id: remoteHosts.id });
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "equipo_remoto_agregado", module: "control_remoto", target: d.nombre, outcome: "ok" });
      return e;
    });

    app.patch("/api/control-remoto/:id", escribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = equipoSchema.partial().parse(request.body);
      const cipher = requireCipher(deps);
      const [e] = await db
        .update(remoteHosts)
        .set({
          ...(d.nombre !== undefined ? { name: d.nombre } : {}),
          ...(d.rustdeskId !== undefined ? { rustdeskId: d.rustdeskId } : {}),
          ...(d.contrasena !== undefined ? { passwordEnc: d.contrasena ? cipher.encrypt(d.contrasena) : null } : {}),
          ...(d.dispositivoId !== undefined ? { deviceId: d.dispositivoId } : {}),
        })
        .where(eq(remoteHosts.id, id))
        .returning({ id: remoteHosts.id, name: remoteHosts.name });
      if (!e) throw new HttpError(404, "Equipo no encontrado");
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "equipo_remoto_modificado", module: "control_remoto", target: e.name, outcome: "ok" });
      return { ok: true };
    });

    app.delete("/api/control-remoto/:id", escribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const [e] = await db.delete(remoteHosts).where(eq(remoteHosts.id, id)).returning({ name: remoteHosts.name });
      if (e) await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "equipo_remoto_borrado", module: "control_remoto", target: e.name, outcome: "ok" });
      return { ok: true };
    });

    /** Entrega ID y contraseña para abrir el cliente RustDesk. Siempre con reautenticación fuerte. */
    app.post("/api/control-remoto/:id/conectar", { config: { acceso: { modulo: "control_remoto", nivel: "lectura", reauth: "fuerte" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const [e] = await db.select().from(remoteHosts).where(eq(remoteHosts.id, id));
      if (!e) throw new HttpError(404, "Equipo no encontrado");
      const contrasena = e.passwordEnc ? requireCipher(deps).decrypt(e.passwordEnc) : null;
      await deps.audit.record({
        actorType: "usuario",
        actorUserId: currentUser(request).id,
        action: "control_remoto_abierto",
        module: "control_remoto",
        target: e.name,
        outcome: "ok",
        ...clientInfo(request),
      });
      return { rustdeskId: e.rustdeskId, contrasena, servidor: deps.config.env.RD_HOST };
    });
  };
}
