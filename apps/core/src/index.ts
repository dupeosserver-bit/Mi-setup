import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { abrirBase } from "./db/open.js";
import { loadLocalEnv } from "./env-file.js";
import { startJobs } from "./jobs.js";

loadLocalEnv();

const config = loadConfig();
const base = await abrirBase(config);
const { app, jobs, preparar } = await buildApp({ config, db: base.db });
if (config.env.DB_EMBEBIDA) app.log.warn("Usando Postgres embebido (.data/pglite): solo para desarrollo");

let dbLista = false;
try {
  await base.migrar();
  dbLista = true;
  app.log.info("Migraciones aplicadas");
  await preparar();
} catch (err) {
  if (config.isProduction) {
    app.log.fatal({ err }, "No se pudieron aplicar las migraciones");
    process.exit(1);
  }
  app.log.warn({ err }, "Base de datos no disponible: core arranca sin migrar (solo en desarrollo)");
}

if (!config.env.JWT_SECRET) app.log.warn("Falta configurar: JWT_SECRET (el inicio de sesión no funcionará)");
if (!config.env.SERVER_ENC_KEY) app.log.warn("Falta configurar: SERVER_ENC_KEY (2FA y credenciales no funcionarán)");

await app.listen({ host: config.env.HOST, port: config.env.PORT });

// Sin base de datos (solo desarrollo) las tareas periódicas no tienen sentido.
const detenerJobs = dbLista ? startJobs(jobs, app.log) : () => undefined;

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "Cerrando core");
    detenerJobs();
    void app
      .close()
      .then(() => base.cerrar())
      .finally(() => process.exit(0));
  });
}
