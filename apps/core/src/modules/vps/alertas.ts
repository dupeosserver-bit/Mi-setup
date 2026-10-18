/**
 * Alertas de caída: cada 60 s se revisan los VPS (puerto SSH) y los monitores
 * (TCP o HTTP). Un cambio de estado envía aviso push; además, si un VPS tiene
 * umbrales de CPU/RAM/disco, se avisa al superarlos (máximo cada 30 min); el
 * aviso abre la IA con la pregunta lista para diagnosticar.
 */
import { connect } from "node:net";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { monitors, vpsServers, type VpsServerRow } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import { idParams, type ModuleDeps } from "../common.js";
import { parsearMetricas, SCRIPT_METRICAS } from "./parse.js";
import type { Servidores } from "./servidores.js";
import { ejecutar } from "./ssh.js";

const ALERTA_RECURSOS_MS = 30 * 60_000;

export function probarTcp(host: string, puerto: number, timeoutMs = 5_000): Promise<{ arriba: boolean; ms: number }> {
  const inicio = Date.now();
  return new Promise((resolve) => {
    const s = connect({ host, port: puerto });
    const fin = (arriba: boolean) => {
      s.destroy();
      resolve({ arriba, ms: Date.now() - inicio });
    };
    s.setTimeout(timeoutMs, () => fin(false));
    s.once("connect", () => fin(true));
    s.once("error", () => fin(false));
  });
}

export async function probarHttp(url: string, timeoutMs = 8_000): Promise<{ arriba: boolean; ms: number }> {
  const inicio = Date.now();
  try {
    const r = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    return { arriba: r.status < 500, ms: Date.now() - inicio };
  } catch {
    return { arriba: false, ms: Date.now() - inicio };
  }
}

/** Enlace del aviso: abre la IA con la pregunta ya escrita (no la envía sola). */
export function enlaceDiagnostico(deps: ModuleDeps, pregunta: string): string {
  return `https://${deps.config.env.APP_HOST}/ia?pregunta=${encodeURIComponent(pregunta.slice(0, 500))}`;
}

/** Uso de CPU (%) entre dos lecturas de la primera línea de /proc/stat. */
export function cpuEntreLecturas(a: string, b: string): number | null {
  const valores = (l: string) => l.trim().split(/\s+/).slice(1, 9).map(Number);
  const [x, y] = [valores(a), valores(b)];
  if (x.length < 5 || y.length < 5 || [...x, ...y].some((n) => !Number.isFinite(n))) return null;
  const total = (v: number[]) => v.reduce((s, n) => s + n, 0);
  const ocioso = (v: number[]) => (v[3] ?? 0) + (v[4] ?? 0);
  const dt = total(y) - total(x);
  return dt > 0 ? Math.min(100, Math.max(0, (1 - (ocioso(y) - ocioso(x)) / dt) * 100)) : null;
}

async function revisarRecursos(deps: ModuleDeps, servidores: Servidores, s: VpsServerRow): Promise<void> {
  if (!s.ramThreshold && !s.diskThreshold && !s.cpuThreshold) return;
  const ahora = deps.now();
  if (s.lastResourceAlertAt && ahora.getTime() - s.lastResourceAlertAt.getTime() < ALERTA_RECURSOS_MS) return;
  const salida = await servidores.usar(s.id, (c) => ejecutar(c, SCRIPT_METRICAS, { timeoutMs: 10_000 }));
  const { metricas } = parsearMetricas(salida.salida, ahora.getTime(), null);
  const problemas: string[] = [];
  if (s.cpuThreshold) {
    const r = await servidores.usar(s.id, (c) => ejecutar(c, "head -1 /proc/stat; sleep 1; head -1 /proc/stat", { timeoutMs: 10_000 }));
    const [a = "", b = ""] = r.salida.trim().split("\n");
    const cpu = cpuEntreLecturas(a, b);
    if (cpu !== null && cpu >= s.cpuThreshold) problemas.push(`CPU al ${cpu.toFixed(0)} % (umbral ${s.cpuThreshold} %)`);
  }
  const ram = metricas.ram.total > 0 ? (metricas.ram.usado / metricas.ram.total) * 100 : 0;
  if (s.ramThreshold && ram >= s.ramThreshold) problemas.push(`RAM al ${ram.toFixed(0)} % (umbral ${s.ramThreshold} %)`);
  for (const d of metricas.discos) {
    const pct = d.total > 0 ? (d.usado / d.total) * 100 : 0;
    if (s.diskThreshold && pct >= s.diskThreshold) problemas.push(`Disco ${d.nombre} al ${pct.toFixed(0)} % (umbral ${s.diskThreshold} %)`);
  }
  if (problemas.length === 0) return;
  await deps.db.update(vpsServers).set({ lastResourceAlertAt: ahora }).where(eq(vpsServers.id, s.id));
  await deps.notifier.send({
    title: `Mi Setup: ${s.name} con recursos altos`,
    message: `${problemas.join("\n")}\nToca para preguntarle a la IA qué pasa.`,
    priority: 4,
    tags: ["warning"],
    click: enlaceDiagnostico(deps, `El VPS "${s.name}" tiene ${problemas.join("; ")}. Revisa qué lo está causando (procesos, contenedores, logs) y dime cómo arreglarlo.`),
  });
}

