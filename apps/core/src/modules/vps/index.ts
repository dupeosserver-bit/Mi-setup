/** Módulo VPS: servidores, terminal, rendimiento, alertas, comandos y archivos (los bots se registran en personales.ts). */
import type { FastifyInstance } from "fastify";
import type { Job } from "../../jobs.js";
import type { ModuleDeps } from "../common.js";
import { alertasRoutes, revisarAlertas } from "./alertas.js";
import { archivosRoutes } from "./archivos.js";
import { archivosExtraRoutes } from "./archivos-extra.js";
import { agentesRoutes } from "./agentes.js";
import { comandosRoutes } from "./comandos.js";
import { historialRoutes } from "./historial.js";
import { registrarMetricasVps } from "./metricas.js";
import { Servidores, servidoresRoutes } from "./servidores.js";
import { energiaRoutes } from "./energia.js";
import { seguridadRoutes } from "./seguridad.js";
import { registrarTerminal } from "./terminal.js";

export function vpsModule(deps: ModuleDeps) {
  const servidores = new Servidores(deps);
  registrarTerminal(deps, servidores);
  registrarMetricasVps(deps, servidores);

  const jobs: Job[] = [{ nombre: "alertas-vps", cadaMs: 60_000, alInicio: true, run: () => revisarAlertas(deps, servidores) }];

  async function routes(app: FastifyInstance): Promise<void> {
    await app.register(servidoresRoutes(deps, servidores));
    await app.register(alertasRoutes(deps));
    await app.register(comandosRoutes(deps, servidores));
    await app.register(historialRoutes(deps));
    await app.register(archivosRoutes(deps, servidores));
    await app.register(archivosExtraRoutes(deps, servidores));
    await app.register(seguridadRoutes(deps, servidores));
    await app.register(energiaRoutes(deps, servidores));
    await app.register(agentesRoutes(deps, servidores));
  }

  return { servidores, jobs, routes };
}
