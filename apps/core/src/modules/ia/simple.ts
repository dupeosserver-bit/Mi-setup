/**
 * IA de una sola pregunta para los apartados (leer un ticket, detectar texto
 * de IA, ayudar a negociar…). No tiene herramientas: nunca ejecuta nada.
 *
 * Usa la clave de Claude de la persona (o la del servidor si se lo permiten),
 * respeta el tope mensual del servidor y, si no hay Claude, la IA local.
 */
import { gte, sql } from "drizzle-orm";
import type { z } from "zod";
import { aiUsage } from "../../db/schema.js";
import { HttpError, missingConfig } from "../../http-error.js";
import type { AuthUser } from "../../security/rbac.js";
import { claveEfectiva } from "../claves-usuario.js";
import type { ModuleDeps } from "../common.js";
import { calcularCosto, clienteAnthropic, clienteOllama, type BloqueIa, type ClienteIa } from "./servicio.js";

export interface PreguntaIa {
  readonly sistema: string;
  readonly texto: string;
  /** Imágenes en base64 (solo las lee Claude). */
  readonly imagenes?: readonly { tipo: string; datos: string }[];
}

export interface IaSimple {
  disponible(usuario: Pick<AuthUser, "id" | "role">): Promise<boolean>;
  pedir(usuario: Pick<AuthUser, "id" | "role">, p: PreguntaIa): Promise<string>;
  pedirJson<T>(usuario: Pick<AuthUser, "id" | "role">, p: PreguntaIa, esquema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T>;
}

function inicioDeMes(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Saca el primer objeto o arreglo JSON de una respuesta de texto. */
export function extraerJson(texto: string): unknown {
  const inicio = texto.search(/[[{]/);
  if (inicio < 0) throw new HttpError(502, "La IA no respondió en el formato esperado");
  const abre = texto[inicio]!;
  const cierra = abre === "{" ? "}" : "]";
  const fin = texto.lastIndexOf(cierra);
  if (fin <= inicio) throw new HttpError(502, "La IA no respondió en el formato esperado");
  try {
    return JSON.parse(texto.slice(inicio, fin + 1));
  } catch {
    throw new HttpError(502, "La IA no respondió en el formato esperado");
  }
}

export function crearIaSimple(deps: ModuleDeps, inyectado?: { cliente?: ClienteIa; local?: ClienteIa }): IaSimple {
  const local = (): ClienteIa | null =>
    inyectado?.local ?? (deps.config.env.OLLAMA_URL ? clienteOllama(deps.config.env.OLLAMA_URL, deps.config.env.OLLAMA_MODEL) : null);

  async function gastoDelMes(): Promise<number> {
    const [fila] = await deps.db
      .select({ total: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, inicioDeMes(deps.now())));
    return Number(fila?.total ?? 0);
  }

  async function elegir(usuario: Pick<AuthUser, "id" | "role">, vision: boolean): Promise<{ cliente: ClienteIa; modelo: string; esLocal: boolean }> {
    if (inyectado?.cliente) return { cliente: inyectado.cliente, modelo: deps.config.env.AI_MODEL, esLocal: false };
    const clave = await claveEfectiva(deps, usuario, "ANTHROPIC_API_KEY");
    // El tope mensual solo cuenta lo que se paga con la clave del servidor.
    const sinTope = clave && (clave.origen !== "servidor" || (await gastoDelMes()) < deps.config.env.AI_MONTHLY_BUDGET_USD);
    if (clave && sinTope) return { cliente: clienteAnthropic(clave.valor), modelo: deps.config.env.AI_MODEL, esLocal: false };
    const l = local();
    if (l && !vision) return { cliente: l, modelo: deps.config.env.OLLAMA_MODEL, esLocal: true };
    if (clave) throw new HttpError(402, `Se alcanzó el tope mensual de la IA (${deps.config.env.AI_MONTHLY_BUDGET_USD} USD).`, "tope_ia");
    throw missingConfig("ANTHROPIC_API_KEY");
  }

  async function pedir(usuario: Pick<AuthUser, "id" | "role">, p: PreguntaIa): Promise<string> {
    const vision = Boolean(p.imagenes?.length);
    const { cliente, modelo } = await elegir(usuario, vision);
    const contenido: BloqueIa[] = [
      ...(p.imagenes ?? []).map((i) => ({ type: "image", source: { type: "base64", media_type: i.tipo, data: i.datos } })),
      { type: "text", text: p.texto },
    ];
    const r = await cliente.mensajes({ modelo, sistema: p.sistema, mensajes: [{ role: "user", content: contenido }], herramientas: [] });
    await deps.db.insert(aiUsage).values({
      userId: usuario.id,
      model: r.model,
      inputTokens: r.usage.input_tokens,
      outputTokens: r.usage.output_tokens,
      cacheReadTokens: r.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: r.usage.cache_creation_input_tokens ?? 0,
      costUsd: calcularCosto(r.model, r.usage).toFixed(6),
      createdAt: deps.now(),
    });
    return r.content
      .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
      .join("\n")
      .trim();
  }

  return {
    async disponible(usuario) {
      if (inyectado?.cliente) return true;
      return Boolean((await claveEfectiva(deps, usuario, "ANTHROPIC_API_KEY")) ?? local());
    },
    pedir,
    async pedirJson(usuario, p, esquema) {
      const texto = await pedir(usuario, p);
      const r = esquema.safeParse(extraerJson(texto));
      if (!r.success) throw new HttpError(502, "La IA respondió algo que no se pudo leer. Intenta de nuevo.");
      return r.data;
    },
  };
}
