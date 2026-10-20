/**
 * Mis finanzas (personales, por cuenta) y calendario.
 * - Movimientos (gastos e ingresos), presupuestos por categoría, resumen del mes
 *   e importación desde Excel/CSV (la app lee el archivo y manda las filas).
 * - Suscripciones con aviso antes del cobro; al llegar la fecha se anotan solas
 *   como gasto y pasan al siguiente ciclo.
 * - Calendario que junta eventos propios, recordatorios, suscripciones y, si
 *   tienes permiso, cobros a clientes y vencimientos.
 */
import { can } from "@mi-setup/shared";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { calendarEvents, charges, clients, expirations, personalBudgets, personalMovements, reminders, subscriptions, users } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, sync, type ModuleDeps } from "./common.js";
import { firmaTicket } from "./finanzas-extra.js";

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)");
const MONTO = z.coerce.number().positive("El monto debe ser mayor que 0").max(1_000_000_000);
const CICLOS = ["semanal", "mensual", "trimestral", "anual"] as const;

/** Suma un ciclo a una fecha AAAA-MM-DD (fin de mes seguro: 31 ene + 1 mes = 28/29 feb). */
export function sumarCiclo(fecha: string, ciclo: (typeof CICLOS)[number]): string {
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  if (ciclo === "semanal") {
    const f = new Date(Date.UTC(a, m - 1, d + 7));
    return f.toISOString().slice(0, 10);
  }
  const meses = ciclo === "mensual" ? 1 : ciclo === "trimestral" ? 3 : 12;
  const destino = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(d, ultimo));
  return destino.toISOString().slice(0, 10);
}

const hoy = (ahora: Date) => ahora.toISOString().slice(0, 10);

function movDto(m: typeof personalMovements.$inferSelect, secreto = "") {
  return { id: m.id, tipo: m.kind as "gasto" | "ingreso", monto: Number(m.amount), categoria: m.category, descripcion: m.description, fecha: m.occurredOn, iva: m.tax === null ? null : Number(m.tax), ticket: m.receipt && secreto ? `/api/finanzas-personales/ticket/${m.id}/${firmaTicket(secreto, m.id)}` : null };
}

function subDto(s: typeof subscriptions.$inferSelect) {
  return {
    id: s.id,
    nombre: s.name,
    monto: Number(s.amount),
    moneda: s.currency,
    ciclo: s.cycle,
    proximoCobro: s.nextCharge,
    categoria: s.category,
    avisarDias: s.remindDays,
    activa: s.active,
  };
}

/** Tarea: avisa antes del cobro y, al llegar la fecha, anota el gasto y pasa al siguiente ciclo. */
export async function revisarSuscripciones(deps: ModuleDeps): Promise<void> {
  const fechaHoy = hoy(deps.now());
  const activas = await deps.db.select().from(subscriptions).where(eq(subscriptions.active, true));
  for (const s of activas) {
    let proximo = s.nextCharge;
    // Cobros que ya pasaron: se anotan (como máximo 12 seguidos, por si estuvo apagado mucho tiempo).
    for (let i = 0; i < 12 && proximo <= fechaHoy; i++) {
      await deps.db.insert(personalMovements).values({ userId: s.userId, kind: "gasto", amount: s.amount, category: s.category, description: `Suscripción: ${s.name}`, occurredOn: proximo });
      proximo = sumarCiclo(proximo, s.cycle as (typeof CICLOS)[number]);
    }
    if (proximo !== s.nextCharge) {
      await deps.db.update(subscriptions).set({ nextCharge: proximo }).where(eq(subscriptions.id, s.id));
      sync(deps, s.userId, "finanzas-personales");
    }
    // Aviso unos días antes (una vez por cobro).
    const dias = Math.round((Date.parse(proximo) - Date.parse(fechaHoy)) / 86_400_000);
    if (dias <= s.remindDays && dias >= 0 && s.lastRemindedFor !== proximo) {
      const titulo = dias === 0 ? `Hoy te cobran ${s.name}` : `${s.name} se cobra en ${dias} día${dias === 1 ? "" : "s"}`;
      const cuerpo = `${Number(s.amount).toLocaleString("es-MX")} ${s.currency} el ${proximo}`;
      deps.hub.publicar(`usuario:${s.userId}`, { recurso: "finanzas-personales", aviso: { titulo, cuerpo } });
      const [u] = await deps.db.select({ rol: users.role }).from(users).where(eq(users.id, s.userId));
      if (u?.rol === "maestra") await deps.notifier.send({ title: titulo, message: cuerpo, priority: 3, tags: ["credit_card"] });
      await deps.db.update(subscriptions).set({ lastRemindedFor: proximo }).where(eq(subscriptions.id, s.id));
    }
  }
}

