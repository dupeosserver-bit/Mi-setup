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
  integer,
  jsonb,
  numeric,
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
export const reauthMethodEnum = pgEnum("metodo_reauth", ["password", "pin", "biometria"]);
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
    /** Último paso TOTP aceptado (evita reutilizar un código). */
    totpLastStep: bigint("totp_last_step", { mode: "number" }),
    /** Hash Argon2id del PIN de reautenticación (6+ dígitos). */
    pinHash: text("pin_hash"),
    /** Nombre del archivo de avatar en UPLOADS_DIR. */
    avatarPath: text("avatar_path"),
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

/**
 * Sesiones (una por dispositivo con sesión iniciada). El refresh token se
 * rota en cada uso; si llega el anterior (`prev_refresh_hash`) se considera
 * robado y la sesión se revoca.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    refreshHash: text("refresh_hash").notNull(),
    prevRefreshHash: text("prev_refresh_hash"),
    deviceName: text("device_name"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    reauthAt: timestamp("reauth_at", { withTimezone: true }),
    reauthMethod: reauthMethodEnum("reauth_method"),
    reauthFailures: integer("reauth_failures").notNull().default(0),
  },
  (t) => [index("sessions_usuario").on(t.userId)],
);

/** Intentos de inicio de sesión, para el bloqueo temporal. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    email: text("email").notNull(),
    ip: text("ip"),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("login_attempts_email").on(t.email, t.createdAt),
    index("login_attempts_ip").on(t.ip, t.createdAt),
  ],
);

// ---------------------------------------------------------------- Plan 3: equipos y ajustes

export const deviceKind = pgEnum("tipo_dispositivo", ["pc", "celular", "web"]);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: deviceKind("kind").notNull(),
    platform: text("platform"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("devices_usuario").on(t.userId)],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------- Plan 4: biometría, notas, recordatorios, chat

/** Llaves de reautenticación biométrica (una por celular). Solo se guarda el hash. */
export const biometricKeys = pgTable("biometric_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(),
  secretHash: text("secret_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    content: text("content").notNull().default(""),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_usuario").on(t.userId, t.updatedAt)],
);

export const reminderRepeat = pgEnum("repeticion", ["nunca", "diario", "semanal", "mensual"]);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    repeat: reminderRepeat("repeat").notNull().default("nunca"),
    done: boolean("done").notNull().default(false),
    lastFiredAt: timestamp("last_fired_at", { withTimezone: true }),
    createdBy: auditActorType("created_by").notNull().default("usuario"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reminders_pendientes").on(t.done, t.dueAt)],
);

export const chatChannels = pgTable("chat_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** "personal" = canal entre los dispositivos de una misma cuenta. */
  kind: text("kind").notNull().default("grupo"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatMembers = pgTable(
  "chat_members",
  {
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.channelId, t.userId] })],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("texto"),
    body: text("body").notNull(),
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_canal").on(t.channelId, t.createdAt)],
);

// ---------------------------------------------------------------- Plan 5: VPS

export const vpsServers = pgTable("vps_servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull().default(22),
  username: text("username").notNull(),
  /** "llave" (preferida) o "password". */
  authType: text("auth_type").notNull(),
  /** Llave privada o contraseña cifrada con SERVER_ENC_KEY. Nunca sale del servidor. */
  secretEnc: text("secret_enc").notNull(),
  passphraseEnc: text("passphrase_enc"),
  /** Huella SHA256 de la llave del host, aceptada la primera vez (TOFU). */
  hostKeyFingerprint: text("host_key_fingerprint"),
  alerts: boolean("alerts").notNull().default(true),
  ramThreshold: integer("ram_threshold"),
  diskThreshold: integer("disk_threshold"),
  status: text("status").notNull().default("desconocido"),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  lastResourceAlertAt: timestamp("last_resource_alert_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const savedCommands = pgTable("saved_commands", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  command: text("command").notNull(),
  description: text("description").notNull().default(""),
  /** Servidor por defecto (opcional; se puede elegir otro al ejecutar). */
  serverId: uuid("server_id").references(() => vpsServers.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const monitors = pgTable("monitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /** "tcp" (host + puerto) o "http" (URL). */
  kind: text("kind").notNull(),
  target: text("target").notNull(),
  port: integer("port"),
  status: text("status").notNull().default("desconocido"),
  latencyMs: integer("latency_ms"),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  lastChangeAt: timestamp("last_change_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const discordBots = pgTable("discord_bots", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id")
    .notNull()
    .references(() => vpsServers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** "systemd", "pm2" o "docker". */
  kind: text("kind").notNull(),
  target: text("target").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VpsServerRow = typeof vpsServers.$inferSelect;

// ---------------------------------------------------------------- Plan 6: panel y negocio

export const expirations = pgTable("expirations", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** "dominio" (RDAP), "ssl" (certificado TLS) o "vps" (fecha manual). */
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  target: text("target").notNull().default(""),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  notifyDays: integer("notify_days").notNull().default(14),
  lastCheckAt: timestamp("last_check_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  contact: text("contact").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const charges = pgTable(
  "charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    /** Servidor o servicio que se cobra. */
    concept: text("concept").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("MXN"),
    /** "mensual", "trimestral", "anual" o "unico". */
    frequency: text("frequency").notNull(),
    nextDue: timestamp("next_due", { withTimezone: true }).notNull(),
    /** "activo", "pausado", "completado" o "cancelado". */
    status: text("status").notNull().default("activo"),
    lastPaidAt: timestamp("last_paid_at", { withTimezone: true }),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("charges_vencimiento").on(t.status, t.nextDue)],
);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "ingreso" o "gasto". */
    kind: text("kind").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("MXN"),
    category: text("category").notNull(),
    description: text("description").notNull().default(""),
    date: timestamp("date", { withTimezone: true }).notNull(),
    chargeId: uuid("charge_id").references(() => charges.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("transactions_fecha").on(t.date)],
);

export const businessNotes = pgTable("business_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  /** "idea", "en_progreso" o "hecho". */
  status: text("status").notNull().default("idea"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type AuditRow = typeof auditLog.$inferSelect;
