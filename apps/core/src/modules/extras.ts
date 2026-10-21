/** IA creativa: plantillas de prompts y texto de páginas para resumir. */
import { load } from "cheerio";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { promptTemplates } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";
import { descargarTextoSeguro } from "./red-segura.js";

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

  };
}
