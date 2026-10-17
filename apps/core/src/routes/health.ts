import type { HealthResponse } from "@mi-setup/shared";
import type { FastifyInstance } from "fastify";
import { VERSION } from "../version.js";

/** GET /api/health — sin autenticación, lo usa el script del VPS y Docker. */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/health",
    { config: { acceso: { publico: true } } },
    async (): Promise<HealthResponse> => ({ ok: true, version: VERSION }),
  );
}