/** Una pasada completa (la tarea la llama cada 60 s). */
export async function revisarAlertas(deps: ModuleDeps, servidores: Servidores): Promise<void> {
  const ahora = deps.now();
  for (const s of await servidores.listar()) {
    if (!s.alerts) continue;
    const { arriba } = await probarTcp(s.host, s.port);
    const estado = arriba ? "arriba" : "caido";
    if (s.status !== estado && s.status !== "desconocido") {
      await deps.notifier.send({
        title: arriba ? `Mi Setup: ${s.name} volvió` : `Mi Setup: ${s.name} no responde`,
        message: arriba ? `${s.host}:${s.port} responde de nuevo.` : `No hay respuesta en ${s.host}:${s.port}.`,
        priority: arriba ? 3 : 5,
        tags: [arriba ? "white_check_mark" : "rotating_light"],
        ...(arriba ? {} : { click: enlaceDiagnostico(deps, `El VPS "${s.name}" (${s.host}) dejó de responder. Ayúdame a saber por qué y qué revisar primero.`) }),
      });
      await deps.audit.record({ actorType: "sistema", action: `vps_${estado}`, module: "vps_alertas", target: s.name, outcome: "ok" });
    }
    await deps.db.update(vpsServers).set({ status: estado, lastCheckAt: ahora }).where(eq(vpsServers.id, s.id));
    if (arriba) await revisarRecursos(deps, servidores, s).catch(() => undefined);
  }

  for (const m of await deps.db.select().from(monitors)) {
    const r = m.kind === "http" ? await probarHttp(m.target) : await probarTcp(m.target, m.port ?? 80);
    const estado = r.arriba ? "arriba" : "caido";
    const cambio = m.status !== estado;
    if (cambio && m.status !== "desconocido") {
      await deps.notifier.send({
        title: r.arriba ? `Mi Setup: ${m.name} volvió` : `Mi Setup: ${m.name} está caído`,
        message: m.kind === "http" ? m.target : `${m.target}:${m.port}`,
        priority: r.arriba ? 3 : 5,
        tags: [r.arriba ? "white_check_mark" : "rotating_light"],
      });
    }
    await deps.db
      .update(monitors)
      .set({ status: estado, latencyMs: r.arriba ? r.ms : null, lastCheckAt: ahora, ...(cambio ? { lastChangeAt: ahora } : {}) })
      .where(eq(monitors.id, m.id));
  }
}

const monitorSchema = z
  .object({
    nombre: z.string().trim().min(1).max(60),
    tipo: z.enum(["tcp", "http"]),
    destino: z.string().trim().min(1).max(500),
    puerto: z.coerce.number().int().min(1).max(65535).nullable().default(null),
  })
  .refine((m) => (m.tipo === "http" ? /^https?:\/\//.test(m.destino) : m.puerto !== null), {
    message: "HTTP necesita una URL http(s); TCP necesita un puerto",
  });

export function alertasRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const aDto = (m: typeof monitors.$inferSelect) => ({
    id: m.id,
    nombre: m.name,
    tipo: m.kind,
    destino: m.target,
    puerto: m.port,
    estado: m.status,
    latenciaMs: m.latencyMs,
    ultimaRevision: m.lastCheckAt?.toISOString() ?? null,
    ultimoCambio: m.lastChangeAt?.toISOString() ?? null,
  });
  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/vps/monitores", { config: { acceso: { modulo: "vps_alertas", nivel: "lectura" } } }, async () =>
      (await db.select().from(monitors).orderBy(asc(monitors.name))).map(aDto),
    );
    app.post("/api/vps/monitores", { config: { acceso: { modulo: "vps_alertas", nivel: "escritura" } } }, async (request) => {
      const d = monitorSchema.parse(request.body);
      const [m] = await db.insert(monitors).values({ name: d.nombre, kind: d.tipo, target: d.destino, port: d.puerto }).returning();
      if (!m) throw new HttpError(500, "No se pudo guardar");
      return aDto(m);
    });
    app.delete("/api/vps/monitores/:id", { config: { acceso: { modulo: "vps_alertas", nivel: "escritura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      await db.delete(monitors).where(eq(monitors.id, id));
      return { ok: true };
    });
    // Alertas y umbrales de cada VPS (sin credenciales).
    app.patch("/api/vps/servidores/:id/alertas", { config: { acceso: { modulo: "vps_alertas", nivel: "escritura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = z
        .object({
          alertas: z.boolean().optional(),
          umbralRam: z.number().int().min(1).max(100).nullable().optional(),
          umbralDisco: z.number().int().min(1).max(100).nullable().optional(),
          umbralCpu: z.number().int().min(1).max(100).nullable().optional(),
        })
        .parse(request.body);
      await db
        .update(vpsServers)
        .set({
          ...(d.alertas !== undefined ? { alerts: d.alertas } : {}),
          ...(d.umbralRam !== undefined ? { ramThreshold: d.umbralRam } : {}),
          ...(d.umbralDisco !== undefined ? { diskThreshold: d.umbralDisco } : {}),
          ...(d.umbralCpu !== undefined ? { cpuThreshold: d.umbralCpu } : {}),
        })
        .where(eq(vpsServers.id, id));
      return { ok: true };
    });
  };
}
