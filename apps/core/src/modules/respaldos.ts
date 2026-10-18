/**
 * Respaldos de la base de Mi Setup: el script del VPS hace un pg_dump diario
 * desde misetup-db; su carpeta se monta en core de solo lectura (BACKUP_DIR)
 * y aquí se muestra el estado. Los respaldos de cada servidor de juego se ven
 * con la API de Pterodactyl (módulo ptero).
 */
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  calendarEvents,
  clipboardItems,
  mediaFiles,
  notes,
  personalBudgets,
  personalMovements,
  promptTemplates,
  reminders,
  shortLinks,
  subscriptions,
  tasks,
  watchlist,
} from "../db/schema.js";
import { HttpError, missingConfig } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, type ModuleDeps } from "./common.js";

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

    /** Descargar un respaldo de la base (tiene los datos de todos: solo la cuenta maestra). */
    app.get(
      "/api/respaldos/base/descargar/:nombre",
      { config: { acceso: { modulo: "respaldos", nivel: "lectura", reauth: "fuerte" } } },
      async (request, reply) => {
        const dir = deps.config.env.BACKUP_DIR;
        if (!dir) throw missingConfig("BACKUP_DIR");
        const user = currentUser(request);
        if (user.role !== "maestra") throw new HttpError(403, "Solo la cuenta maestra puede descargar la base completa");
        const { nombre } = z.object({ nombre: z.string().regex(/^[\w.-]+\.(sql|dump|gz|zst|tar|bak)$/i).max(200) }).parse(request.params);
        const ruta = join(dir, basename(nombre));
        const s = await stat(ruta).catch(() => null);
        if (!s?.isFile()) throw new HttpError(404, "Ese respaldo ya no existe");
        await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "respaldo_descargado", module: "respaldos", target: nombre, outcome: "ok", ...clientInfo(request) });
        return reply
          .header("content-type", "application/octet-stream")
          .header("content-length", String(s.size))
          .header("content-disposition", `attachment; filename="${basename(nombre)}"`)
          .send(createReadStream(ruta));
      },
    );

    /** Todo lo tuyo (notas, finanzas, calendario, enlaces…) en un archivo JSON. */
    app.get("/api/respaldos/mis-datos", { config: { acceso: { autenticado: true, reauth: "pin" } } }, async (request, reply) => {
      const user = currentUser(request);
      const { db } = deps;
      const [notas, tareas, recordatorios, eventos, movimientos, presupuestos, suscripciones, enlaces, portapapeles, prompts, porVer, media] = await Promise.all([
        db.select().from(notes).where(eq(notes.userId, user.id)),
        db.select().from(tasks).where(eq(tasks.userId, user.id)),
        db.select().from(reminders).where(eq(reminders.userId, user.id)),
        db.select().from(calendarEvents).where(eq(calendarEvents.userId, user.id)),
        db.select().from(personalMovements).where(eq(personalMovements.userId, user.id)),
        db.select().from(personalBudgets).where(eq(personalBudgets.userId, user.id)),
        db.select().from(subscriptions).where(eq(subscriptions.userId, user.id)),
        db.select().from(shortLinks).where(eq(shortLinks.userId, user.id)),
        db.select().from(clipboardItems).where(eq(clipboardItems.userId, user.id)),
        db.select().from(promptTemplates).where(eq(promptTemplates.userId, user.id)),
        db.select().from(watchlist).where(eq(watchlist.userId, user.id)),
        db.select({ titulo: mediaFiles.title, tipo: mediaFiles.kind, tamano: mediaFiles.size, creado: mediaFiles.createdAt }).from(mediaFiles).where(eq(mediaFiles.userId, user.id)),
      ]);
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "datos_exportados", module: "respaldos", target: user.email, outcome: "ok", ...clientInfo(request) });
      const fecha = deps.now().toISOString().slice(0, 10);
      return reply
        .header("content-disposition", `attachment; filename="mis-datos-${fecha}.json"`)
        .header("cache-control", "no-store")
        .send({
          app: "Mi Setup",
          exportado: deps.now().toISOString(),
          cuenta: { correo: user.email, nombre: user.displayName },
          notas,
          tareas,
          recordatorios,
          eventos,
          finanzas: { movimientos, presupuestos, suscripciones },
          enlaces,
          portapapeles,
          prompts,
          porVer,
          media,
        });
    });
  };
}
