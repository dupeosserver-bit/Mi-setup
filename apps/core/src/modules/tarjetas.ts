/**
 * Billetera de Mis finanzas (estilo Google Play): tus tarjetas para registrar pagos y ver
 * cuánto gastas con cada una. IMPORTANTE: Mi Setup NO cobra nada ni guarda números completos:
 * - Tarjeta real: solo apodo, marca y los últimos 4 dígitos (para reconocerla).
 * - Tarjeta de prueba: usa los números públicos de pruebas de los procesadores de pago
 *   (no sirven para compras reales) para probar tus propias páginas.
 * «Pagar» anota el gasto en tus finanzas con esa tarjeta, después de mostrarte el aviso.
 */
import { randomInt } from "node:crypto";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { personalCards, personalMovements } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, sync, type ModuleDeps } from "./common.js";

/** Números públicos de prueba (documentación de Stripe): ninguna compra real los acepta. */
export const NUMEROS_DE_PRUEBA = [
  { marca: "visa", numero: "4242424242424242", cvv: 3 },
  { marca: "mastercard", numero: "5555555555554444", cvv: 3 },
  { marca: "amex", numero: "378282246310005", cvv: 4 },
  { marca: "discover", numero: "6011111111111117", cvv: 3 },
  { marca: "jcb", numero: "3530111333300000", cvv: 3 },
  { marca: "diners", numero: "30569309025904", cvv: 3 },
] as const;

const COLORES = ["#6d28d9", "#0ea5e9", "#16a34a", "#e11d48", "#f59e0b", "#334155"];
const MARCAS = ["visa", "mastercard", "amex", "otra"] as const;
export const AVISO_PAGO =
  "Esto no hace un cobro real: solo anota el gasto en Mis finanzas con esta tarjeta. Revisa el monto y el concepto antes de confirmar.";

export function tarjetaDto(t: typeof personalCards.$inferSelect, gastadoMes = 0) {
  return {
    id: t.id,
    apodo: t.nickname,
    marca: t.brand,
    ultimos4: t.last4,
    tipo: t.kind as "real" | "prueba",
    color: t.color,
    banco: t.bank,
    // Solo las tarjetas de prueba guardan número (público); las reales jamás.
    numeroPrueba: t.testNumber,
    vence: t.expiry,
    cvv: t.cvv,
    gastadoMes,
  };
}

