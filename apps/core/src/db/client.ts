import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import { MIGRATIONS_DIR } from "./migrate.js";
import * as schema from "./schema.js";

/** Tipo común para Postgres real (node-postgres) y el embebido (PGlite). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  readonly db: Database;
  /** Aplica las migraciones pendientes (idempotente). */
  migrar(): Promise<void>;
  cerrar(): Promise<void>;
}

export function createDb(databaseUrl: string): DbHandle {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle(pool, { schema });
  return {
    db,
    migrar: () => migrate(db, { migrationsFolder: MIGRATIONS_DIR }),
    cerrar: () => pool.end(),
  };
}

/**
 * Solo desarrollo (DB_EMBEBIDA=1): Postgres embebido en una carpeta local,
 * para probar la app sin Docker. Nunca se usa en producción.
 */
export async function createEmbeddedDb(dir: string): Promise<DbHandle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzleLite } = await import("drizzle-orm/pglite");
  const { migrate: migrateLite } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(dir);
  const db = drizzleLite(client, { schema });
  return {
    db: db as unknown as Database,
    migrar: () => migrateLite(db, { migrationsFolder: MIGRATIONS_DIR }),
    cerrar: () => client.close(),
  };
}
