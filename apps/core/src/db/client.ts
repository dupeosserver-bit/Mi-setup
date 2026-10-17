import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema.js";

/** Tipo común para Postgres real (node-postgres) y el embebido de las pruebas (PGlite). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DbHandle {
  readonly db: Database;
  readonly pool: pg.Pool;
}

export function createDb(databaseUrl: string): DbHandle {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  return { db: drizzle(pool, { schema }), pool };
}
