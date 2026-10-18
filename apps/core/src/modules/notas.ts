/**
 * Bloc de notas: notas por cuenta con búsqueda, fijado y sincronización. Las
 * mismas notas se ven como páginas tipo Notion (subpáginas, ícono, casillas) y
 * hay un tablero de tareas (pendiente → haciendo → hecho).
 */
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { notes, tasks } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, sync, type ModuleDeps } from "./common.js";

export const notaSchema = z.object({
  titulo: z.string().trim().max(200).default(""),
  contenido: z.string().max(100_000).default(""),
  fijada: z.boolean().default(false),
  /** Página padre (subpáginas). */
  padre: z.string().uuid().nullable().default(null),
  icono: z.string().max(16).nullable().default(null),
});

const ESTADOS_TAREA = ["pendiente", "haciendo", "hecho"] as const;

function aDto(n: typeof notes.$inferSelect) {
  return {
    id: n.id,
    titulo: n.title,
    contenido: n.content,
    fijada: n.pinned,
    padre: n.parentId,
    icono: n.icon,
    creada: n.createdAt.toISOString(),
    actualizada: n.updatedAt.toISOString(),
  };
}

/** Crear nota (también la usa la IA tras la aprobación del usuario). */
export async function crearNota(deps: ModuleDeps, userId: string, datos: z.input<typeof notaSchema>) {
  const d = notaSchema.parse(datos);
  if (!d.titulo && !d.contenido) throw new HttpError(400, "La nota está vacía");
  if (d.padre) {
    const [padre] = await deps.db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, d.padre), eq(notes.userId, userId)));
    if (!padre) throw new HttpError(404, "La página padre no existe");
  }
  const [n] = await deps.db
    .insert(notes)
    .values({ userId, title: d.titulo, content: d.contenido, pinned: d.fijada, parentId: d.padre, icon: d.icono })
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
          ...(d.icono !== undefined ? { icon: d.icono } : {}),
          ...(d.padre !== undefined && d.padre !== id ? { parentId: d.padre } : {}),
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
      // Las subpáginas suben un nivel (no se borran con la página).
      const [borrada] = await db.delete(notes).where(and(eq(notes.id, id), eq(notes.userId, user.id))).returning({ padre: notes.parentId });
      if (borrada) await db.update(notes).set({ parentId: borrada.padre }).where(and(eq(notes.parentId, id), eq(notes.userId, user.id)));
      sync(deps, user.id, "notas");
      return { ok: true };
    });

    // -------- tablero de tareas
    const tareaDto = (x: typeof tasks.$inferSelect) => ({ id: x.id, titulo: x.title, estado: x.status, nota: x.noteId, posicion: x.position, creada: x.createdAt.toISOString() });

    app.get("/api/tareas", { config: { acceso: { modulo: "notas", nivel: "lectura" } } }, async (request) => {
      const filas = await db.select().from(tasks).where(eq(tasks.userId, currentUser(request).id)).orderBy(asc(tasks.position), asc(tasks.createdAt));
      return filas.map(tareaDto);
    });

    app.post("/api/tareas", { config: { acceso: { modulo: "notas", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const d = z.object({ titulo: z.string().trim().min(1, "Escribe la tarea").max(300), estado: z.enum(ESTADOS_TAREA).default("pendiente"), nota: z.string().uuid().nullable().default(null) }).parse(request.body);
      const [x] = await db.insert(tasks).values({ userId: user.id, title: d.titulo, status: d.estado, noteId: d.nota, position: Date.now() % 2_000_000_000 }).returning();
      if (!x) throw new HttpError(500, "No se pudo guardar");
      sync(deps, user.id, "tareas");
      return tareaDto(x);
    });

    app.patch("/api/tareas/:id", { config: { acceso: { modulo: "notas", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const d = z.object({ titulo: z.string().trim().min(1).max(300).optional(), estado: z.enum(ESTADOS_TAREA).optional() }).parse(request.body);
      const [x] = await db
        .update(tasks)
        .set({ ...(d.titulo !== undefined ? { title: d.titulo } : {}), ...(d.estado !== undefined ? { status: d.estado } : {}) })
        .where(and(eq(tasks.id, id), eq(tasks.userId, user.id)))
        .returning();
      if (!x) throw new HttpError(404, "Tarea no encontrada");
      sync(deps, user.id, "tareas");
      return tareaDto(x);
    });

    app.delete("/api/tareas/:id", { config: { acceso: { modulo: "notas", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, user.id)));
      sync(deps, user.id, "tareas");
      return { ok: true };
    });
  };
}
