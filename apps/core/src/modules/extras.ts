/**
 * IA creativa (plantillas de prompts y texto de páginas para resumir), Mi casa
 * (prueba de velocidad, cámaras y accesos) y Modo streamer (chat de Kick).
 */
import { randomBytes } from "node:crypto";
import { load } from "cheerio";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promptTemplates } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";
import { descargarTextoSeguro } from "./red-segura.js";
import { getSetting, setSetting } from "./settings.js";

const casaSchema = z.object({
  camaras: z.array(z.object({ nombre: z.string().trim().min(1).max(60), url: z.string().trim().url().max(1000) })).max(20).default([]),
  accesos: z.array(z.object({ nombre: z.string().trim().min(1).max(60), url: z.string().trim().max(1000) })).max(40).default([]),
});

/** Texto legible de una página (sin menús, scripts ni estilos). */
export function textoDePagina(html: string): { titulo: string; texto: string } {
  const $ = load(html);
  $("script, style, noscript, nav, header, footer, aside, form, iframe, svg").remove();
  const titulo = $("title").first().text().trim();
  const raiz = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  const texto = raiz
    .find("h1, h2, h3, p, li")
    .toArray()
    .map((e) => $(e).text().replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 1)
    .join("\n");
  return { titulo, texto: texto.slice(0, 20_000) };
}

export function extrasRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const leer = { config: { acceso: { modulo: "ia_creativa" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "ia_creativa" as const, nivel: "escritura" as const } } };
  const plantilla = z.object({ titulo: z.string().trim().min(1).max(120), cuerpo: z.string().trim().min(1).max(20_000), categoria: z.string().trim().min(1).max(40).default("General") });
  const dto = (p: typeof promptTemplates.$inferSelect) => ({ id: p.id, titulo: p.title, cuerpo: p.body, categoria: p.category });

  return async function (app: FastifyInstance): Promise<void> {
    // ---------------------------------------------------------------- prompts
    app.get("/api/prompts", leer, async (request) =>
      (await db.select().from(promptTemplates).where(eq(promptTemplates.userId, currentUser(request).id)).orderBy(desc(promptTemplates.createdAt))).map(dto),
    );
    app.post("/api/prompts", escribir, async (request) => {
      const d = plantilla.parse(request.body);
      const [p] = await db.insert(promptTemplates).values({ userId: currentUser(request).id, title: d.titulo, body: d.cuerpo, category: d.categoria }).returning();
      if (!p) throw new HttpError(500, "No se pudo guardar");
      return dto(p);
    });
    app.patch("/api/prompts/:id", escribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = plantilla.partial().parse(request.body);
      const [p] = await db
        .update(promptTemplates)
        .set({ ...(d.titulo ? { title: d.titulo } : {}), ...(d.cuerpo ? { body: d.cuerpo } : {}), ...(d.categoria ? { category: d.categoria } : {}) })
        .where(and(eq(promptTemplates.id, id), eq(promptTemplates.userId, currentUser(request).id)))
        .returning();
      if (!p) throw new HttpError(404, "No encontrado");
      return dto(p);
    });
    app.delete("/api/prompts/:id", escribir, async (request) => {
      const { id } = idParams.parse(request.params);
      await db.delete(promptTemplates).where(and(eq(promptTemplates.id, id), eq(promptTemplates.userId, currentUser(request).id)));
      return { ok: true };
    });

    /** Texto de una página web para resumirlo o traducirlo con la IA (descarga segura, sin red interna). */
    app.get("/api/ia-creativa/pagina", leer, async (request) => {
      const { url } = z.object({ url: z.string().trim().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "Solo http o https") }).parse(request.query);
      const r = textoDePagina(await descargarTextoSeguro(url));
      if (r.texto.length < 50) throw new HttpError(422, "No encontré texto en esa página (puede que se arme con JavaScript).");
      return r;
    });

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
