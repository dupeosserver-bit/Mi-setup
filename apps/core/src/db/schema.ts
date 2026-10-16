/**
 * Esquema de base de datos (Drizzle). Tras cambiarlo, genera la migración con
 * `pnpm --filter @mi-setup/core db:generate`.
 *
 * Este archivo no importa de @mi-setup/shared para que drizzle-kit lo pueda
 * cargar sin compilar el monorepo; los valores de los enums deben coincidir
 * con ROLES, PERMISSION_LEVELS, AUDIT_ACTOR_TYPES y AUDIT_OUTCOMES de shared.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("rol_usuario", ["maestra", "usuario"]);
/** "ninguno" no se guarda: la ausencia de fila equivale a sin acceso. */
export const permissionLevel = pgEnum("nivel_permiso", ["lectura", "escritura", "administrar"]);
export const auditActorType = pgEnum("tipo_actor", ["usuario", "ia", "sistema"]);
export const auditOutcome = pgEnum("resultado_auditoria", [
  "ok",
  "denegado",
  "error",
  "propuesto",
  "aprobado",
  "rechazado",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    /** Hash Argon2id (fase 2). Nunca la contraseña en claro. */
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("usuario"),
    isActive: boolean("is_active").notNull().default(true),
    /** Secreto TOTP de la app, cifrado con SERVER_ENC_KEY (fase 2). */
    totpSecretEnc: text("totp_secret_enc"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unico").on(sql`lower(${t.email})`),
    // Solo puede existir una cuenta maestra.
    uniqueIndex("users_una_maestra").on(t.role).where(sql`${t.role} = 'maestra'`),
  ],
);

export const userModulePermissions = pgTable(
  "user_module_permissions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Identificador de módulo (ModuleId de shared), validado con Zod al escribir. */
    module: text("module").notNull(),
    level: permissionLevel("level").notNull(),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.module] })],
);

/**
 * Registro de auditoría. Inmutable: un trigger en la base de datos rechaza
 * UPDATE, DELETE y TRUNCATE (ver migración 0001).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    actorType: auditActorType("actor_type").notNull(),
    /** Sin ON DELETE: las cuentas con historial se desactivan, no se borran. */
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    module: text("module"),
    target: text("target"),
    outcome: auditOutcome("outcome").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    details: jsonb("details").notNull().default({}),
  },
  (t) => [
    index("audit_log_fecha").on(t.createdAt.desc()),
    index("audit_log_actor").on(t.actorUserId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;
