/** Avance de los ejercicios de código: qué resolviste y tu último código, por cuenta. */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentUser } from "../security/rbac.js";
import type { ModuleDeps } from "./common.js";
import { getSetting, setSetting } from "./settings.js";

interface Progreso {
  resueltos: Record<string, string>;
  codigos: Record<string, string>;
}

const ID = z.string().regex(/^[a-z0-9-]{1,40}$/);

export function ejerciciosRoutes(deps: ModuleDeps) {
  const clave = (userId: string) => `ejercicios:${userId}`;
  const leer = async (userId: string): Promise<Progreso> => {
    const p = await getSetting<Progreso>(deps.db, clave(userId));
    return { resueltos: p?.resueltos ?? {}, codigos: p?.codigos ?? {} };
  };

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/ejercicios/progreso", { config: { acceso: { modulo: "ejercicios", nivel: "lectura" } } }, async (request) => leer(currentUser(request).id));

    /** Guarda el código de un ejercicio y, si pasó todas las pruebas, lo marca resuelto. */
    app.put("/api/ejercicios/progreso/:id", { config: { acceso: { modulo: "ejercicios", nivel: "lectura" } } }, async (request) => {
      const { id } = z.object({ id: ID }).parse(request.params);
      const d = z.object({ codigo: z.string().max(20_000), resuelto: z.boolean().default(false) }).parse(request.body);
      const user = currentUser(request);
      const p = await leer(user.id);
      p.codigos[id] = d.codigo;
      if (d.resuelto && !p.resueltos[id]) p.resueltos[id] = deps.now().toISOString();
      await setSetting(deps.db, clave(user.id), p, deps.now());
      return { ok: true, resueltos: Object.keys(p.resueltos).length };
    });
  };
}
