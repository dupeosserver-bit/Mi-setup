import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { loadLocalEnv } from "./env-file.js";

loadLocalEnv();

const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);
const { app, auth } = await buildApp({ config, db });

let dbLista = false;
try {
  await runMigrations(pool);
  dbLista = true;
  app.log.info("Migraciones aplicadas");
} catch (err) {
  if (config.isProduction) {
    app.log.fatal({ err }, "No se pudieron aplicar las migraciones");
    process.exit(1);
  }
  app.log.warn({ err }, "Base de datos no disponible: core arranca sin migrar (solo en desarrollo)");
}

if (!config.env.JWT_SECRET) app.log.warn("Falta configurar: JWT_SECRET (el inicio de sesión no funcionará)");
if (!config.env.SERVER_ENC_KEY) app.log.warn("Falta configurar: SERVER_ENC_KEY (2FA no funcionará)");

await app.listen({ host: config.env.HOST, port: config.env.PORT });

// Limpieza diaria de intentos de login y sesiones viejas.
const limpiar = () => auth.purge().catch((err: unknown) => app.log.warn({ err }, "Falló la limpieza de sesiones"));
if (dbLista) void limpiar();
setInterval(limpiar, 24 * 60 * 60 * 1000).unref();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "Cerrando core");
    void app
      .close()
      .then(() => pool.end())
      .finally(() => process.exit(0));
  });
}