export function personalRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const leer = { config: { acceso: { modulo: "finanzas_personales" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "finanzas_personales" as const, nivel: "escritura" as const } } };

  const movimientoSchema = z.object({
    tipo: z.enum(["gasto", "ingreso"]),
    monto: MONTO,
    categoria: z.string().trim().min(1).max(60).default("Otros"),
    descripcion: z.string().trim().max(300).default(""),
    fecha: FECHA,
  });

  return async function (app: FastifyInstance): Promise<void> {
    // ---------------------------------------------------------------- movimientos
    app.get("/api/finanzas-personales/movimientos", leer, async (request) => {
      const user = currentUser(request);
      const { mes } = z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(request.query);
      const filtro = mes
        ? and(eq(personalMovements.userId, user.id), gte(personalMovements.occurredOn, `${mes}-01`), lte(personalMovements.occurredOn, `${mes}-31`))
        : eq(personalMovements.userId, user.id);
      const filas = await db.select().from(personalMovements).where(filtro).orderBy(desc(personalMovements.occurredOn), desc(personalMovements.createdAt)).limit(2000);
      const secreto = deps.config.env.JWT_SECRET ?? deps.config.env.SERVER_ENC_KEY ?? "desarrollo-sin-secreto";
      return filas.map((f) => movDto(f, secreto));
    });

    app.post("/api/finanzas-personales/movimientos", escribir, async (request) => {
      const user = currentUser(request);
      const d = movimientoSchema.parse(request.body);
      const [m] = await db
        .insert(personalMovements)
        .values({ userId: user.id, kind: d.tipo, amount: d.monto.toFixed(2), category: d.categoria, description: d.descripcion, occurredOn: d.fecha })
        .returning();
      if (!m) throw new HttpError(500, "No se pudo guardar");
      sync(deps, user.id, "finanzas-personales");
      return movDto(m);
    });

    /** Conceptos que ya usaste (gasto «Préstamo Coppel», ingreso «Venta»…) para sugerirlos al escribir. */
    app.get("/api/finanzas-personales/categorias", leer, async (request) => {
      const user = currentUser(request);
      const filas = await db
        .select({ categoria: personalMovements.category, tipo: personalMovements.kind, veces: sql<number>`count(*)::int` })
        .from(personalMovements)
        .where(eq(personalMovements.userId, user.id))
        .groupBy(personalMovements.category, personalMovements.kind)
        .orderBy(desc(sql`count(*)`))
        .limit(200);
      return filas;
    });

    /** Importar desde Excel/CSV: la app lee el archivo y manda hasta 5000 filas ya interpretadas. */
    app.post("/api/finanzas-personales/importar", { ...escribir, bodyLimit: 5 * 1024 * 1024 }, async (request) => {
      const user = currentUser(request);
      const { filas } = z.object({ filas: z.array(movimientoSchema).min(1, "El archivo no trae movimientos").max(5000) }).parse(request.body);
      for (let i = 0; i < filas.length; i += 500) {
        await db.insert(personalMovements).values(
          filas.slice(i, i + 500).map((d) => ({ userId: user.id, kind: d.tipo, amount: d.monto.toFixed(2), category: d.categoria, description: d.descripcion, occurredOn: d.fecha })),
        );
      }
      sync(deps, user.id, "finanzas-personales");
      return { importados: filas.length };
    });

    app.delete("/api/finanzas-personales/movimientos/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await db.delete(personalMovements).where(and(eq(personalMovements.id, id), eq(personalMovements.userId, user.id)));
      sync(deps, user.id, "finanzas-personales");
      return { ok: true };
    });

    /** Resumen del mes: totales, gasto por categoría con su presupuesto y los últimos 6 meses. */
    app.get("/api/finanzas-personales/resumen", leer, async (request) => {
      const user = currentUser(request);
      const { mes } = z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.query);
      const delMes = await db
        .select({ tipo: personalMovements.kind, categoria: personalMovements.category, total: sql<string>`sum(${personalMovements.amount})` })
        .from(personalMovements)
        .where(and(eq(personalMovements.userId, user.id), gte(personalMovements.occurredOn, `${mes}-01`), lte(personalMovements.occurredOn, `${mes}-31`)))
        .groupBy(personalMovements.kind, personalMovements.category);
      const presupuestos = await db.select().from(personalBudgets).where(eq(personalBudgets.userId, user.id));
      const ingresos = delMes.filter((f) => f.tipo === "ingreso").reduce((s, f) => s + Number(f.total), 0);
      const gastos = delMes.filter((f) => f.tipo === "gasto").reduce((s, f) => s + Number(f.total), 0);
      const categorias = new Set([...delMes.filter((f) => f.tipo === "gasto").map((f) => f.categoria), ...presupuestos.map((p) => p.category)]);
      const historial = await db
        .select({ mes: sql<string>`substring(${personalMovements.occurredOn}, 1, 7)`, tipo: personalMovements.kind, total: sql<string>`sum(${personalMovements.amount})` })
        .from(personalMovements)
        .where(eq(personalMovements.userId, user.id))
        .groupBy(sql`substring(${personalMovements.occurredOn}, 1, 7)`, personalMovements.kind)
        .orderBy(desc(sql`substring(${personalMovements.occurredOn}, 1, 7)`))
        .limit(12);
      const meses = [...new Set(historial.map((h) => h.mes))].slice(0, 6).reverse();
      return {
        mes,
        ingresos,
        gastos,
        balance: ingresos - gastos,
        porCategoria: [...categorias]
          .map((c) => ({
            categoria: c,
            gastado: Number(delMes.find((f) => f.tipo === "gasto" && f.categoria === c)?.total ?? 0),
            presupuesto: presupuestos.find((p) => p.category === c) ? Number(presupuestos.find((p) => p.category === c)!.monthlyLimit) : null,
          }))
          .sort((a, b) => b.gastado - a.gastado),
        ultimosMeses: meses.map((m) => ({
          mes: m,
          ingresos: Number(historial.find((h) => h.mes === m && h.tipo === "ingreso")?.total ?? 0),
          gastos: Number(historial.find((h) => h.mes === m && h.tipo === "gasto")?.total ?? 0),
        })),
      };
    });

    // ---------------------------------------------------------------- presupuestos
    app.put("/api/finanzas-personales/presupuestos", escribir, async (request) => {
      const user = currentUser(request);
      const d = z.object({ categoria: z.string().trim().min(1).max(60), limite: z.coerce.number().min(0).max(1_000_000_000) }).parse(request.body);
      if (d.limite === 0) {
        await db.delete(personalBudgets).where(and(eq(personalBudgets.userId, user.id), eq(personalBudgets.category, d.categoria)));
      } else {
        await db
          .insert(personalBudgets)
          .values({ userId: user.id, category: d.categoria, monthlyLimit: d.limite.toFixed(2) })
          .onConflictDoUpdate({ target: [personalBudgets.userId, personalBudgets.category], set: { monthlyLimit: d.limite.toFixed(2) } });
      }
      sync(deps, user.id, "finanzas-personales");
      return { ok: true };
    });

    // ---------------------------------------------------------------- suscripciones
    const suscripcionSchema = z.object({
      nombre: z.string().trim().min(1).max(80),
      monto: MONTO,
      moneda: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("MXN"),
      ciclo: z.enum(CICLOS).default("mensual"),
      proximoCobro: FECHA,
      categoria: z.string().trim().min(1).max(60).default("Suscripciones"),
      avisarDias: z.coerce.number().int().min(0).max(30).default(2),
      activa: z.boolean().default(true),
    });

    app.get("/api/finanzas-personales/suscripciones", leer, async (request) => {
      const filas = await db.select().from(subscriptions).where(eq(subscriptions.userId, currentUser(request).id)).orderBy(asc(subscriptions.nextCharge));
      const lista = filas.map(subDto);
      const mensual = (s: ReturnType<typeof subDto>) => (s.ciclo === "semanal" ? (s.monto * 52) / 12 : s.ciclo === "mensual" ? s.monto : s.ciclo === "trimestral" ? s.monto / 3 : s.monto / 12);
      const activas = lista.filter((s) => s.activa);
      return { suscripciones: lista, totalMensual: activas.reduce((t, s) => t + mensual(s), 0), totalAnual: activas.reduce((t, s) => t + mensual(s) * 12, 0) };
    });

    app.post("/api/finanzas-personales/suscripciones", escribir, async (request) => {
      const user = currentUser(request);
      const d = suscripcionSchema.parse(request.body);
      const [s] = await db
        .insert(subscriptions)
        .values({ userId: user.id, name: d.nombre, amount: d.monto.toFixed(2), currency: d.moneda, cycle: d.ciclo, nextCharge: d.proximoCobro, category: d.categoria, remindDays: d.avisarDias, active: d.activa })
        .returning();
      if (!s) throw new HttpError(500, "No se pudo guardar");
      sync(deps, user.id, "finanzas-personales");
      return subDto(s);
    });

    app.patch("/api/finanzas-personales/suscripciones/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const d = suscripcionSchema.partial().parse(request.body);
      const [s] = await db
        .update(subscriptions)
        .set({
          ...(d.nombre !== undefined ? { name: d.nombre } : {}),
          ...(d.monto !== undefined ? { amount: d.monto.toFixed(2) } : {}),
          ...(d.moneda !== undefined ? { currency: d.moneda } : {}),
          ...(d.ciclo !== undefined ? { cycle: d.ciclo } : {}),
          ...(d.proximoCobro !== undefined ? { nextCharge: d.proximoCobro, lastRemindedFor: null } : {}),
          ...(d.categoria !== undefined ? { category: d.categoria } : {}),
          ...(d.avisarDias !== undefined ? { remindDays: d.avisarDias } : {}),
          ...(d.activa !== undefined ? { active: d.activa } : {}),
        })
        .where(and(eq(subscriptions.id, id), eq(subscriptions.userId, user.id)))
        .returning();
      if (!s) throw new HttpError(404, "Suscripción no encontrada");
      sync(deps, user.id, "finanzas-personales");
      return subDto(s);
    });

    app.delete("/api/finanzas-personales/suscripciones/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await db.delete(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.userId, user.id)));
      sync(deps, user.id, "finanzas-personales");
      return { ok: true };
    });

    // ---------------------------------------------------------------- calendario
    const calLeer = { config: { acceso: { modulo: "calendario" as const, nivel: "lectura" as const } } };
    const calEscribir = { config: { acceso: { modulo: "calendario" as const, nivel: "escritura" as const } } };

    /** Todo lo que pasa entre dos fechas, de todas las fuentes que la cuenta puede ver. */
    app.get("/api/calendario", calLeer, async (request) => {
      const user = currentUser(request);
      const { desde, hasta } = z.object({ desde: FECHA, hasta: FECHA }).parse(request.query);
      const ini = new Date(`${desde}T00:00:00Z`);
      const fin = new Date(`${hasta}T23:59:59Z`);
      const items: { id: string; tipo: string; titulo: string; fecha: string; color: string; editable: boolean }[] = [];

      for (const e of await db.select().from(calendarEvents).where(and(eq(calendarEvents.userId, user.id), gte(calendarEvents.startsAt, ini), lte(calendarEvents.startsAt, fin)))) {
        items.push({ id: e.id, tipo: "evento", titulo: e.title, fecha: e.startsAt.toISOString(), color: e.color ?? "#60a5fa", editable: true });
      }
      if (can(user, "recordatorios", "lectura")) {
        for (const r of await db.select().from(reminders).where(and(eq(reminders.userId, user.id), gte(reminders.dueAt, ini), lte(reminders.dueAt, fin)))) {
          items.push({ id: r.id, tipo: "recordatorio", titulo: r.title, fecha: r.dueAt.toISOString(), color: r.done ? "#6b7280" : "#f59e0b", editable: false });
        }
      }
      if (can(user, "finanzas_personales", "lectura")) {
        for (const s of await db.select().from(subscriptions).where(and(eq(subscriptions.userId, user.id), eq(subscriptions.active, true)))) {
          // Los cobros de la suscripción dentro del rango.
          let f = s.nextCharge;
          for (let i = 0; i < 60 && f <= hasta; i++) {
            if (f >= desde) items.push({ id: `${s.id}:${f}`, tipo: "suscripcion", titulo: `${s.name} · ${Number(s.amount).toLocaleString("es-MX")} ${s.currency}`, fecha: `${f}T12:00:00.000Z`, color: "#a78bfa", editable: false });
            f = sumarCiclo(f, s.cycle as (typeof CICLOS)[number]);
          }
        }
      }
      if (can(user, "clientes", "lectura")) {
        const cobros = await db
          .select({ id: charges.id, concepto: charges.concept, cliente: clients.name, fecha: charges.nextDue })
          .from(charges)
          .innerJoin(clients, eq(clients.id, charges.clientId))
          .where(and(eq(charges.status, "activo"), gte(charges.nextDue, ini), lte(charges.nextDue, fin)));
        for (const c of cobros) items.push({ id: c.id, tipo: "cobro", titulo: `Cobrar a ${c.cliente}: ${c.concepto}`, fecha: c.fecha.toISOString(), color: "#4ade80", editable: false });
      }
      if (can(user, "vencimientos", "lectura")) {
        for (const v of await db.select().from(expirations).where(and(gte(expirations.expiresAt, ini), lte(expirations.expiresAt, fin)))) {
          if (v.expiresAt) items.push({ id: v.id, tipo: "vencimiento", titulo: `Vence ${v.name}`, fecha: v.expiresAt.toISOString(), color: "#f87171", editable: false });
        }
      }
      return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
    });

    app.post("/api/calendario/eventos", calEscribir, async (request) => {
      const user = currentUser(request);
      const d = z
        .object({
          titulo: z.string().trim().min(1).max(200),
          fecha: z.string().datetime({ offset: true }),
          todoElDia: z.boolean().default(true),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null),
          notas: z.string().max(2000).default(""),
        })
        .parse(request.body);
      const [e] = await db.insert(calendarEvents).values({ userId: user.id, title: d.titulo, startsAt: new Date(d.fecha), allDay: d.todoElDia, color: d.color, notes: d.notas }).returning();
      if (!e) throw new HttpError(500, "No se pudo guardar");
      sync(deps, user.id, "calendario");
      return { id: e.id };
    });

    app.delete("/api/calendario/eventos/:id", calEscribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await db.delete(calendarEvents).where(and(eq(calendarEvents.id, id), eq(calendarEvents.userId, user.id)));
      sync(deps, user.id, "calendario");
      return { ok: true };
    });
  };
}