export function tarjetasRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const leer = { config: { acceso: { modulo: "finanzas_personales" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "finanzas_personales" as const, nivel: "escritura" as const } } };

  async function propia(userId: string, id: string) {
    const [t] = await db.select().from(personalCards).where(and(eq(personalCards.id, id), eq(personalCards.userId, userId)));
    if (!t) throw new HttpError(404, "Tarjeta no encontrada");
    return t;
  }

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/finanzas-personales/tarjetas", leer, async (request) => {
      const user = currentUser(request);
      const mes = deps.now().toISOString().slice(0, 7);
      const tarjetas = await db.select().from(personalCards).where(eq(personalCards.userId, user.id)).orderBy(desc(personalCards.createdAt));
      const gastos = await db
        .select({ id: personalMovements.cardId, total: sql<string>`sum(${personalMovements.amount})` })
        .from(personalMovements)
        .where(and(eq(personalMovements.userId, user.id), eq(personalMovements.kind, "gasto"), gte(personalMovements.occurredOn, `${mes}-01`), lte(personalMovements.occurredOn, `${mes}-31`)))
        .groupBy(personalMovements.cardId);
      return {
        aviso: AVISO_PAGO,
        tarjetas: tarjetas.map((t) => tarjetaDto(t, Number(gastos.find((g) => g.id === t.id)?.total ?? 0))),
      };
    });

    /** Tarjeta real: apodo, marca y últimos 4 dígitos. Nunca el número completo. */
    app.post("/api/finanzas-personales/tarjetas", escribir, async (request) => {
      const user = currentUser(request);
      const d = z
        .object({
          apodo: z.string().trim().min(1, "Ponle un apodo").max(40),
          marca: z.enum(MARCAS).default("otra"),
          ultimos4: z.string().trim().regex(/^\d{4}$/, "Escribe solo los últimos 4 dígitos (Mi Setup nunca guarda el número completo)"),
          banco: z.string().trim().max(40).default(""),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default(COLORES[0]!),
        })
        .parse(request.body);
      const [t] = await db.insert(personalCards).values({ userId: user.id, nickname: d.apodo, brand: d.marca, last4: d.ultimos4, bank: d.banco, color: d.color, kind: "real" }).returning();
      if (!t) throw new HttpError(500, "No se pudo guardar");
      sync(deps, user.id, "finanzas-personales");
      return tarjetaDto(t);
    });

    /** Tarjeta falsa para probar tus páginas: número público de pruebas, vencimiento futuro y CVV al azar. */
    app.post("/api/finanzas-personales/tarjetas/prueba", escribir, async (request) => {
      const user = currentUser(request);
      const d = z.object({ apodo: z.string().trim().max(40).default(""), marca: z.enum(["visa", "mastercard", "amex", "discover", "jcb", "diners"]).default("visa") }).parse(request.body ?? {});
      const [{ n } = { n: 0 }] = await db.select({ n: sql<number>`count(*)::int` }).from(personalCards).where(and(eq(personalCards.userId, user.id), eq(personalCards.kind, "prueba")));
      if (n >= 10) throw new HttpError(400, "Ya tienes 10 tarjetas de prueba; borra alguna para crear otra");
      const base = NUMEROS_DE_PRUEBA.find((x) => x.marca === d.marca) ?? NUMEROS_DE_PRUEBA[0];
      const ahora = deps.now();
      const vence = `${String(randomInt(1, 13)).padStart(2, "0")}/${String((ahora.getUTCFullYear() + randomInt(2, 6)) % 100).padStart(2, "0")}`;
      const cvv = String(randomInt(0, 10 ** base.cvv)).padStart(base.cvv, "0");
      const [t] = await db
        .insert(personalCards)
        .values({
          userId: user.id,
          nickname: d.apodo || `Prueba ${base.marca}`,
          brand: base.marca === "visa" || base.marca === "mastercard" || base.marca === "amex" ? base.marca : "otra",
          last4: base.numero.slice(-4),
          kind: "prueba",
          color: "#64748b",
          testNumber: base.numero,
          expiry: vence,
          cvv,
        })
        .returning();
      if (!t) throw new HttpError(500, "No se pudo guardar");
      sync(deps, user.id, "finanzas-personales");
      return tarjetaDto(t);
    });

    app.delete("/api/finanzas-personales/tarjetas/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await db.delete(personalCards).where(and(eq(personalCards.id, id), eq(personalCards.userId, user.id)));
      sync(deps, user.id, "finanzas-personales");
      return { ok: true };
    });

    /** «Pagar»: anota el gasto con esta tarjeta. Exige `confirmo: true` (la app muestra el aviso antes). */
    app.post("/api/finanzas-personales/tarjetas/:id/pagar", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const d = z
        .object({
          monto: z.coerce.number().positive("El monto debe ser mayor que 0").max(1_000_000),
          concepto: z.string().trim().min(1, "Escribe en qué es el pago").max(200),
          categoria: z.string().trim().min(1).max(60).default("Otros"),
          confirmo: z.literal(true, { errorMap: () => ({ message: "Confirma el pago después de leer el aviso" }) }),
        })
        .parse(request.body);
      const t = await propia(user.id, id);
      const [m] = await db
        .insert(personalMovements)
        .values({
          userId: user.id,
          kind: "gasto",
          amount: d.monto.toFixed(2),
          category: d.categoria,
          description: `${t.nickname} ••${t.last4}: ${d.concepto}`,
          occurredOn: deps.now().toISOString().slice(0, 10),
          cardId: t.id,
        })
        .returning({ id: personalMovements.id });
      sync(deps, user.id, "finanzas-personales");
      return { ok: true, movimientoId: m?.id ?? null, aviso: AVISO_PAGO };
    });
  };
}
