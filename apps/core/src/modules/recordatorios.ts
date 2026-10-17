/**
 * Recordatorios con fecha, hora y repetición. Una tarea revisa cada 30 s los
 * vencidos: envía aviso push (ntfy) a todos los dispositivos y avisa por el
 * WebSocket para la notificación local. Los repetidos pasan a la siguiente fecha.
 */
import { and, asc, desc, eq, gt, isNull, lte, or } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { reminders } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";

export const REPETICIONES = ["nunca", "diario", "semanal", "mensual"] as const;
export type Repeticion = (typeof REPETICIONES)[number];

export const recordatorioSchema = z.object({
  titulo: z.string().trim().min(1, "Escribe un título").max(200),
  notas: z.string().max(2000).default(""),
  fecha: z.coerce.date(),
  repeticion: z.enum(REPETICIONES).default("nunca"),
});

function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

/** Siguiente fecha estrictamente posterior a `ahora` según la repetición. */
export function siguienteFecha(fecha: Date, repeticion: Repeticion, ahora: Date): Date | null {
  if (repeticion === "nunca") return null;
  let d = new Date(fecha);
  let n = 0;
  while (d <= ahora && n++ < 10_000) {
    if (repeticion === "diario") d = new Date(d.getTime() + 86_400_000);
    else if (repeticion === "semanal") d = new Date(d.getTime() + 7 * 86_400_000);
    else d = sumarMeses(d, 1);
  }
  return d;
}

function aDto(r: typeof reminders.$inferSelect) {
  return {
    id: r.id,
    titulo: r.title,
    notas: r.notes,
    fecha: r.dueAt.toISOString(),
    repeticion: r.repeat,
    completado: r.done,
    avisado: r.lastFiredAt?.toISOString() ?? null,
    creadoPor: r.createdBy,
  };
}

function avisarCambio(deps: ModuleDeps, userId: string, aviso?: { titulo: string; cuerpo: string }) {
  deps.hub.publicar(`usuario:${userId}`, { recurso: "recordatorios", ...(aviso ? { aviso } : {}) });
}

export async function crearRecordatorio(
  deps: ModuleDeps,
  userId: string,
  datos: z.input<typeof recordatorioSchema>,
  creadoPor: "usuario" | "ia" = "usuario",
) {
  const d = recordatorioSchema.parse(datos);
  const [r] = await deps.db
    .insert(reminders)
    .values({ userId, title: d.titulo, notes: d.notas, dueAt: d.fecha, repeat: d.repeticion, createdBy: creadoPor })
    .returning();
  if (!r) throw new HttpError(500, "No se pudo crear el recordatorio");
  avisarCambio(deps, userId);
  return aDto(r);
}

/** Envía los recordatorios vencidos. Devuelve cuántos se avisaron. */
export async function dispararRecordatorios(deps: ModuleDeps): Promise<number> {
  const ahora = deps.now();
  const vencidos = await deps.db
    .select()
    .from(reminders)
    .where(and(eq(reminders.done, false), lte(reminders.dueAt, ahora), or(isNull(reminders.lastFiredAt), lte(reminders.lastFiredAt, reminders.dueAt))))
    .limit(100);
  for (const r of vencidos) {
    const siguiente = siguienteFecha(r.dueAt, r.repeat, ahora);
    await deps.db
      .update(reminders)
      .set({ lastFiredAt: ahora, ...(siguiente ? { dueAt: siguiente } : {}) })
      .where(eq(reminders.id, r.id));
    await deps.notifier.send({ title: `Recordatorio: ${r.title}`, message: r.notes || r.title, priority: 4, tags: ["bell"] });
    avisarCambio(deps, r.userId, { titulo: r.title, cuerpo: r.notes || "Recordatorio" });
  }
  return vencidos.length;
}

export function recordatoriosRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const dueño = (id: string, userId: string) => and(eq(reminders.id, id), eq(reminders.userId, userId));

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/recordatorios", { config: { acceso: { modulo: "recordatorios", nivel: "lectura" } } }, async (request) => {
      const user = currentUser(request);
      const { proximos } = z.object({ proximos: z.string().optional() }).parse(request.query);
      if (proximos) {
        const filas = await db
          .select()
          .from(reminders)
          .where(and(eq(reminders.userId, user.id), eq(reminders.done, false), gt(reminders.dueAt, deps.now())))
          .orderBy(asc(reminders.dueAt))
          .limit(10);
        return filas.map(aDto);
      }
      const filas = await db
        .select()
        .from(reminders)
        .where(eq(reminders.userId, user.id))
        .orderBy(asc(reminders.done), asc(reminders.dueAt), desc(reminders.createdAt))
        .limit(500);
      return filas.map(aDto);
    });

    app.post("/api/recordatorios", { config: { acceso: { modulo: "recordatorios", nivel: "escritura" } } }, async (request) =>
      crearRecordatorio(deps, currentUser(request).id, request.body as z.input<typeof recordatorioSchema>),
    );

    app.patch("/api/recordatorios/:id", { config: { acceso: { modulo: "recordatorios", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const d = recordatorioSchema.partial().extend({ completado: z.boolean().optional() }).parse(request.body);
      const [r] = await db
        .update(reminders)
        .set({
          ...(d.titulo !== undefined ? { title: d.titulo } : {}),
          ...(d.notas !== undefined ? { notes: d.notas } : {}),
          ...(d.fecha !== undefined ? { dueAt: d.fecha, lastFiredAt: null } : {}),
          ...(d.repeticion !== undefined ? { repeat: d.repeticion } : {}),
          ...(d.completado !== undefined ? { done: d.completado } : {}),
        })
        .where(dueño(id, user.id))
        .returning();
      if (!r) throw new HttpError(404, "Recordatorio no encontrado");
      avisarCambio(deps, user.id);
      return aDto(r);
    });

    app.delete("/api/recordatorios/:id", { config: { acceso: { modulo: "recordatorios", nivel: "escritura" } } }, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await db.delete(reminders).where(dueño(id, user.id));
      avisarCambio(deps, user.id);
      return { ok: true };
    });
  };
}
