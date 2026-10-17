import { fileURLToPath } from "node:url";
import type { Config } from "../config.js";
import { createDb, createEmbeddedDb, type DbHandle } from "./client.js";

/** Abre la base: Postgres real, o el embebido si DB_EMBEBIDA=1 (solo desarrollo). */
export async function abrirBase(config: Config): Promise<DbHandle> {
  if (config.env.DB_EMBEBIDA) {
    return createEmbeddedDb(fileURLToPath(new URL("../../../../.data/pglite", import.meta.url)));
  }
  return createDb(config.databaseUrl);
}
