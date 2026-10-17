import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type pg from "pg";

// src/db y dist/db están a la misma profundidad respecto a la carpeta drizzle/.
export const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

/** Aplica las migraciones pendientes. Es idempotente: las ya aplicadas se omiten. */
export async function runMigrations(pool: pg.Pool): Promise<void> {
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
}
