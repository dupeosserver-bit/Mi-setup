import { PGlite } from "@electric-sql/pglite";
import type { PermissionMap } from "@mi-setup/shared";
import { asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { buildApp } from "../src/app.js";
import type { ClienteIa } from "../src/modules/ia/servicio.js";
import type { FabricaMotor, ValidarToken } from "../src/modules/bots-discord/index.js";
import { hashSecret } from "../src/auth/password.js";
import { loadConfig, type Config } from "../src/config.js";
import type { Database } from "../src/db/client.js";
import { MIGRATIONS_DIR } from "../src/db/migrate.js";
import * as schema from "../src/db/schema.js";
import type { Notifier, PushMessage } from "../src/notify/notifier.js";
import { createServerCipher } from "../src/security/crypto.js";

/** Secretos de prueba (no se usan fuera de las pruebas). */
export const TEST_SECRETS = {
  JWT_SECRET: "prueba-jwt-".padEnd(48, "x"),
  SERVER_ENC_KEY: "prueba-cifrado-".padEnd(48, "y"),
};
export const testConfig = loadConfig({ NODE_ENV: "test", ...TEST_SECRETS });
export const testCipher = createServerCipher(TEST_SECRETS.SERVER_ENC_KEY);

/** Postgres embebido (PGlite) con todas las migraciones aplicadas. */
export async function createTestDb(): Promise<{ db: Database; client: PGlite }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db: db as unknown as Database, client };
}

export function memoryNotifier(): Notifier & { sent: PushMessage[] } {
  const sent: PushMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

export async function createTestContext(options: { config?: Config; clienteIa?: ClienteIa; clienteIaLocal?: ClienteIa; fabricaBots?: FabricaMotor; validarTokenBot?: ValidarToken } = {}) {
  const { db, client } = await createTestDb();
  const clock = { now: new Date("2026-03-01T12:00:00.000Z") };
  const notifier = memoryNotifier();
  const { app, auth, deps, preparar, gestorBots } = await buildApp({
    config: options.config ?? testConfig,
    db,
    notifier,
    now: () => clock.now,
    logger: false,
    ...(options.clienteIa ? { clienteIa: options.clienteIa } : {}),
    ...(options.clienteIaLocal ? { clienteIaLocal: options.clienteIaLocal } : {}),
    ...(options.fabricaBots ? { fabricaBots: options.fabricaBots } : {}),
    ...(options.validarTokenBot ? { validarTokenBot: options.validarTokenBot } : {}),
  });
  await preparar();
  return {
    app,
    auth,
    deps,
    gestorBots,
    db,
    clock,
    notifier,
    advance(ms: number) {
      clock.now = new Date(clock.now.getTime() + ms);
    },
    async close() {
      await app.close();
      await client.close();
    },
  };
}

export async function seedUser(
  db: Database,
  input: {
    email: string;
    password: string;
    role?: "maestra" | "usuario";
    totpSecret?: string;
    isActive?: boolean;
    permissions?: PermissionMap;
  },
): Promise<string> {
  const [user] = await db
    .insert(schema.users)
    .values({
      email: input.email,
      displayName: input.email.split("@")[0] ?? "prueba",
      passwordHash: await hashSecret(input.password),
      role: input.role ?? "usuario",
      isActive: input.isActive ?? true,
      totpSecretEnc: input.totpSecret ? testCipher.encrypt(input.totpSecret) : null,
    })
    .returning({ id: schema.users.id });
  if (!user) throw new Error("No se creó el usuario de prueba");
  for (const [module, level] of Object.entries(input.permissions ?? {})) {
    if (level && level !== "ninguno") {
      await db.insert(schema.userModulePermissions).values({ userId: user.id, module, level });
    }
  }
  return user.id;
}

export async function auditRows(db: Database) {
  return db.select().from(schema.auditLog).orderBy(asc(schema.auditLog.id));
}

export function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}
