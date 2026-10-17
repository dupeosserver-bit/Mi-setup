/**
 * Negocio: clientes y cobros (con recordatorio automático), gastos e ingresos
 * (resumen para gráficas) y notas/mejoras del negocio.
 */
import { and, asc, desc, eq, gte, lte, ne } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { businessNotes, charges, clients, transactions } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";

export const FRECUENCIAS = ["mensual", "trimestral", "anual", "unico"] as const;
type Frecuencia = (typeof FRECUENCIAS)[number];

/** Suma meses respetando el último día del mes (31 ene + 1 mes = 28/29 feb). */
export function sumarMeses(fecha: Date, meses: number): Date {
  const d = new Date(fecha);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + meses);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return d;
}

export function siguienteCobro(fecha: Date, frecuencia: Frecuencia): Date | null {
  if (frecuencia === "unico") return null;
  return sumarMeses(fecha, frecuencia === "mensual" ? 1 : frecuencia === "trimestral" ? 3 : 12);
}

const clienteSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  contacto: z.string().trim().max(200).default(""),
  notas: z.string().max(2000).default(""),
});

const cobroSchema = z.object({
  clienteId: z.string().uuid(),
  concepto: z.string().trim().min(1).max(200),
  monto: z.coerce.number().positive().max(10_000_000),
  moneda: z.string().trim().length(3).toUpperCase().default("MXN"),
  frecuencia: z.enum(FRECUENCIAS),
  proximo: z.coerce.date(),
  estado: z.enum(["activo", "pausado", "completado", "cancelado"]).default("activo"),
});

const movimientoSchema = z.object({
  tipo: z.enum(["ingreso", "gasto"]),
  monto: z.coerce.number().positive().max(10_000_000),
  moneda: z.string().trim().length(3).toUpperCase().default("MXN"),
  categoria: z.string().trim().min(1).max(60),
  descripcion: z.string().trim().max(500).default(""),
  fecha: z.coerce.date(),
});

const notaSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  contenido: z.string().max(10_000).default(""),
  estado: z.enum(["idea", "en_progreso", "hecho"]).default("idea"),
});

function cobroDto(c: typeof charges.$inferSelect, cliente: string | null, ahora: Date) {
  return {
    id: c.id,
    clienteId: c.clientId,
    cliente,
    concepto: c.concept,
    monto: Number(c.amount),
    moneda: c.currency,
    frecuencia: c.frequency,
    proximo: c.nextDue.toISOString(),
    estado: c.status,
    vencido: c.status === "activo" && c.nextDue < ahora,
    ultimoPago: c.lastPaidAt?.toISOString() ?? null,
  };
}

function movimientoDto(m: typeof transactions.$inferSelect) {
  return { id: m.id, tipo: m.kind, monto: Number(m.amount), moneda: m.currency, categoria: m.category, descripcion: m.description, fecha: m.date.toISOString(), cobroId: m.chargeId };
}

/** Avisa los cobros que vencen en 3 días o ya vencieron (una vez al día). */
export async function recordarCobros(deps: ModuleDeps): Promise<number> {
  const ahora = deps.now();
  const limite = new Date(ahora.getTime() + 3 * 86_400_000);
  const filas = await deps.db
    .select({ c: charges, cliente: clients.name })
    .from(charges)
    .innerJoin(clients, eq(clients.id, charges.clientId))
    .where(and(eq(charges.status, "activo"), lte(charges.nextDue, limite)));
  let n = 0;
  for (const { c, cliente } of filas) {
    if (c.lastRemindedAt && ahora.getTime() - c.lastRemindedAt.getTime() < 86_400_000) continue;
    const vencido = c.nextDue < ahora;
    await deps.notifier.send({
      title: vencido ? `Mi Setup: cobro vencido de ${cliente}` : `Mi Setup: cobrar a ${cliente}`,
      message: `${c.concept}: ${Number(c.amount).toFixed(2)} ${c.currency} · ${c.nextDue.toISOString().slice(0, 10)}`,
      priority: vencido ? 4 : 3,
      tags: ["moneybag"],
    });
    await deps.db.update(charges).set({ lastRemindedAt: ahora }).where(eq(charges.id, c.id));
    n++;
  }
  return n;
}

