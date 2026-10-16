import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { createDbAuditWriter } from "./audit/audit.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";

// En local se lee el .env de la raíz del repo si existe. En Docker las
// variables llegan por docker-compose.
const localEnv = fileURLToPath(new URL("../../../.env", import.meta.url));
if (process.env.NODE_ENV !== "production" && existsSync(localEnv)) {
  process.loadEnvFile(localEnv);
}

const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);
const app = await buildApp({ config, audit: createDbAuditWriter(db) });

try {
  await runMigrations(db);
  app.log.info("Migraciones aplicadas");
} catch (err) {
  if (config.isProduction) {
    app.log.fatal({ err }, "No se pudieron aplicar las migraciones");
    process.exit(1);
  }
  app.log.warn({ err }, "Base de datos no disponible: core arranca sin migrar (solo en desarrollo)");
}

await app.listen({ host: config.env.HOST, port: config.env.PORT });

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "Cerrando core");
    void app
      .close()
      .then(() => pool.end())
      .finally(() => process.exit(0));
  });
}
