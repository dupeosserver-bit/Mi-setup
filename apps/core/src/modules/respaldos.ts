/**
 * Respaldos de la base de Mi Setup: el script del VPS hace un pg_dump diario
 * desde misetup-db; su carpeta se monta en core de solo lectura (BACKUP_DIR)
 * y aquí se muestra el estado. Los respaldos de cada servidor de juego se ven
 * con la API de Pterodactyl (módulo ptero).
 */
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { missingConfig } from "../http-error.js";
import type { ModuleDeps } from "./common.js";

export function respaldosRoutes(deps: ModuleDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/respaldos/base", { config: { acceso: { modulo: "respaldos", nivel: "lectura" } } }, async () => {
      const dir = deps.config.env.BACKUP_DIR;
      if (!dir) throw missingConfig("BACKUP_DIR");
      let nombres: string[];
      try {
        nombres = await readdir(dir);
      } catch {
        throw missingConfig("BACKUP_DIR");
      }
      const archivos = await Promise.all(
        nombres
          .filter((n) => /\.(sql|dump|gz|zst|tar|bak)$/i.test(n))
          .map(async (nombre) => {
            const s = await stat(join(dir, nombre));
            return { nombre, bytes: s.size, fecha: s.mtime.toISOString() };
          }),
      );
      archivos.sort((a, b) => b.fecha.localeCompare(a.fecha));
      const ultimo = archivos[0] ?? null;
      const horas = ultimo ? (deps.now().getTime() - new Date(ultimo.fecha).getTime()) / 3_600_000 : null;
      return { archivos: archivos.slice(0, 60), ultimo, alDia: horas !== null && horas < 26 };
    });
  };
}
