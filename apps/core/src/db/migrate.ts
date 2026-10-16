import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Database } from "./client.js";

// src/db y dist/db están a la misma profundidad respecto a la carpeta drizzle/.
const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** Aplica las migraciones pendientes. Es idempotente: las ya aplicadas se omiten. */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
