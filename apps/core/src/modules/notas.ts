/** Bloc de notas: notas por cuenta con búsqueda, fijado y sincronización. */
import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notes } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, sync, type ModuleDeps } from "./common.js";

export const notaSchema = z.object({
  titulo: z.string().trim().max(200).default(""),
  contenido: z.string().max(100_000).default(""),
  fijada: z.boolean().default(false),
});

function aDto(n: typeof notes.$inferSelect) {
  return {
    id: n.id,
    titulo: n.title,
    contenido: n.content,
    fijada: n.pinned,
    creada: n.createdAt.toISOString(),
    actualizada: n.updatedAt.toISOString(),
  };
}

/** Crear nota (también la usa la IA tras la aprobación del usuario). */
export async function crearNota(deps: ModuleDeps, userId: string, datos: z.input<typeof notaSchema>) {
  const d = notaSchema.parse(datos);
  if (!d.titulo && !d.contenido) throw new HttpError(400, "La nota está vacía");
  const [n] = await deps.db
    .insert(notes)
    .values({ userId, title: d.titulo, content: d.contenido, pinned: d.fijada })
    .returning();
  if (!n) throw new HttpError(500, "No se pudo guardar la nota");
  sync(deps, userId, "notas");
  return aDto(n);
}

export function notasRoutes(deps: ModuleDeps) {
  const { db } = deps;
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/notas", { config: { acceso: { modulo: "notas", nivel: "lectura" } } }, async (request) => {
      const user = currentUser(request);
      const { q } = z.object({ q: z.string().trim().max(200).optional() }).parse(request.query);
      const filtro = q
        ? and(eq(notes.userId, user.id), or(ilike(notes.title, `%${q}%`), ilike(notes.content, `%${q}%`)))
        : eq(notes.userId, user.id);
      const filas = await db.select().from(notes).where(filtro).orderBy(desc(notes.pinned), desc(notes.updatedAt)).limit(500);
      return filas.map(aDto);
    });

    app.post("/api/notas", { config: { acceso: { modulo: "notas", nivel: "escritura" } } }, async (request) =>
      crearNota(deps, currentUser(request).id, request.body as z.input<typeof notaSchema>),
    );

    app.patch("/api/notas/:id", { config: { acceso: { modulo: "notas", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const d = notaSchema.partial().parse(request.body);
      const [n] = await db
        .update(notes)
        .set({
          ...(d.titulo !== undefined ? { title: d.titulo } : {}),
          ...(d.contenido !== undefined ? { content: d.contenido } : {}),
          ...(d.fijada !== undefined ? { pinned: d.fijada } : {}),
          updatedAt: deps.now(),
        })
        .where(and(eq(notes.id, id), eq(notes.userId, user.id)))
        .returning();
      if (!n) throw new HttpError(404, "Nota no encontrada");
      sync(deps, user.id, "notas");
      return aDto(n);
    });

    app.delete("/api/notas/:id", { config: { acceso: { modulo: "notas", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await db.delete(notes).where(and(eq(notes.id, id), eq(notes.userId, user.id)));
      sync(deps, user.id, "notas");
      return { ok: true };
    });
  };
}
