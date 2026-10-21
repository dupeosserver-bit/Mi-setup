/**
 * Mis finanzas, parte 2:
 * - Ticket con foto: la IA lee tienda, fecha, total e IVA; tú revisas y lo
 *   guardas como gasto (con la foto).
 * - Impuestos del mes: IVA pagado según tus tickets.
 * - Pagos divididos: un pago (Netflix, renta…) entre varias personas; cada
 *   una tiene su lista de cobros, se marcan pagados y si pasa la fecha queda «debe».
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repartir } from "@mi-setup/shared";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, notInArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { financePeople, financeSplitCharges, financeSplitMembers, financeSplits, personalMovements } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, sync, type ModuleDeps } from "./common.js";
import { carpetaArchivos } from "./herramientas.js";
import type { IaSimple } from "./ia/simple.js";
import { tipoPorBytes } from "./notas-adjuntos.js";

const MAX_TICKET = 12 * 1024 * 1024;
const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");
const MONTO = z.coerce.number().positive("El monto debe ser mayor a 0").max(100_000_000);

export function firmaTicket(secreto: string, movimientoId: string): string {
  return createHmac("sha256", secreto).update(`ticket:${movimientoId}`).digest("base64url").slice(0, 24);
}

// ---------------------------------------------------------------- fechas de los cobros

export type Ciclo = "unico" | "semanal" | "mensual" | "anual";
const SIN_MAS = "9999-12-31";

/** Siguiente fecha de cobro; en meses cortos se queda en el último día (31 → 30/28). */
export function siguienteFecha(fecha: string, ciclo: Ciclo, diaOriginal?: number): string {
  if (ciclo === "unico") return SIN_MAS;
  const [a, m, d] = fecha.split("-").map(Number) as [number, number, number];
  if (ciclo === "semanal") {
    const f = new Date(Date.UTC(a, m - 1, d + 7));
    return f.toISOString().slice(0, 10);
  }
  const dia = diaOriginal ?? d;
  const [na, nm] = ciclo === "anual" ? [a + 1, m] : m === 12 ? [a + 1, 1] : [a, m + 1];
  const ultimo = new Date(Date.UTC(na, nm, 0)).getUTCDate();
  return `${na}-${String(nm).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/** Fechas que toca generar desde `proxima` hasta `limite` (inclusive) y la nueva próxima. */
export function fechasPendientes(proxima: string, ciclo: Ciclo, limite: string, diaOriginal?: number): { fechas: string[]; nuevaProxima: string } {
  const fechas: string[] = [];
  let f = proxima;
  while (f <= limite && f !== SIN_MAS && fechas.length < 60) {
    fechas.push(f);
    f = siguienteFecha(f, ciclo, diaOriginal);
  }
  return { fechas, nuevaProxima: f };
}

export type EstadoCobro = "pagado" | "pendiente" | "debe";
export function estadoCobro(c: { dueOn: string; paidAt: Date | null }, hoy: string): EstadoCobro {
  if (c.paidAt) return "pagado";
  return c.dueOn < hoy ? "debe" : "pendiente";
}

export function finanzasExtraRoutes(deps: ModuleDeps, ia: IaSimple) {
  const { db } = deps;
  const leer = { config: { acceso: { modulo: "finanzas_personales" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "finanzas_personales" as const, nivel: "escritura" as const } } };
  const secreto = () => deps.config.env.JWT_SECRET ?? deps.config.env.SERVER_ENC_KEY ?? "desarrollo-sin-secreto";
  const carpeta = (userId: string) => join(carpetaArchivos(deps), "tickets", userId);
  const hoy = () => {
    const d = deps.now();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  /** Crea los cobros que ya tocan (y los de la próxima semana, para avisar antes). */
  async function generarCobros(userId: string): Promise<void> {
    const limite = new Date(deps.now().getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
    const pagos = await db.select().from(financeSplits).where(and(eq(financeSplits.userId, userId), eq(financeSplits.active, true), lte(financeSplits.nextDue, limite)));
    for (const p of pagos) {
      const dia = Number(p.nextDue.slice(8, 10));
      const { fechas, nuevaProxima } = fechasPendientes(p.nextDue, p.cycle as Ciclo, limite, dia);
      if (!fechas.length) continue;
      const miembros = await db.select().from(financeSplitMembers).where(eq(financeSplitMembers.splitId, p.id));
      const filas = fechas.flatMap((dueOn) => miembros.map((m) => ({ splitId: p.id, personId: m.personId, dueOn, amount: m.amount })));
      if (filas.length) await db.insert(financeSplitCharges).values(filas).onConflictDoNothing();
      await db.update(financeSplits).set({ nextDue: nuevaProxima }).where(eq(financeSplits.id, p.id));
    }
  }

  async function personaPropia(userId: string, id: string) {
    const [p] = await db.select().from(financePeople).where(and(eq(financePeople.id, id), eq(financePeople.userId, userId)));
    if (!p) throw new HttpError(404, "Esa persona no existe");
    return p;
  }

  async function pagoPropio(userId: string, id: string) {
    const [p] = await db.select().from(financeSplits).where(and(eq(financeSplits.id, id), eq(financeSplits.userId, userId)));
    if (!p) throw new HttpError(404, "Ese pago no existe");
    return p;
  }

  /** Busca a la persona por nombre o la crea. */
  async function persona(userId: string, nombre: string, contacto = ""): Promise<string> {
    const [ya] = await db.select({ id: financePeople.id }).from(financePeople).where(and(eq(financePeople.userId, userId), eq(financePeople.name, nombre)));
    if (ya) return ya.id;
    const [nueva] = await db.insert(financePeople).values({ userId, name: nombre, contact: contacto }).returning({ id: financePeople.id });
    if (!nueva) throw new HttpError(500, "No se pudo guardar la persona");
    return nueva.id;
  }

  return async function (app: FastifyInstance): Promise<void> {
    // ---------------------------------------------------------------- ticket con foto
    app.post("/api/finanzas-personales/ticket/leer", escribir, async (request) => {
      const user = currentUser(request);
      const archivo = await request.file({ limits: { fileSize: MAX_TICKET, files: 1 } });
      if (!archivo) throw new HttpError(400, "Toma o elige la foto del ticket");
      const buf = await archivo.toBuffer();
      if (archivo.file.truncated) throw new HttpError(413, "La foto pasa de 12 MB");
      const tipo = tipoPorBytes(buf, archivo.mimetype);
      if (!/^image\/(png|jpeg|webp)$/.test(tipo)) throw new HttpError(400, "La foto debe ser JPG, PNG o WebP");
      const id = randomUUID();
      await mkdir(carpeta(user.id), { recursive: true });
      await writeFile(join(carpeta(user.id), `${id}.${tipo.split("/")[1]}`), buf);
      const esquema = z.object({
        tienda: z.string().max(120).catch(""),
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
        total: z.coerce.number().nonnegative().catch(0),
        iva: z.coerce.number().nonnegative().nullable().catch(null),
        moneda: z.string().max(5).catch("MXN"),
        categoria: z.string().max(60).catch("Otros"),
        conceptos: z.array(z.object({ nombre: z.string().max(120), monto: z.coerce.number() })).max(60).catch([]),
      });
      const propuesta = await ia.pedirJson(
        user,
        {
          sistema:
            "Lees tickets de compra de México. Devuelve SOLO un objeto JSON: {\"tienda\":\"\",\"fecha\":\"AAAA-MM-DD o null\",\"total\":0,\"iva\":0 o null,\"moneda\":\"MXN\",\"categoria\":\"una de: Comida, Transporte, Casa, Servicios, Salud, Diversión, Ropa, Educación, Trabajo, Otros\",\"conceptos\":[{\"nombre\":\"\",\"monto\":0}]}. El total es lo que se pagó. Si el ticket no desglosa el IVA, pon null. No inventes datos que no se lean.",
          texto: "Lee este ticket.",
          imagenes: [{ tipo, datos: buf.toString("base64") }],
        },
        esquema,
      );
      return { archivo: id, propuesta };
    });

    app.post("/api/finanzas-personales/ticket/guardar", escribir, async (request) => {
      const user = currentUser(request);
      const d = z
        .object({
          archivo: z.string().uuid().nullable().default(null),
          tipo: z.enum(["gasto", "ingreso"]).default("gasto"),
          monto: MONTO,
          categoria: z.string().trim().min(1).max(60).default("Otros"),
          descripcion: z.string().trim().max(300).default(""),
          fecha: FECHA,
          iva: z.coerce.number().nonnegative().max(100_000_000).nullable().default(null),
        })
        .parse(request.body);
      let receipt: string | null = null;
      if (d.archivo) {
        const nombre = (await readdir(carpeta(user.id)).catch(() => [] as string[])).find((n) => n.startsWith(`${d.archivo}.`));
        if (!nombre) throw new HttpError(404, "No se encontró la foto del ticket; tómala otra vez");
        receipt = nombre;
      }
      const [m] = await db
        .insert(personalMovements)
        .values({
          userId: user.id,
          kind: d.tipo,
          amount: d.monto.toFixed(2),
          category: d.categoria,
          description: d.descripcion,
          occurredOn: d.fecha,
          tax: d.iva === null ? null : d.iva.toFixed(2),
          receipt,
        })
        .returning({ id: personalMovements.id });
      if (!m) throw new HttpError(500, "No se pudo guardar");
      sync(deps, user.id, "finanzas-personales");
      return { id: m.id };
    });

    app.get("/api/finanzas-personales/ticket/:id/:firma", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { id, firma } = z.object({ id: z.string().uuid(), firma: z.string().max(64) }).parse(request.params);
      const esperada = Buffer.from(firmaTicket(secreto(), id));
      const recibida = Buffer.from(firma);
      if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) throw new HttpError(404, "No encontrado");
      const [m] = await db.select({ userId: personalMovements.userId, receipt: personalMovements.receipt }).from(personalMovements).where(eq(personalMovements.id, id));
      if (!m?.receipt) throw new HttpError(404, "No encontrado");
      const ruta = join(carpeta(m.userId), m.receipt.replace(/[^a-zA-Z0-9.-]/g, ""));
      const info = await stat(ruta).catch(() => null);
      if (!info) throw new HttpError(404, "No encontrado");
      const ext = m.receipt.split(".").pop();
      reply.header("content-type", ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
      reply.header("cache-control", "private, max-age=3600");
      reply.header("x-content-type-options", "nosniff");
      return reply.send(createReadStream(ruta));
    });

    // ---------------------------------------------------------------- impuestos del mes
    app.get("/api/finanzas-personales/impuestos", leer, async (request) => {
      const user = currentUser(request);
      const { mes } = z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/) }).parse(request.query);
      const filtro = and(eq(personalMovements.userId, user.id), gte(personalMovements.occurredOn, `${mes}-01`), lte(personalMovements.occurredOn, `${mes}-31`));
      const [r] = await db
        .select({
          ivaPagado: sql<string>`coalesce(sum(case when ${personalMovements.kind} = 'gasto' then ${personalMovements.tax} end), 0)`,
          ivaCobrado: sql<string>`coalesce(sum(case when ${personalMovements.kind} = 'ingreso' then ${personalMovements.tax} end), 0)`,
          conTicket: sql<number>`count(*) filter (where ${personalMovements.receipt} is not null)`,
          ingresos: sql<string>`coalesce(sum(case when ${personalMovements.kind} = 'ingreso' then ${personalMovements.amount} end), 0)`,
          gastos: sql<string>`coalesce(sum(case when ${personalMovements.kind} = 'gasto' then ${personalMovements.amount} end), 0)`,
        })
        .from(personalMovements)
        .where(filtro);
      return {
        ivaPagado: Number(r?.ivaPagado ?? 0),
        ivaCobrado: Number(r?.ivaCobrado ?? 0),
        conTicket: Number(r?.conTicket ?? 0),
        ingresos: Number(r?.ingresos ?? 0),
        gastos: Number(r?.gastos ?? 0),
      };
    });

    // ---------------------------------------------------------------- pagos divididos
    app.get("/api/finanzas-personales/divididos", leer, async (request) => {
      const user = currentUser(request);
      await generarCobros(user.id);
      const pagos = await db.select().from(financeSplits).where(eq(financeSplits.userId, user.id)).orderBy(asc(financeSplits.name));
      const personas = await db.select().from(financePeople).where(eq(financePeople.userId, user.id)).orderBy(asc(financePeople.name));
      const ids = pagos.map((p) => p.id);
      const miembros = ids.length ? await db.select().from(financeSplitMembers).where(inArray(financeSplitMembers.splitId, ids)) : [];
      const cobros = ids.length
        ? await db.select().from(financeSplitCharges).where(inArray(financeSplitCharges.splitId, ids)).orderBy(asc(financeSplitCharges.dueOn))
        : [];
      const nombrePersona = new Map(personas.map((p) => [p.id, p.name]));
      const nombrePago = new Map(pagos.map((p) => [p.id, p.name]));
      const h = hoy();
      return {
        hoy: h,
        pagos: pagos.map((p) => ({
          id: p.id,
          nombre: p.name,
          total: Number(p.total),
          moneda: p.currency,
          ciclo: p.cycle,
          proximo: p.nextDue === SIN_MAS ? null : p.nextDue,
          notas: p.notes,
          activo: p.active,
          miembros: miembros.filter((m) => m.splitId === p.id).map((m) => ({ personaId: m.personId, nombre: nombrePersona.get(m.personId) ?? "", monto: Number(m.amount) })),
        })),
        personas: personas.map((p) => {
          const suyos = cobros.filter((c) => c.personId === p.id);
          const lista = suyos.map((c) => ({ id: c.id, pago: nombrePago.get(c.splitId) ?? "", fecha: c.dueOn, monto: Number(c.amount), estado: estadoCobro(c, h) }));
          const suma = (e: EstadoCobro) => Math.round(lista.filter((c) => c.estado === e).reduce((a, c) => a + c.monto, 0) * 100) / 100;
          return { id: p.id, nombre: p.name, contacto: p.contact, debe: suma("debe"), pendiente: suma("pendiente"), cobros: lista.slice(-36) };
        }),
      };
    });

    app.post("/api/finanzas-personales/divididos", escribir, async (request) => {
      const user = currentUser(request);
      const d = z
        .object({
          nombre: z.string().trim().min(1, "Ponle nombre (ej. Netflix)").max(80),
          total: MONTO,
          moneda: z.string().trim().max(5).default("MXN"),
          ciclo: z.enum(["unico", "semanal", "mensual", "anual"]).default("mensual"),
          primerCobro: FECHA,
          notas: z.string().trim().max(500).default(""),
          /** Tú también pagas una parte (no se te cobra a ti). */
          incluirme: z.boolean().default(true),
          personas: z
            .array(z.object({ nombre: z.string().trim().min(1).max(60), contacto: z.string().trim().max(120).default(""), monto: z.coerce.number().positive().optional() }))
            .min(1, "Agrega al menos una persona")
            .max(30),
        })
        .parse(request.body);
      const nombres = new Set(d.personas.map((p) => p.nombre.toLowerCase()));
      if (nombres.size !== d.personas.length) throw new HttpError(400, "Hay una persona repetida");
      // Montos: los que escribiste; si no, el total entre todos (contándote a ti si pagas).
      const partes = repartir(d.total, d.personas.length + (d.incluirme ? 1 : 0)).slice(d.incluirme ? 1 : 0);
      const montos = d.personas.map((p, i) => p.monto ?? partes[i]!);
      const [pago] = await db
        .insert(financeSplits)
        .values({ userId: user.id, name: d.nombre, total: d.total.toFixed(2), currency: d.moneda.toUpperCase(), cycle: d.ciclo, nextDue: d.primerCobro, notes: d.notas })
        .returning();
      if (!pago) throw new HttpError(500, "No se pudo guardar");
      for (const [i, p] of d.personas.entries()) {
        const personId = await persona(user.id, p.nombre, p.contacto);
        await db.insert(financeSplitMembers).values({ splitId: pago.id, personId, amount: montos[i]!.toFixed(2) });
      }
      await generarCobros(user.id);
      sync(deps, user.id, "finanzas-personales");
      return { id: pago.id };
    });

    app.patch("/api/finanzas-personales/divididos/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await pagoPropio(user.id, id);
      const d = z.object({ nombre: z.string().trim().min(1).max(80).optional(), notas: z.string().trim().max(500).optional(), activo: z.boolean().optional() }).parse(request.body);
      await db
        .update(financeSplits)
        .set({ ...(d.nombre ? { name: d.nombre } : {}), ...(d.notas !== undefined ? { notes: d.notas } : {}), ...(d.activo !== undefined ? { active: d.activo } : {}) })
        .where(eq(financeSplits.id, id));
      sync(deps, user.id, "finanzas-personales");
      return { ok: true };
    });

    /**
     * Editar un pago completo: nombre, total, notas y quiénes participan.
     * Las personas que quitas pierden sus cobros sin pagar; a las que siguen se
     * les ajusta el monto en los cobros que aún no pagan.
     */
    app.put("/api/finanzas-personales/divididos/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await pagoPropio(user.id, id);
      const d = z
        .object({
          nombre: z.string().trim().min(1).max(80),
          total: MONTO,
          notas: z.string().trim().max(500).default(""),
          incluirme: z.boolean().default(true),
          personas: z
            .array(z.object({ nombre: z.string().trim().min(1).max(60), contacto: z.string().trim().max(120).default(""), monto: z.coerce.number().positive().optional() }))
            .min(1, "Deja al menos una persona")
            .max(30),
        })
        .parse(request.body);
      const nombres = new Set(d.personas.map((p) => p.nombre.toLowerCase()));
      if (nombres.size !== d.personas.length) throw new HttpError(400, "Hay una persona repetida");
      const partes = repartir(d.total, d.personas.length + (d.incluirme ? 1 : 0)).slice(d.incluirme ? 1 : 0);
      const montos = d.personas.map((p, i) => p.monto ?? partes[i]!);
      await db.update(financeSplits).set({ name: d.nombre, total: d.total.toFixed(2), notes: d.notas }).where(eq(financeSplits.id, id));
      const quedan: string[] = [];
      for (const [i, p] of d.personas.entries()) {
        const personId = await persona(user.id, p.nombre, p.contacto);
        if (p.contacto) await db.update(financePeople).set({ contact: p.contacto }).where(eq(financePeople.id, personId));
        quedan.push(personId);
        const monto = montos[i]!.toFixed(2);
        await db
          .insert(financeSplitMembers)
          .values({ splitId: id, personId, amount: monto })
          .onConflictDoUpdate({ target: [financeSplitMembers.splitId, financeSplitMembers.personId], set: { amount: monto } });
        await db
          .update(financeSplitCharges)
          .set({ amount: monto })
          .where(and(eq(financeSplitCharges.splitId, id), eq(financeSplitCharges.personId, personId), gte(financeSplitCharges.dueOn, hoy()), isNull(financeSplitCharges.paidAt)));
      }
      await db.delete(financeSplitMembers).where(and(eq(financeSplitMembers.splitId, id), notInArray(financeSplitMembers.personId, quedan)));
      await db.delete(financeSplitCharges).where(and(eq(financeSplitCharges.splitId, id), notInArray(financeSplitCharges.personId, quedan), isNull(financeSplitCharges.paidAt)));
      sync(deps, user.id, "finanzas-personales");
      return { ok: true };
    });

    app.delete("/api/finanzas-personales/divididos/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await pagoPropio(user.id, id);
      await db.delete(financeSplits).where(eq(financeSplits.id, id));
      sync(deps, user.id, "finanzas-personales");
      return { ok: true };
    });

    app.post("/api/finanzas-personales/divididos/cobros/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const { pagado } = z.object({ pagado: z.boolean() }).parse(request.body);
      const [c] = await db
        .select({ id: financeSplitCharges.id })
        .from(financeSplitCharges)
        .innerJoin(financeSplits, eq(financeSplits.id, financeSplitCharges.splitId))
        .where(and(eq(financeSplitCharges.id, id), eq(financeSplits.userId, user.id)));
      if (!c) throw new HttpError(404, "Ese cobro no existe");
      await db.update(financeSplitCharges).set({ paidAt: pagado ? deps.now() : null }).where(eq(financeSplitCharges.id, id));
      sync(deps, user.id, "finanzas-personales");
      return { ok: true };
    });

    /** Marca pagado todo lo que debe una persona (cuando te paga junto). */
    app.post("/api/finanzas-personales/divididos/personas/:id/saldar", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await personaPropia(user.id, id);
      const vencidos = await db
        .select({ id: financeSplitCharges.id })
        .from(financeSplitCharges)
        .where(and(eq(financeSplitCharges.personId, id), lte(financeSplitCharges.dueOn, hoy()), sql`${financeSplitCharges.paidAt} is null`));
      if (vencidos.length) await db.update(financeSplitCharges).set({ paidAt: deps.now() }).where(inArray(financeSplitCharges.id, vencidos.map((v) => v.id)));
      sync(deps, user.id, "finanzas-personales");
      return { marcados: vencidos.length };
    });

    app.patch("/api/finanzas-personales/divididos/personas/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await personaPropia(user.id, id);
      const d = z.object({ nombre: z.string().trim().min(1).max(60).optional(), contacto: z.string().trim().max(120).optional() }).parse(request.body);
      await db
        .update(financePeople)
        .set({ ...(d.nombre ? { name: d.nombre } : {}), ...(d.contacto !== undefined ? { contact: d.contacto } : {}) })
        .where(eq(financePeople.id, id));
      sync(deps, user.id, "finanzas-personales");
      return { ok: true };
    });

    app.delete("/api/finanzas-personales/divididos/personas/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await personaPropia(user.id, id);
      await db.delete(financePeople).where(eq(financePeople.id, id));
      sync(deps, user.id, "finanzas-personales");
      return { ok: true };
    });
  };
}

/** Borra las fotos de tickets que se tomaron pero nunca se guardaron (más de un día). */
export async function limpiarTickets(deps: ModuleDeps): Promise<void> {
  const base = join(carpetaArchivos(deps), "tickets");
  const usuarios = await readdir(base).catch(() => [] as string[]);
  const usados = new Set(
    (await deps.db.select({ r: personalMovements.receipt }).from(personalMovements).where(isNotNull(personalMovements.receipt))).map((f) => f.r),
  );
  const limite = deps.now().getTime() - 86_400_000;
  for (const u of usuarios) {
    for (const nombre of await readdir(join(base, u)).catch(() => [] as string[])) {
      if (usados.has(nombre)) continue;
      const info = await stat(join(base, u, nombre)).catch(() => null);
      if (info && info.mtimeMs < limite) await rm(join(base, u, nombre), { force: true });
    }
  }
}