/** Marca un cobro como pagado: registra el ingreso y pasa a la siguiente fecha. */
export async function marcarPagado(deps: ModuleDeps, id: string) {
  const [fila] = await deps.db.select({ c: charges, cliente: clients.name }).from(charges).innerJoin(clients, eq(clients.id, charges.clientId)).where(eq(charges.id, id));
  if (!fila) throw new HttpError(404, "Cobro no encontrado");
  const { c, cliente } = fila;
  const ahora = deps.now();
  await deps.db.insert(transactions).values({
    kind: "ingreso",
    amount: c.amount,
    currency: c.currency,
    category: "Hosting",
    description: `${cliente} · ${c.concept}`,
    date: ahora,
    chargeId: c.id,
  });
  const siguiente = siguienteCobro(c.nextDue, c.frequency as Frecuencia);
  const [actual] = await deps.db
    .update(charges)
    .set({ lastPaidAt: ahora, lastRemindedAt: null, ...(siguiente ? { nextDue: siguiente } : { status: "completado" }) })
    .where(eq(charges.id, c.id))
    .returning();
  return cobroDto(actual ?? c, cliente, ahora);
}

export function negocioRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const L = (modulo: "clientes" | "finanzas" | "negocio") => ({ config: { acceso: { modulo, nivel: "lectura" as const } } });
  const E = (modulo: "clientes" | "finanzas" | "negocio") => ({ config: { acceso: { modulo, nivel: "escritura" as const } } });

  return async function (app: FastifyInstance): Promise<void> {
    // ---------------- clientes
    app.get("/api/clientes", L("clientes"), async () =>
      (await db.select().from(clients).orderBy(asc(clients.name))).map((c) => ({ id: c.id, nombre: c.name, contacto: c.contact, notas: c.notes })),
    );
    app.post("/api/clientes", E("clientes"), async (request) => {
      const d = clienteSchema.parse(request.body);
      const [c] = await db.insert(clients).values({ name: d.nombre, contact: d.contacto, notes: d.notas }).returning();
      return { id: c?.id };
    });
    app.patch("/api/clientes/:id", E("clientes"), async (request) => {
      const { id } = idParams.parse(request.params);
      const d = clienteSchema.partial().parse(request.body);
      await db
        .update(clients)
        .set({ ...(d.nombre ? { name: d.nombre } : {}), ...(d.contacto !== undefined ? { contact: d.contacto } : {}), ...(d.notas !== undefined ? { notes: d.notas } : {}) })
        .where(eq(clients.id, id));
      return { ok: true };
    });
    app.delete("/api/clientes/:id", E("clientes"), async (request) => {
      const { id } = idParams.parse(request.params);
      await db.delete(clients).where(eq(clients.id, id));
      return { ok: true };
    });

    // ---------------- cobros
    app.get("/api/cobros", L("clientes"), async () => {
      const ahora = deps.now();
      const filas = await db.select({ c: charges, cliente: clients.name }).from(charges).innerJoin(clients, eq(clients.id, charges.clientId)).orderBy(asc(charges.nextDue));
      return filas.map((f) => cobroDto(f.c, f.cliente, ahora));
    });
    app.post("/api/cobros", E("clientes"), async (request) => {
      const d = cobroSchema.parse(request.body);
      const [c] = await db
        .insert(charges)
        .values({ clientId: d.clienteId, concept: d.concepto, amount: d.monto.toFixed(2), currency: d.moneda, frequency: d.frecuencia, nextDue: d.proximo, status: d.estado })
        .returning();
      return { id: c?.id };
    });
    app.patch("/api/cobros/:id", E("clientes"), async (request) => {
      const { id } = idParams.parse(request.params);
      const d = cobroSchema.partial().parse(request.body);
      await db
        .update(charges)
        .set({
          ...(d.concepto ? { concept: d.concepto } : {}),
          ...(d.monto !== undefined ? { amount: d.monto.toFixed(2) } : {}),
          ...(d.moneda ? { currency: d.moneda } : {}),
          ...(d.frecuencia ? { frequency: d.frecuencia } : {}),
          ...(d.proximo ? { nextDue: d.proximo, lastRemindedAt: null } : {}),
          ...(d.estado ? { status: d.estado } : {}),
        })
        .where(eq(charges.id, id));
      return { ok: true };
    });
    app.post("/api/cobros/:id/pagado", E("clientes"), async (request) => {
      const { id } = idParams.parse(request.params);
      const r = await marcarPagado(deps, id);
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "cobro_pagado", module: "clientes", target: id, outcome: "ok" });
      return r;
    });
    app.delete("/api/cobros/:id", E("clientes"), async (request) => {
      const { id } = idParams.parse(request.params);
      await db.delete(charges).where(eq(charges.id, id));
      return { ok: true };
    });

    // ---------------- gastos e ingresos
    app.get("/api/finanzas/movimientos", L("finanzas"), async (request) => {
      const { desde, hasta } = z.object({ desde: z.coerce.date().optional(), hasta: z.coerce.date().optional() }).parse(request.query);
      const filtros = [desde ? gte(transactions.date, desde) : undefined, hasta ? lte(transactions.date, hasta) : undefined].filter(Boolean);
      const filas = await db
        .select()
        .from(transactions)
        .where(filtros.length ? and(...filtros) : undefined)
        .orderBy(desc(transactions.date))
        .limit(1000);
      return filas.map(movimientoDto);
    });
    app.post("/api/finanzas/movimientos", E("finanzas"), async (request) => {
      const d = movimientoSchema.parse(request.body);
      const [m] = await db
        .insert(transactions)
        .values({ kind: d.tipo, amount: d.monto.toFixed(2), currency: d.moneda, category: d.categoria, description: d.descripcion, date: d.fecha })
        .returning();
      return m ? movimientoDto(m) : null;
    });
    app.delete("/api/finanzas/movimientos/:id", E("finanzas"), async (request) => {
      const { id } = idParams.parse(request.params);
      await db.delete(transactions).where(eq(transactions.id, id));
      return { ok: true };
    });
    app.get("/api/finanzas/resumen", L("finanzas"), async (request) => {
      const { meses, moneda } = z.object({ meses: z.coerce.number().int().min(1).max(36).default(12), moneda: z.string().length(3).toUpperCase().default("MXN") }).parse(request.query);
      const ahora = deps.now();
      const inicio = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - (meses - 1), 1));
      const filas = await db.select().from(transactions).where(and(gte(transactions.date, inicio), eq(transactions.currency, moneda)));
      const porMes = new Map<string, { mes: string; ingresos: number; gastos: number }>();
      for (let i = 0; i < meses; i++) {
        const d = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + i, 1));
        const clave = d.toISOString().slice(0, 7);
        porMes.set(clave, { mes: clave, ingresos: 0, gastos: 0 });
      }
      const categorias = { ingreso: new Map<string, number>(), gasto: new Map<string, number>() };
      for (const t of filas) {
        const monto = Number(t.amount);
        const m = porMes.get(t.date.toISOString().slice(0, 7));
        if (m) {
          if (t.kind === "ingreso") m.ingresos += monto;
          else m.gastos += monto;
        }
        const mapa = t.kind === "ingreso" ? categorias.ingreso : categorias.gasto;
        mapa.set(t.category, (mapa.get(t.category) ?? 0) + monto);
      }
      const lista = [...porMes.values()].map((m) => ({ ...m, neto: m.ingresos - m.gastos }));
      const aLista = (mapa: Map<string, number>) => [...mapa.entries()].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor);
      const ingresos = lista.reduce((s, m) => s + m.ingresos, 0);
      const gastos = lista.reduce((s, m) => s + m.gastos, 0);
      return { moneda, porMes: lista, gastosPorCategoria: aLista(categorias.gasto), ingresosPorCategoria: aLista(categorias.ingreso), totales: { ingresos, gastos, neto: ingresos - gastos } };
    });

    // ---------------- notas del negocio
    app.get("/api/negocio/notas", L("negocio"), async () =>
      (await db.select().from(businessNotes).where(ne(businessNotes.status, "archivado")).orderBy(desc(businessNotes.updatedAt))).map((n) => ({
        id: n.id,
        titulo: n.title,
        contenido: n.content,
        estado: n.status,
        actualizada: n.updatedAt.toISOString(),
      })),
    );
    app.post("/api/negocio/notas", E("negocio"), async (request) => {
      const d = notaSchema.parse(request.body);
      const [n] = await db.insert(businessNotes).values({ title: d.titulo, content: d.contenido, status: d.estado }).returning();
      return { id: n?.id };
    });
    app.patch("/api/negocio/notas/:id", E("negocio"), async (request) => {
      const { id } = idParams.parse(request.params);
      const d = notaSchema.partial().parse(request.body);
      await db
        .update(businessNotes)
        .set({ ...(d.titulo ? { title: d.titulo } : {}), ...(d.contenido !== undefined ? { content: d.contenido } : {}), ...(d.estado ? { status: d.estado } : {}), updatedAt: deps.now() })
        .where(eq(businessNotes.id, id));
      return { ok: true };
    });
    app.delete("/api/negocio/notas/:id", E("negocio"), async (request) => {
      const { id } = idParams.parse(request.params);
      await db.delete(businessNotes).where(eq(businessNotes.id, id));
      return { ok: true };
    });
  };
}
