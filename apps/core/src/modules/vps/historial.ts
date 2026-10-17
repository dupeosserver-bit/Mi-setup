/**
 * Historial de comandos de la terminal (por cuenta, sincronizado entre
 * dispositivos). Se guarda cifrado con SERVER_ENC_KEY porque un comando puede
 * llevar datos sensibles. Máximo 300 entradas; las más viejas se descartan.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentUser } from "../../security/rbac.js";
import { requireCipher, type ModuleDeps } from "../common.js";
import { deleteSetting, getSetting, setSetting } from "../settings.js";

const MAX = 300;

export interface EntradaHistorial {
  servidorId: string;
  comando: string;
  fecha: string;
}

const clave = (userId: string) => `historial-terminal:${userId}`;

async function leer(deps: ModuleDeps, userId: string): Promise<EntradaHistorial[]> {
  const guardado = await getSetting<{ cifrado: string }>(deps.db, clave(userId));
  if (!guardado?.cifrado) return [];
  try {
    return JSON.parse(requireCipher(deps).decrypt(guardado.cifrado)) as EntradaHistorial[];
  } catch {
    return [];
  }
}

async function escribir(deps: ModuleDeps, userId: string, lista: EntradaHistorial[]): Promise<void> {
  await setSetting(deps.db, clave(userId), { cifrado: requireCipher(deps).encrypt(JSON.stringify(lista.slice(0, MAX))) }, deps.now());
}

export function historialRoutes(deps: ModuleDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/vps/historial", { config: { acceso: { modulo: "vps_terminal", nivel: "lectura" } } }, async (request) => {
      const { servidorId } = z.object({ servidorId: z.string().uuid().optional() }).parse(request.query);
      const lista = await leer(deps, currentUser(request).id);
      return servidorId ? lista.filter((e) => e.servidorId === servidorId) : lista;
    });

    app.post("/api/vps/historial", { config: { acceso: { modulo: "vps_terminal", nivel: "lectura" } } }, async (request) => {
      const user = currentUser(request);
      const d = z.object({ servidorId: z.string().uuid(), comando: z.string().trim().min(1).max(2000) }).parse(request.body);
      const lista = await leer(deps, user.id);
      // Sin duplicados seguidos: el mismo comando repetido sube al principio.
      const resto = lista.filter((e) => !(e.servidorId === d.servidorId && e.comando === d.comando));
      await escribir(deps, user.id, [{ ...d, fecha: deps.now().toISOString() }, ...resto]);
      return { ok: true };
    });

    app.delete("/api/vps/historial", { config: { acceso: { modulo: "vps_terminal", nivel: "lectura" } } }, async (request) => {
      await deleteSetting(deps.db, clave(currentUser(request).id));
      return { ok: true };
    });
  };
}
