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
    /** Cuenta eliminada: sin datos personales, oculta y sin acceso; la fila queda por el registro de actividad. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
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
    /** Página padre (notas tipo Notion: páginas dentro de páginas). */
    parentId: uuid("parent_id"),
    /** Emoji o ícono de la página. */
    icon: text("icon"),
    /** Color de la nota (tipo Samsung Notes): nombre de la paleta o null. */
    color: text("color"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_usuario").on(t.userId, t.updatedAt), index("notes_padre").on(t.parentId)],
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
  /** Umbral de CPU (%) medido durante 1 s. */
  cpuThreshold: integer("cpu_threshold"),
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

// ---------------------------------------------------------------- Plan 8: correos temporales y VPN

export const mailAliases = pgTable(
  "mail_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Parte local de la dirección (alias@DOMAIN), en minúsculas. */
    alias: text("alias").notNull(),
    label: text("label").notNull().default(""),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mail_aliases_alias").on(t.alias)],
);

export const mailMessages = pgTable(
  "mail_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aliasId: uuid("alias_id")
      .notNull()
      .references(() => mailAliases.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    from: text("from_addr").notNull(),
    to: text("to_addr").notNull(),
    subject: text("subject").notNull().default(""),
    text: text("text_body").notNull().default(""),
    html: text("html_body"),
    size: integer("size").notNull().default(0),
    saved: boolean("saved").notNull().default(false),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("mail_messages_unico").on(t.aliasId, t.messageId), index("mail_messages_fecha").on(t.receivedAt)],
);

export const vpnDevices = pgTable(
  "vpn_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Nombre del peer en wg0 (también lo usa mi-setup-wg). */
    name: text("name").notNull(),
    /** Solo la llave PÚBLICA: la privada nunca sale del dispositivo. */
    publicKey: text("public_key").notNull(),
    address: text("address").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vpn_devices_nombre").on(t.name)],
);

// ---------------------------------------------------------------- Roles (tipo Discord)

/** Rol con nombre, color y permisos por módulo; los permisos de una cuenta son la suma de los suyos y los de sus roles. */
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#8e8e93"),
  position: integer("position").notNull().default(0),
  permissions: jsonb("permissions").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

// ---------------------------------------------------------------- Plan 11: control remoto

/** Equipos para RustDesk: ID y contraseña (cifrada con SERVER_ENC_KEY). */
export const remoteHosts = pgTable("remote_hosts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  rustdeskId: text("rustdesk_id").notNull(),
  passwordEnc: text("password_enc"),
  deviceId: uuid("device_id").references(() => devices.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------- Plan 10: redes, streams y novedades

/** Cuentas conectadas por OAuth (una por plataforma). Tokens cifrados con SERVER_ENC_KEY. */
export const socialAccounts = pgTable("social_accounts", {
  platform: text("platform").primaryKey(),
  externalId: text("external_id").notNull(),
  accountName: text("account_name").notNull(),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scopes: text("scopes").notNull().default(""),
  connectedBy: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Estados de OAuth en curso (un solo uso, 10 min). Guarda el hash del state y el verificador PKCE cifrado. */
export const oauthStates = pgTable("oauth_states", {
  stateHash: text("state_hash").primaryKey(),
  platform: text("platform").notNull(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  verifierEnc: text("verifier_enc"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/** Vigilante de precios (RAM u otro producto): URL + selector CSS. */
export const priceWatches = pgTable("price_watches", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  selector: text("selector").notNull(),
  active: boolean("active").notNull().default(true),
  lastPrice: numeric("last_price", { precision: 14, scale: 2 }),
  /** Avisar cuando el precio baje a este valor o menos (opcional). */
  targetPrice: numeric("target_price", { precision: 14, scale: 2 }),
  lastText: text("last_text"),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priceHistory = pgTable(
  "price_history",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    watchId: uuid("watch_id")
      .notNull()
      .references(() => priceWatches.id, { onDelete: "cascade" }),
    price: numeric("price", { precision: 14, scale: 2 }).notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [index("price_history_watch").on(t.watchId, t.at)],
);

// ---------------------------------------------------------------- Plan 9: IA asistente

/** Proyectos de la IA (0.11.2b): agrupan chats y tienen instrucciones propias. */
export const aiProjects = pgTable(
  "ai_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    instructions: text("instructions").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_projects_usuario").on(t.userId)],
);

export const aiConversations = pgTable("ai_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Conversación"),
  /** Proyecto al que pertenece (null = suelto). */
  projectId: uuid("project_id").references(() => aiProjects.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Memoria de la IA: cosas que la IA debe recordar de ti en todos los chats. */
export const aiMemories = pgTable(
  "ai_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_memories_usuario").on(t.userId)],
);

/** Skills: instrucciones reutilizables (SKILL.md de Claude o de otras IA). */
export const aiSkills = pgTable(
  "ai_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    content: text("content").notNull(),
    /** claude | otra | propia */
    source: text("source").notNull().default("propia"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_skills_usuario").on(t.userId)],
);

export const aiMessages = pgTable(
  "ai_messages",
  {
    /** Secuencial: define el orden de la conversación. */
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    /** Bloques de contenido tal como los devuelve/recibe la API (solo se agregan, nunca se editan). */
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_messages_conversacion").on(t.conversationId, t.id)],
);

export const aiProposals = pgTable(
  "ai_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => aiConversations.id, { onDelete: "set null" }),
    tool: text("tool").notNull(),
    input: jsonb("input").notNull(),
    description: text("description").notNull(),
    dangerous: boolean("dangerous").notNull().default(false),
    /** "pendiente", "aprobada", "rechazada", "ejecutada" o "fallida". */
    status: text("status").notNull().default("pendiente"),
    result: jsonb("result"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("ai_proposals_estado").on(t.userId, t.status)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("ai_usage_fecha").on(t.createdAt)],
);

// ---------------------------------------------------------------- Plan 7: bóveda (cifrado de extremo a extremo)

/** Parámetros de la bóveda de cada cuenta. El servidor nunca ve la clave maestra. */
export const vault = pgTable("vault", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  salt: text("salt").notNull(),
  /** Parámetros de Argon2id usados en el cliente. */
  kdf: jsonb("kdf").notNull(),
  /** Texto conocido cifrado con la clave derivada (para comprobar la clave maestra). */
  verifier: text("verifier").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vaultItems = pgTable(
  "vault_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "login", "nota" (gestor de contraseñas) o "totp" (autenticador 2FA). */
    kind: text("kind").notNull(),
    /** XChaCha20-Poly1305: v1.<nonce>.<cifrado> en base64url. Todo el contenido (incluida la carpeta) va cifrado. */
    data: text("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("vault_items_usuario").on(t.userId, t.kind)],
);

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

// ---------------------------------------------------------------- versión 0.5

/** Tablero de tareas (pendiente → haciendo → hecho), junto al Bloc de notas. */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("pendiente"),
    noteId: uuid("note_id").references(() => notes.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_usuario").on(t.userId, t.status)],
);

/** Enlaces cortos de tu dominio: /l/<codigo>. */
export const shortLinks = pgTable(
  "short_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    target: text("target").notNull(),
    clicks: integer("clicks").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("short_links_codigo").on(t.code)],
);

/** Archivos compartidos por enlace (tipo Mega / MediaFire). */
export const sharedFiles = pgTable(
  "shared_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    storedName: text("stored_name").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    mime: text("mime").notNull().default("application/octet-stream"),
    passwordHash: text("password_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxDownloads: integer("max_downloads"),
    downloads: integer("downloads").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shared_files_codigo").on(t.code)],
);

/** Portapapeles compartido entre tus equipos (últimos 50). */
export const clipboardItems = pgTable(
  "clipboard_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    device: text("device"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("clipboard_usuario").on(t.userId, t.createdAt)],
);

/** Eventos propios del calendario (los recordatorios y pagos se suman solos). */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(true),
    color: text("color"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calendar_usuario").on(t.userId, t.startsAt)],
);

/** Finanzas personales: movimientos (gasto o ingreso). */
export const personalMovements = pgTable(
  "personal_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    category: text("category").notNull().default("Otros"),
    description: text("description").notNull().default(""),
    occurredOn: text("occurred_on").notNull(),
    /** Tarjeta de la billetera con la que se pagó (opcional). */
    cardId: uuid("card_id").references(() => personalCards.id, { onDelete: "set null" }),
    /** IVA del ticket (para el resumen de impuestos). */
    tax: numeric("tax", { precision: 14, scale: 2 }),
    /** Foto del ticket (archivo en ARCHIVOS_DIR/tickets/<usuario>/). */
    receipt: text("receipt"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("movimientos_usuario").on(t.userId, t.occurredOn)],
);

/** Presupuesto mensual por categoría. */
export const personalBudgets = pgTable(
  "personal_budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    monthlyLimit: numeric("monthly_limit", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [uniqueIndex("presupuesto_categoria").on(t.userId, t.category)],
);

/** Suscripciones (Netflix, Spotify, el VPS…), con aviso antes del cobro. */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("MXN"),
    cycle: text("cycle").notNull().default("mensual"),
    nextCharge: text("next_charge").notNull(),
    category: text("category").notNull().default("Suscripciones"),
    remindDays: integer("remind_days").notNull().default(2),
    lastRemindedFor: text("last_reminded_for"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("suscripciones_usuario").on(t.userId)],
);

/** Plantillas de prompts (IA creativa). */
export const promptTemplates = pgTable(
  "prompt_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    category: text("category").notNull().default("General"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("prompts_usuario").on(t.userId)],
);

/** Películas y series "por ver" (datos de TMDB). */
export const watchlist = pgTable(
  "watchlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: text("media_type").notNull(),
    title: text("title").notNull(),
    poster: text("poster"),
    seen: boolean("seen").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watchlist_unico").on(t.userId, t.mediaType, t.tmdbId)],
);

/** Tu música y tus videos subidos al VPS. */
export const mediaFiles = pgTable(
  "media_files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    storedName: text("stored_name").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    mime: text("mime").notNull(),
    /** Segundos vistos (para "seguir viendo"). */
    progress: integer("progress").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("media_usuario").on(t.userId, t.kind)],
);

// ---------------------------------------------------------------- sitios web (creador)

/** Sitio o app hecho con el creador. El borrador y lo publicado van separados. */
export const sites = pgTable(
  "sites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    customDomain: text("custom_domain"),
    /** Proyecto del editor (páginas, componentes y estilos). */
    draft: jsonb("draft").notNull().default({}),
    /** Lo publicado: { páginas: [{ ruta, titulo, html, css, privada }] }. */
    published: jsonb("published"),
    /** Título, descripción, ícono, WhatsApp, colores, app instalable… */
    settings: jsonb("settings").notNull().default({}),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sites_slug").on(t.slug), uniqueIndex("sites_dominio").on(t.customDomain)],
);

/** Historial de publicaciones (para regresar a una anterior). */
export const siteVersions = pgTable(
  "site_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    draft: jsonb("draft").notNull(),
    published: jsonb("published").notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_versions_sitio").on(t.siteId, t.createdAt)],
);

/** Otras cuentas de Mi Setup que pueden editar un sitio. */
export const siteEditors = pgTable(
  "site_editors",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.userId] })],
);

/** Formularios y pedidos que llegan desde el sitio publicado. */
export const siteEntries = pgTable(
  "site_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    form: text("form").notNull().default(""),
    data: jsonb("data").notNull(),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_entries_sitio").on(t.siteId, t.createdAt)],
);

/** Tablas de datos tipo Excel que el sitio muestra solo (productos, precios…). */
export const siteTables = pgTable(
  "site_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    columns: jsonb("columns").notNull().default([]),
    rows: jsonb("rows").notNull().default([]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("site_tables_nombre").on(t.siteId, t.name)],
);

/** Cuentas de visitantes del sitio (área privada). */
export const siteMembers = pgTable(
  "site_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("site_members_correo").on(t.siteId, t.email)],
);

/** Estadísticas privadas: visitas por día y página, y clics en botones. */
export const siteStats = pgTable(
  "site_stats",
  {
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    day: text("day").notNull(),
    kind: text("kind").notNull(),
    key: text("key").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.siteId, t.day, t.kind, t.key] })],
);

/** Imágenes y archivos del sitio (guardados en ARCHIVOS_DIR/sitios). */
export const siteAssets = pgTable(
  "site_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    storedName: text("stored_name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_assets_sitio").on(t.siteId)],
);

// ---------------------------------------------------------------- versión 0.10: billetera, notas con adjuntos y bots de Discord

/** Billetera de Mis finanzas: solo apodo y últimos 4 dígitos; las tarjetas de prueba usan números públicos de pruebas. */
export const personalCards = pgTable(
  "personal_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    brand: text("brand").notNull().default("otra"),
    last4: text("last4").notNull(),
    /** "real" (solo se guardan los últimos 4) o "prueba" (número público de pruebas). */
    kind: text("kind").notNull().default("real"),
    color: text("color").notNull().default("#6d28d9"),
    bank: text("bank").notNull().default(""),
    testNumber: text("test_number"),
    expiry: text("expiry"),
    cvv: text("cvv"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tarjetas_usuario").on(t.userId)],
);

/** Imágenes y archivos adjuntos de una nota (guardados en ARCHIVOS_DIR/notas). */
export const noteAttachments = pgTable(
  "note_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    storedName: text("stored_name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("note_attachments_nota").on(t.noteId)],
);

/** Bots de Discord que Mi Setup mantiene encendidos (creador estilo BotGhost). El token va cifrado. */
export const hostedBots = pgTable(
  "hosted_bots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Cliente al que se le vende el bot (opcional, solo para recordar). */
    clientName: text("client_name").notNull().default(""),
    tokenEnc: text("token_enc").notNull(),
    applicationId: text("application_id"),
    botName: text("bot_name"),
    /** Configuración de todos los módulos (bienvenida, niveles, tickets…). */
    config: jsonb("config").notNull().default({}),
    /** Si debe estar encendido (se reconecta solo al reiniciar Mi Setup). */
    enabled: boolean("enabled").notNull().default(false),
    /** Vencimiento del servicio: al llegar la fecha el bot se apaga solo. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Hash SHA-256 del enlace para que el dueño del bot lo configure. */
    shareHash: text("share_hash"),
    shareEnabled: boolean("share_enabled").notNull().default(false),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("hosted_bots_dueno").on(t.ownerId), uniqueIndex("hosted_bots_enlace").on(t.shareHash)],
);

/** Niveles y monedas de cada miembro de cada servidor de Discord (por bot). */
export const botMembers = pgTable(
  "bot_members",
  {
    botId: uuid("bot_id")
      .notNull()
      .references(() => hostedBots.id, { onDelete: "cascade" }),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    xp: integer("xp").notNull().default(0),
    level: integer("level").notNull().default(0),
    messages: integer("messages").notNull().default(0),
    coins: bigint("coins", { mode: "number" }).notNull().default(0),
    bank: bigint("bank", { mode: "number" }).notNull().default(0),
    dailyAt: timestamp("daily_at", { withTimezone: true }),
    workAt: timestamp("work_at", { withTimezone: true }),
    lastXpAt: timestamp("last_xp_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.botId, t.guildId, t.userId] })],
);

/** Advertencias de moderación. */
export const botWarns = pgTable(
  "bot_warns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => hostedBots.id, { onDelete: "cascade" }),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    modId: text("mod_id").notNull(),
    reason: text("reason").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("bot_warns_miembro").on(t.botId, t.guildId, t.userId)],
);

/** Tickets abiertos con el panel de tickets. */
export const botTickets = pgTable(
  "bot_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    botId: uuid("bot_id")
      .notNull()
      .references(() => hostedBots.id, { onDelete: "cascade" }),
    guildId: text("guild_id").notNull(),
    channelId: text("channel_id").notNull(),
    userId: text("user_id").notNull(),
    number: integer("number").notNull(),
    status: text("status").notNull().default("abierto"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [index("bot_tickets_bot").on(t.botId, t.guildId)],
);

/** Estudio creativo: proyectos del editor de fotos, imágenes exportadas y videos terminados (archivos en ARCHIVOS_DIR/estudio). */
export const studioProjects = pgTable(
  "studio_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "foto" (proyecto con capas), "imagen" (exportada) o "video". */
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    storedName: text("stored_name").notNull(),
    mime: text("mime").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    /** Miniatura pequeña (data:image/…) para la galería. */
    thumb: text("thumb").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("studio_usuario").on(t.userId, t.kind, t.updatedAt)],
);

// ---------------------------------------------------------------- 0.11: pagos divididos

/** Personas con las que divides pagos (Netflix entre 4, la renta…). */
export const financePeople = pgTable(
  "finance_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contact: text("contact").notNull().default(""),
    /** Enlace para cobrarle (0.11.2b): hash para buscarlo y cifrado para volver a copiarlo. */
    shareTokenHash: text("share_token_hash"),
    shareTokenEnc: text("share_token_enc"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("finance_people_nombre").on(t.userId, t.name), uniqueIndex("finance_people_enlace").on(t.shareTokenHash)],
);

/** Un pago que se divide: total, cada cuánto y la próxima fecha de cobro. */
export const financeSplits = pgTable(
  "finance_splits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    total: numeric("total", { precision: 14, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("MXN"),
    /** unico | semanal | mensual | anual */
    cycle: text("cycle").notNull().default("mensual"),
    /** Próxima fecha que todavía no tiene cobros generados (AAAA-MM-DD). */
    nextDue: text("next_due").notNull(),
    notes: text("notes").notNull().default(""),
    active: boolean("active").notNull().default(true),
    /** Cómo se reparte (0.11.2b): igual | monto | porcentaje. */
    splitMode: text("split_mode").notNull().default("monto"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("finance_splits_usuario").on(t.userId)],
);

/** Cuánto le toca a cada persona de un pago dividido. */
export const financeSplitMembers = pgTable(
  "finance_split_members",
  {
    splitId: uuid("split_id")
      .notNull()
      .references(() => financeSplits.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => financePeople.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    /** Porcentaje del total cuando el pago se reparte por porcentaje. */
    percent: numeric("percent", { precision: 6, scale: 3 }),
  },
  (t) => [primaryKey({ columns: [t.splitId, t.personId] })],
);

/** Cada cobro de cada periodo: se marca pagado; si pasa la fecha queda «debe». */
export const financeSplitCharges = pgTable(
  "finance_split_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    splitId: uuid("split_id")
      .notNull()
      .references(() => financeSplits.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => financePeople.id, { onDelete: "cascade" }),
    dueOn: text("due_on").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("finance_cargo_unico").on(t.splitId, t.personId, t.dueOn), index("finance_cargos_persona").on(t.personId, t.dueOn)],
);

// ---------------------------------------------------------------- 0.11: notas compartidas

/** Enlace de solo lectura a una nota (el token se guarda cifrado para volver a copiarlo). */
export const noteShares = pgTable(
  "note_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    tokenCifrado: text("token_cifrado").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("note_shares_token").on(t.tokenHash), uniqueIndex("note_shares_nota").on(t.noteId)],
);

// ---------------------------------------------------------------- 0.11: cuentas de Google (Ciberseguridad)

/** Cuentas de Gmail conectadas por cada persona (pueden ser varias). Tokens cifrados con SERVER_ENC_KEY. */
export const googleAccounts = pgTable(
  "google_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("google_accounts_correo").on(t.userId, t.email)],
);
