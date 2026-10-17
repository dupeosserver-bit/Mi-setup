/**
 * Cuentas y permisos (solo la cuenta maestra) y Registro de actividad.
 * Las cuentas no se borran: se desactivan (la auditoría las referencia).
 * Todo cambio pide reautenticación fuerte y queda auditado.
 */
import { MODULE_IDS, PERMISSION_LEVELS, passwordSchema, sanitizePermissionMap, type PermissionMap } from "@mi-setup/shared";
import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashSecret } from "../auth/password.js";
import { auditLog, sessions, userModulePermissions, userRoles, users } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "./common.js";

const permisosSchema = z.record(z.enum(MODULE_IDS as [string, ...string[]]), z.enum(PERMISSION_LEVELS)).default({});

const nuevaSchema = z.object({
  email: z.string().trim().toLowerCase().email("Correo inválido").max(200),
  nombre: z.string().trim().min(1).max(80),
  password: passwordSchema,
  permisos: permisosSchema,
});

const cambioSchema = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  activo: z.boolean().optional(),
  permisos: permisosSchema.optional(),
});

export function cuentasRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const administrar = { config: { acceso: { modulo: "cuentas" as const, nivel: "administrar" as const, reauth: "fuerte" as const } } };

  async function revocarSesiones(userId: string) {
    await db.update(sessions).set({ revokedAt: deps.now() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  async function guardarPermisos(userId: string, grantedBy: string, permisos: PermissionMap) {
    const limpio = sanitizePermissionMap(permisos);
    await db.transaction(async (tx) => {
      await tx.delete(userModulePermissions).where(eq(userModulePermissions.userId, userId));
      const filas = Object.entries(limpio).map(([module, level]) => ({ userId, module, level: level as Exclude<typeof level, "ninguno" | undefined>, grantedBy, grantedAt: deps.now() }));
      if (filas.length) await tx.insert(userModulePermissions).values(filas);
    });
    return limpio;
  }

  async function cuentaEditable(id: string) {
    const [u] = await db.select().from(users).where(eq(users.id, id));
    if (!u) throw new HttpError(404, "Cuenta no encontrada");
    if (u.role === "maestra") throw new HttpError(403, "La cuenta maestra no se modifica desde aquí");
    return u;
  }

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/cuentas", { config: { acceso: { modulo: "cuentas", nivel: "lectura" } } }, async () => {
      const lista = await db.select().from(users).orderBy(users.createdAt);
      const permisos = await db.select().from(userModulePermissions);
      const asignados = await db.select().from(userRoles);
      const activas = await db
        .select({ userId: sessions.userId, n: sql<number>`count(*)::int` })
        .from(sessions)
        .where(and(isNull(sessions.revokedAt), gte(sessions.expiresAt, deps.now())))
        .groupBy(sessions.userId);
      return lista.map((u) => ({
        id: u.id,
        email: u.email,
        nombre: u.displayName,
        rol: u.role,
        activo: u.isActive,
        dosPasos: Boolean(u.totpSecretEnc),
        sesiones: activas.find((a) => a.userId === u.id)?.n ?? 0,
        creada: u.createdAt.toISOString(),
        permisos: Object.fromEntries(permisos.filter((p) => p.userId === u.id).map((p) => [p.module, p.level])),
        roles: asignados.filter((a) => a.userId === u.id).map((a) => a.roleId),
      }));
    });

    app.post("/api/cuentas", administrar, async (request) => {
      const yo = currentUser(request);
      const d = nuevaSchema.parse(request.body);
      const [existe] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${d.email}`);
      if (existe) throw new HttpError(409, "Ya existe una cuenta con ese correo");
      const [u] = await db
        .insert(users)
        .values({ email: d.email, displayName: d.nombre, passwordHash: await hashSecret(d.password), role: "usuario" })
        .returning({ id: users.id });
      if (!u) throw new HttpError(500, "No se pudo crear la cuenta");
      const permisos = await guardarPermisos(u.id, yo.id, d.permisos as PermissionMap);
      await deps.audit.record({
        actorType: "usuario",
        actorUserId: yo.id,
        action: "cuenta_creada",
        module: "cuentas",
        target: d.email,
        outcome: "ok",
        ...clientInfo(request),
        details: { permisos },
      });
      return { id: u.id, permisos };
    });

    app.patch("/api/cuentas/:id", administrar, async (request) => {
      const yo = currentUser(request);
      const { id } = idParams.parse(request.params);
      const d = cambioSchema.parse(request.body);
      const u = await cuentaEditable(id);
      if (d.nombre !== undefined || d.activo !== undefined) {
        await db
          .update(users)
          .set({ ...(d.nombre !== undefined ? { displayName: d.nombre } : {}), ...(d.activo !== undefined ? { isActive: d.activo } : {}), updatedAt: deps.now() })
          .where(eq(users.id, id));
      }
      // Desactivar corta todas sus sesiones al momento.
      if (d.activo === false) await revocarSesiones(id);
      const permisos = d.permisos ? await guardarPermisos(id, yo.id, d.permisos as PermissionMap) : undefined;
      if (permisos || d.activo !== undefined) deps.hub.publicar(`usuario:${id}`, { recurso: "me" });
      await deps.audit.record({
        actorType: "usuario",
        actorUserId: yo.id,
        action: d.activo === false ? "cuenta_desactivada" : d.activo === true ? "cuenta_activada" : "cuenta_modificada",
        module: "cuentas",
        target: u.email,
        outcome: "ok",
        ...clientInfo(request),
        details: { ...(d.nombre !== undefined ? { nombre: d.nombre } : {}), ...(permisos ? { permisos } : {}) },
      });
      return { ok: true, ...(permisos ? { permisos } : {}) };
    });

    app.post("/api/cuentas/:id/contrasena", administrar, async (request) => {
      const yo = currentUser(request);
      const { id } = idParams.parse(request.params);
      const { password } = z.object({ password: passwordSchema }).parse(request.body);
      const u = await cuentaEditable(id);
      await db.update(users).set({ passwordHash: await hashSecret(password), updatedAt: deps.now() }).where(eq(users.id, id));
      await revocarSesiones(id);
      await deps.audit.record({ actorType: "usuario", actorUserId: yo.id, action: "contrasena_restablecida", module: "cuentas", target: u.email, outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });

    app.post("/api/cuentas/:id/cerrar-sesiones", administrar, async (request) => {
      const yo = currentUser(request);
      const { id } = idParams.parse(request.params);
      const u = await cuentaEditable(id);
      await revocarSesiones(id);
      await deps.audit.record({ actorType: "usuario", actorUserId: yo.id, action: "sesiones_cerradas", module: "cuentas", target: u.email, outcome: "ok", ...clientInfo(request) });
      return { ok: true };
    });

    // ---------------------------------------------------------------- registro de actividad

    const filtroSchema = z.object({
      modulo: z.string().max(40).optional(),
      accion: z.string().max(60).optional(),
      actor: z.enum(["usuario", "ia", "sistema"]).optional(),
      usuario: z.string().uuid().optional(),
      resultado: z.enum(["ok", "denegado", "error"]).optional(),
      desde: z.coerce.date().optional(),
      hasta: z.coerce.date().optional(),
      antesDe: z.coerce.number().int().positive().optional(),
      limite: z.coerce.number().int().min(1).max(500).default(100),
    });

    async function consultar(q: z.infer<typeof filtroSchema>, limite: number) {
      const condiciones = [
        q.modulo ? eq(auditLog.module, q.modulo) : undefined,
        q.accion ? eq(auditLog.action, q.accion) : undefined,
        q.actor ? eq(auditLog.actorType, q.actor) : undefined,
        q.usuario ? eq(auditLog.actorUserId, q.usuario) : undefined,
        q.resultado ? eq(auditLog.outcome, q.resultado) : undefined,
        q.desde ? gte(auditLog.createdAt, q.desde) : undefined,
        q.hasta ? lte(auditLog.createdAt, q.hasta) : undefined,
        q.antesDe ? lt(auditLog.id, q.antesDe) : undefined,
      ].filter((c) => c !== undefined);
      const filas = await db
        .select()
        .from(auditLog)
        .where(condiciones.length ? and(...condiciones) : undefined)
        .orderBy(desc(auditLog.id))
        .limit(limite);
      const ids = [...new Set(filas.map((f) => f.actorUserId).filter((v): v is string => Boolean(v)))];
      const nombres = ids.length ? await db.select({ id: users.id, nombre: users.displayName }).from(users).where(inArray(users.id, ids)) : [];
      const porId = new Map(nombres.map((n) => [n.id, n.nombre]));
      return filas.map((f) => ({
        id: f.id,
        fecha: f.createdAt.toISOString(),
        actor: f.actorType,
        usuario: f.actorUserId ? (porId.get(f.actorUserId) ?? f.actorUserId) : null,
        accion: f.action,
        modulo: f.module,
        objetivo: f.target,
        resultado: f.outcome,
        ip: f.ip,
        detalles: f.details,
      }));
    }

    app.get("/api/auditoria", { config: { acceso: { modulo: "auditoria", nivel: "lectura" } } }, async (request) => {
      const q = filtroSchema.parse(request.query);
      return consultar(q, q.limite);
    });

    app.get("/api/auditoria/acciones", { config: { acceso: { modulo: "auditoria", nivel: "lectura" } } }, async () => {
      const filas = await db.selectDistinct({ accion: auditLog.action }).from(auditLog).orderBy(auditLog.action).limit(300);
      return filas.map((f) => f.accion);
    });

    app.get("/api/auditoria/exportar", { config: { acceso: { modulo: "auditoria", nivel: "lectura", reauth: "fuerte" } } }, async (request, reply) => {
      const q = filtroSchema.parse(request.query);
      const filas = await consultar(q, 10_000);
      const celda = (v: unknown) => {
        const t = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
        // Evita inyección de fórmulas al abrir en Excel.
        const seguro = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
        return `"${seguro.replace(/"/g, '""')}"`;
      };
      const csv = [
        "id,fecha,actor,usuario,accion,modulo,objetivo,resultado,ip,detalles",
        ...filas.map((f) => [f.id, f.fecha, f.actor, f.usuario, f.accion, f.modulo, f.objetivo, f.resultado, f.ip, f.detalles].map(celda).join(",")),
      ].join("\r\n");
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "auditoria_exportada", module: "auditoria", outcome: "ok", details: { filas: filas.length } });
      reply.header("content-type", "text/csv; charset=utf-8").header("content-disposition", 'attachment; filename="actividad.csv"');
      return `\uFEFF${csv}`;
    });
  };
}
