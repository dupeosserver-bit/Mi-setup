/** Rutas de la IA asistente (módulo "ia"): chat, conversaciones, uso y cola de propuestas. */
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { aiConversations, aiMessages, aiProposals } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import { currentUser, type AuthUser } from "../../security/rbac.js";
import { idParams, type ModuleDeps } from "../common.js";
import { crearHerramientas, type ContextoHerramientas, type Herramienta } from "./herramientas.js";
import { clienteAnthropic, propuestaDto, ServicioIa, type BloqueIa, type ClienteIa } from "./servicio.js";

const chatSchema = z.object({
  conversacionId: z.string().uuid().optional(),
  mensaje: z.string().trim().min(1, "Escribe un mensaje").max(8000),
  modulo: z.string().max(40).optional(),
});

export interface OpcionesIa {
  readonly contexto: Omit<ContextoHerramientas, "deps">;
  /** Cliente inyectado (pruebas). Si no se da, se usa ANTHROPIC_API_KEY. */
  readonly cliente?: ClienteIa;
  /** Herramientas adicionales registradas por otros módulos. */
  readonly extras?: Herramienta[];
  /** Contexto adicional no secreto (p. ej. canales de Discord). */
  readonly contextos?: ((user: AuthUser) => Promise<string | null>)[];
}

export function iaRoutes(deps: ModuleDeps, opciones: OpcionesIa) {
  const llave = deps.config.env.ANTHROPIC_API_KEY;
  const cliente = opciones.cliente ?? (llave ? clienteAnthropic(llave) : null);
  const herramientas = crearHerramientas({ deps, ...opciones.contexto }, opciones.extras);
  const servicio = new ServicioIa(deps, herramientas, cliente, opciones.contextos);
  const leer = { config: { acceso: { modulo: "ia" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "ia" as const, nivel: "escritura" as const } } };

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/ia/uso", leer, async () => servicio.uso());

    app.post("/api/ia/chat", escribir, async (request) => servicio.chat(currentUser(request), chatSchema.parse(request.body)));

    app.get("/api/ia/conversaciones", leer, async (request) => {
      const user = currentUser(request);
      const filas = await deps.db
        .select()
        .from(aiConversations)
        .where(eq(aiConversations.userId, user.id))
        .orderBy(desc(aiConversations.updatedAt))
        .limit(100);
      return filas.map((c) => ({ id: c.id, titulo: c.title, actualizada: c.updatedAt.toISOString() }));
    });

    app.get("/api/ia/conversaciones/:id", leer, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const [c] = await deps.db.select().from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id)));
      if (!c) throw new HttpError(404, "Conversación no encontrada");
      const mensajes = await deps.db.select().from(aiMessages).where(eq(aiMessages.conversationId, id)).orderBy(aiMessages.id);
      const propuestas = await deps.db
        .select()
        .from(aiProposals)
        .where(eq(aiProposals.conversationId, id))
        .orderBy(aiProposals.createdAt);
      // Para mostrar: solo texto visible (sin el bloque de contexto ni resultados internos).
      const visibles = mensajes.flatMap((m) => {
        const texto = (m.content as BloqueIa[])
          .filter((b) => b.type === "text" && typeof b.text === "string")
          .map((b) => (b.text as string).replace(/^<contexto>[\s\S]*?<\/contexto>\s*/, ""))
          .join("\n")
          .trim();
        return texto ? [{ id: m.id, rol: m.role, texto, fecha: m.createdAt.toISOString() }] : [];
      });
      return { id: c.id, titulo: c.title, mensajes: visibles, propuestas: propuestas.map(propuestaDto) };
    });

    app.delete("/api/ia/conversaciones/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await deps.db.delete(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, user.id)));
      return { ok: true };
    });

    app.get("/api/ia/propuestas", leer, async (request) => {
      const user = currentUser(request);
      const { estado } = z
        .object({ estado: z.enum(["pendiente", "aprobada", "rechazada", "ejecutada", "fallida"]).optional() })
        .parse(request.query);
      const filtro = estado ? and(eq(aiProposals.userId, user.id), eq(aiProposals.status, estado)) : eq(aiProposals.userId, user.id);
      const filas = await deps.db.select().from(aiProposals).where(filtro).orderBy(desc(aiProposals.createdAt)).limit(200);
      return filas.map(propuestaDto);
    });

    app.post("/api/ia/propuestas/:id/aprobar", escribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const { confirmacion } = z.object({ confirmacion: z.string().max(40).optional() }).parse(request.body ?? {});
      return servicio.aprobar(currentUser(request), id, confirmacion);
    });

    app.post("/api/ia/propuestas/:id/rechazar", escribir, async (request) => {
      const { id } = idParams.parse(request.params);
      return servicio.rechazar(currentUser(request), id);
    });
  };
}
