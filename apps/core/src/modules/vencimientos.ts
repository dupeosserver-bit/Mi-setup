/**
 * Vencimientos: dominios (RDAP), certificados SSL (conexión TLS) y VPS (fecha
 * manual). Se revisan cada 6 h y se avisa con la anticipación configurada.
 */
import { connect } from "node:tls";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { expirations } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { idParams, type ModuleDeps } from "./common.js";

const DIA = 86_400_000;

/** Fecha de expiración en una respuesta RDAP (evento "expiration"). */
export function vencimientoRdap(rdap: unknown): Date | null {
  const eventos = (rdap as { events?: { eventAction?: string; eventDate?: string }[] })?.events ?? [];
  const fecha = eventos.find((e) => e.eventAction === "expiration")?.eventDate;
  return fecha ? new Date(fecha) : null;
}

export async function consultarDominio(dominio: string): Promise<Date> {
  const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(dominio)}`, {
    headers: { accept: "application/rdap+json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`RDAP respondió ${res.status}`);
  const fecha = vencimientoRdap(await res.json());
  if (!fecha) throw new Error("El registro no publica fecha de vencimiento");
  return fecha;
}

export function consultarCertificado(host: string, puerto = 443): Promise<Date> {
  return new Promise((resolve, reject) => {
    const s = connect({ host, port: puerto, servername: host, rejectUnauthorized: false, timeout: 10_000 }, () => {
      const cert = s.getPeerCertificate();
      s.end();
      if (!cert?.valid_to) return reject(new Error("El servidor no presentó certificado"));
      resolve(new Date(cert.valid_to));
    });
    s.once("timeout", () => {
      s.destroy();
      reject(new Error("Tiempo de espera agotado"));
    });
    s.once("error", (err) => reject(err));
  });
}

/** Días que faltan (redondeado hacia abajo; negativo si ya venció). */
export function diasRestantes(fecha: Date, ahora: Date): number {
  return Math.floor((fecha.getTime() - ahora.getTime()) / DIA);
}

const vencimientoSchema = z
  .object({
    tipo: z.enum(["dominio", "ssl", "vps"]),
    nombre: z.string().trim().min(1).max(100),
    objetivo: z.string().trim().max(253).default(""),
    fecha: z.coerce.date().nullable().default(null),
    avisarDias: z.number().int().min(1).max(365).default(14),
  })
  .refine((v) => (v.tipo === "vps" ? v.fecha !== null : /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v.objetivo)), {
    message: "Para dominio o SSL escribe un dominio válido; para VPS, la fecha de vencimiento",
  });

function aDto(e: typeof expirations.$inferSelect, ahora: Date) {
  return {
    id: e.id,
    tipo: e.kind,
    nombre: e.name,
    objetivo: e.target,
    fecha: e.expiresAt?.toISOString() ?? null,
    dias: e.expiresAt ? diasRestantes(e.expiresAt, ahora) : null,
    avisarDias: e.notifyDays,
    ultimaRevision: e.lastCheckAt?.toISOString() ?? null,
    error: e.lastError,
  };
}

export async function revisarVencimiento(
  deps: ModuleDeps,
  e: typeof expirations.$inferSelect,
  consultas = { dominio: consultarDominio, ssl: consultarCertificado },
): Promise<void> {
  const ahora = deps.now();
  let fecha = e.expiresAt;
  let error: string | null = null;
  if (e.kind !== "vps") {
    try {
      fecha = e.kind === "dominio" ? await consultas.dominio(e.target) : await consultas.ssl(e.target);
    } catch (err) {
      error = err instanceof Error ? err.message : "No se pudo consultar";
    }
  }
  let notificado = e.lastNotifiedAt;
  if (fecha) {
    const dias = diasRestantes(fecha, ahora);
    const yaAvisadoHoy = e.lastNotifiedAt && ahora.getTime() - e.lastNotifiedAt.getTime() < DIA;
    if (dias <= e.notifyDays && !yaAvisadoHoy) {
      await deps.notifier.send({
        title: dias < 0 ? `Mi Setup: ${e.name} ya venció` : `Mi Setup: ${e.name} vence en ${dias} días`,
        message: `${e.kind === "dominio" ? "Dominio" : e.kind === "ssl" ? "Certificado SSL" : "VPS"} ${e.target || e.name}: ${fecha.toISOString().slice(0, 10)}`,
        priority: dias <= 3 ? 5 : 4,
        tags: ["calendar"],
      });
      notificado = ahora;
    }
  }
  await deps.db
    .update(expirations)
    .set({ expiresAt: fecha, lastCheckAt: ahora, lastError: error, lastNotifiedAt: notificado })
    .where(eq(expirations.id, e.id));
}

export async function revisarVencimientos(deps: ModuleDeps): Promise<void> {
  for (const e of await deps.db.select().from(expirations)) await revisarVencimiento(deps, e);
}

export function vencimientosRoutes(deps: ModuleDeps) {
  const { db } = deps;
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/vencimientos", { config: { acceso: { modulo: "vencimientos", nivel: "lectura" } } }, async () => {
      const ahora = deps.now();
      return (await db.select().from(expirations).orderBy(asc(expirations.expiresAt))).map((e) => aDto(e, ahora));
    });

    app.post("/api/vencimientos", { config: { acceso: { modulo: "vencimientos", nivel: "escritura" } } }, async (request) => {
      const d = vencimientoSchema.parse(request.body);
      const [e] = await db
        .insert(expirations)
        .values({ kind: d.tipo, name: d.nombre, target: d.objetivo.toLowerCase(), expiresAt: d.fecha, notifyDays: d.avisarDias })
        .returning();
      if (!e) throw new HttpError(500, "No se pudo guardar");
      await revisarVencimiento(deps, e);
      const [actual] = await db.select().from(expirations).where(eq(expirations.id, e.id));
      return aDto(actual ?? e, deps.now());
    });

    app.patch("/api/vencimientos/:id", { config: { acceso: { modulo: "vencimientos", nivel: "escritura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = z
        .object({ nombre: z.string().trim().min(1).max(100).optional(), fecha: z.coerce.date().nullable().optional(), avisarDias: z.number().int().min(1).max(365).optional() })
        .parse(request.body);
      await db
        .update(expirations)
        .set({
          ...(d.nombre !== undefined ? { name: d.nombre } : {}),
          ...(d.fecha !== undefined ? { expiresAt: d.fecha, lastNotifiedAt: null } : {}),
          ...(d.avisarDias !== undefined ? { notifyDays: d.avisarDias } : {}),
        })
        .where(eq(expirations.id, id));
      return { ok: true };
    });

    app.post("/api/vencimientos/:id/revisar", { config: { acceso: { modulo: "vencimientos", nivel: "escritura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const [e] = await db.select().from(expirations).where(eq(expirations.id, id));
      if (!e) throw new HttpError(404, "No encontrado");
      await revisarVencimiento(deps, e);
      const [actual] = await db.select().from(expirations).where(eq(expirations.id, id));
      return aDto(actual ?? e, deps.now());
    });

    app.delete("/api/vencimientos/:id", { config: { acceso: { modulo: "vencimientos", nivel: "escritura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      await db.delete(expirations).where(eq(expirations.id, id));
      return { ok: true };
    });
  };
}
