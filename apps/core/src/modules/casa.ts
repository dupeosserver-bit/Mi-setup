/**
 * Mi casa (prueba de velocidad, cámaras y accesos) y Modo streamer (chat de Kick).
 * Solo en la edición personal.
 */
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import type { ModuleDeps } from "./common.js";
import { getSetting, setSetting } from "./settings.js";

const casaSchema = z.object({
  camaras: z.array(z.object({ nombre: z.string().trim().min(1).max(60), url: z.string().trim().url().max(1000) })).max(20).default([]),
  accesos: z.array(z.object({ nombre: z.string().trim().min(1).max(60), url: z.string().trim().max(1000) })).max(40).default([]),
});

export function casaRoutes(deps: ModuleDeps) {
  const { db } = deps;
  return async function (app: FastifyInstance): Promise<void> {
    // ---------------------------------------------------------------- casa
    const casaLeer = { config: { acceso: { modulo: "casa" as const, nivel: "lectura" as const } } };
    const casaEscribir = { config: { acceso: { modulo: "casa" as const, nivel: "escritura" as const } } };

    app.get("/api/casa", casaLeer, async (request) => casaSchema.parse((await getSetting(db, `casa:${currentUser(request).id}`)) ?? {}));
    app.put("/api/casa", casaEscribir, async (request) => {
      const d = casaSchema.parse(request.body);
      await setSetting(db, `casa:${currentUser(request).id}`, d, deps.now());
      return d;
    });

    /** Prueba de velocidad: bajada (bytes aleatorios), subida (se mide lo recibido) y latencia. */
    app.get("/api/casa/velocidad", casaLeer, async (request, reply) => {
      const { mb } = z.object({ mb: z.coerce.number().int().min(1).max(50).default(10) }).parse(request.query);
      const bloque = randomBytes(1024 * 1024);
      const total = mb;
      let enviados = 0;
      const flujo = new (await import("node:stream")).Readable({
        read() {
          if (enviados >= total) return this.push(null);
          enviados++;
          this.push(bloque);
        },
      });
      return reply.header("content-type", "application/octet-stream").header("content-length", String(mb * 1024 * 1024)).header("cache-control", "no-store").send(flujo);
    });
    app.post("/api/casa/velocidad", { ...casaLeer, bodyLimit: 30 * 1024 * 1024 }, async (request) => {
      const cuerpo = request.body;
      const bytes = Buffer.isBuffer(cuerpo) ? cuerpo.length : typeof cuerpo === "string" ? cuerpo.length : 0;
      return { recibidos: bytes };
    });
    if (!app.hasContentTypeParser("application/octet-stream")) {
      app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: 30 * 1024 * 1024 }, (_r, cuerpo, hecho) => hecho(null, cuerpo));
    }
    app.get("/api/casa/ping", casaLeer, async () => ({ ok: true, t: Date.now() }));

    // ---------------------------------------------------------------- streamer
    /** ID del chat de un canal de Kick (para conectarse a su chat en vivo). */
    app.get("/api/streamer/kick/:canal", { config: { acceso: { modulo: "streamer", nivel: "lectura" } } }, async (request) => {
      const { canal } = z.object({ canal: z.string().regex(/^[a-zA-Z0-9_-]{2,40}$/) }).parse(request.params);
      const r = await fetch(`https://kick.com/api/v2/channels/${canal}`, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 MiSetup" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (!r?.ok) throw new HttpError(502, "Kick no respondió (a veces bloquea a los servidores). Intenta de nuevo en un rato.");
      const d = (await r.json()) as { chatroom?: { id?: number }; user?: { username?: string } };
      if (!d.chatroom?.id) throw new HttpError(404, "No encontré ese canal de Kick");
      return { chatroomId: d.chatroom.id, nombre: d.user?.username ?? canal };
    });
  };
}
