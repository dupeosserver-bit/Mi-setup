/** Creador de sitios y apps: administración + sitios publicados. */
import type { FastifyInstance } from "fastify";
import type { ModuleDeps } from "../common.js";
import type { ClienteIa } from "../ia/servicio.js";
import { servicioComunidad, type OpcionesComunidad } from "./comunidad.js";
import type { DetectorSitios } from "./detector.js";
import { sitiosPublicosRoutes } from "./publico.js";
import { sitiosRoutes } from "./rutas.js";

export { crearDetectorSitios } from "./detector.js";

export function sitiosModule(deps: ModuleDeps, detector: DetectorSitios, clienteIa?: ClienteIa, opcionesComunidad?: Omit<OpcionesComunidad, "deps">) {
  const comunidad = servicioComunidad({ ...opcionesComunidad, deps });
  return async function (app: FastifyInstance): Promise<void> {
    await app.register(sitiosRoutes(deps, detector, clienteIa, comunidad));
    await app.register(sitiosPublicosRoutes(deps, detector, comunidad));
  };
}
