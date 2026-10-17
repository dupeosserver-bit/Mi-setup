/**
 * Roles tipo Discord: nombre, color y permisos por módulo. Los permisos de
 * una cuenta son el nivel más alto entre los suyos y los de sus roles. Los
 * módulos solo-maestra nunca se otorgan por rol. Al primer arranque se crean
 * "Fundador" y "Dev" (se pueden editar o borrar).
 */
import { levelRank, MODULE_IDS, PERMISSION_LEVELS, sanitizePermissionMap, type PermissionMap } from "@mi-setup/shared";
import { asc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Database } from "../db/client.js";
import { roles, userRoles, users } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "./common.js";
import { getSetting, setSetting } from "./settings.js";

export interface RolResumen {
  id: string;
  nombre: string;
  color: string;
}

/** Suma de permisos de los roles de una cuenta. */
export async function permisosDeRoles(db: Database, userId: string): Promise<{ permisos: PermissionMap; roles: RolResumen[] }> {
  const filas = await db
    .select({ id: roles.id, nombre: roles.name, color: roles.color, permisos: roles.permissions, posicion: roles.position })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, userId))
    .orderBy(asc(roles.position));
  const permisos: PermissionMap = {};
  for (const r of filas) {
    for (const [modulo, nivel] of Object.entries(sanitizePermissionMap(r.permisos as PermissionMap))) {
      const actual = permisos[modulo as keyof PermissionMap];
      if (nivel && (!actual || levelRank(nivel) > levelRank(actual))) permisos[modulo as keyof PermissionMap] = nivel;
    }
  }
  return { permisos, roles: filas.map((r) => ({ id: r.id, nombre: r.nombre, color: r.color })) };
}

/** Crea los roles iniciales una sola vez (si luego se borran, no vuelven). */
export async function sembrarRoles(deps: ModuleDeps): Promise<void> {
  if (await getSetting<boolean>(deps.db, "roles.sembrados")) return;
  const todos = Object.fromEntries(MODULE_IDS.map((m) => [m, "administrar"])) as PermissionMap;
  await deps.db.insert(roles).values([
    { name: "Fundador", color: "#f5c542", position: 0, permissions: sanitizePermissionMap(todos) },
    {
      name: "Dev",
      color: "#5ab4ff",
      position: 1,
      permissions: sanitizePermissionMap({
        vps_alertas: "escritura",
        pterodactyl: "escritura",
        respaldos: "lectura",
        chat: "escritura",
        notas: "escritura",
        recordatorios: "escritura",
        ia: "escritura",
        novedades: "escritura",
      }),
    },
  ]);
  await setSetting(deps.db, "roles.sembrados", true, deps.now());
}

const permisosSchema = z.record(z.enum(MODULE_IDS as [string, ...string[]]), z.enum(PERMISSION_LEVELS)).default({});
const rolSchema = z.object({
  nombre: z.string().trim().min(1, "Ponle nombre al rol").max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido").default("#8e8e93"),
  posicion: z.number().int().min(0).max(1000).default(0),
  permisos: permisosSchema,
});

function rolDto(r: typeof roles.$inferSelect, miembros: number) {
  return { id: r.id, nombre: r.name, color: r.color, posicion: r.position, permisos: r.permissions as PermissionMap, miembros };
}

export function rolesRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const leer = { config: { acceso: { modulo: "cuentas" as const, nivel: "lectura" as const } } };
  const administrar = { config: { acceso: { modulo: "cuentas" as const, nivel: "administrar" as const, reauth: "fuerte" as const } } };

  const avisarCambio = async (roleId: string | null) => {
    // Las cuentas afectadas recargan sus permisos.
    const afectados = roleId ? await db.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, roleId)) : [];
    for (const a of afectados) deps.hub.publicar(`usuario:${a.userId}`, { recurso: "me" });
  };

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/roles", leer, async () => {
      const lista = await db.select().from(roles).orderBy(asc(roles.position), asc(roles.createdAt));
      const asignaciones = await db.select().from(userRoles);
      return lista.map((r) => rolDto(r, asignaciones.filter((a) => a.roleId === r.id).length));
    });

    app.post("/api/roles", administrar, async (request) => {
      const d = rolSchema.parse(request.body);
      const [r] = await db
        .insert(roles)
        .values({ name: d.nombre, color: d.color, position: d.posicion, permissions: sanitizePermissionMap(d.permisos as PermissionMap) })
        .returning();
      if (!r) throw new HttpError(500, "No se pudo crear el rol");
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "rol_creado", module: "cuentas", target: d.nombre, outcome: "ok", ...clientInfo(request) });
      return rolDto(r, 0);
    });

    app.patch("/api/roles/:id", administrar, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = rolSchema.partial().parse(request.body);
      const [r] = await db
        .update(roles)
        .set({
          ...(d.nombre !== undefined ? { name: d.nombre } : {}),
          ...(d.color !== undefined ? { color: d.color } : {}),
          ...(d.posicion !== undefined ? { position: d.posicion } : {}),
          ...(d.permisos !== undefined ? { permissions: sanitizePermissionMap(d.permisos as PermissionMap) } : {}),
        })
        .where(eq(roles.id, id))
        .returning();
      if (!r) throw new HttpError(404, "Rol no encontrado");
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "rol_modificado", module: "cuentas", target: r.name, outcome: "ok", ...clientInfo(request), details: { permisos: r.permissions } });
      await avisarCambio(id);
      return { ok: true };
    });

    app.delete("/api/roles/:id", administrar, async (request) => {
      const { id } = idParams.parse(request.params);
      await avisarCambio(id);
      const [r] = await db.delete(roles).where(eq(roles.id, id)).returning({ name: roles.name });
      if (r) await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "rol_borrado", module: "cuentas", target: r.name, outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });

    /** Asigna los roles de una cuenta (también a la maestra, como insignia). */
    app.put("/api/cuentas/:id/roles", administrar, async (request) => {
      const { id } = idParams.parse(request.params);
      const { roles: ids } = z.object({ roles: z.array(z.string().uuid()).max(20) }).parse(request.body);
      const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, id));
      if (!u) throw new HttpError(404, "Cuenta no encontrada");
      const validos = ids.length ? await db.select({ id: roles.id }).from(roles).where(inArray(roles.id, ids)) : [];
      await db.transaction(async (tx) => {
        await tx.delete(userRoles).where(eq(userRoles.userId, id));
        if (validos.length) await tx.insert(userRoles).values(validos.map((r) => ({ userId: id, roleId: r.id })));
      });
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "roles_asignados", module: "cuentas", target: u.email, outcome: "ok", ...clientInfo(request), details: { roles: validos.length } });
      deps.hub.publicar(`usuario:${id}`, { recurso: "me" });
      return { ok: true };
    });
  };
}
