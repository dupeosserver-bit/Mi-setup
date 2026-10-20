/**
 * Compartir una nota: enlace de solo lectura (con fotos) para mandarlo por el
 * chat de Mi Setup o a quien quieras. Uno por nota; al crear otro, el anterior
 * deja de servir. El token se guarda con hash (para buscar) y cifrado (para
 * que su dueño lo vuelva a copiar).
 *
 * También: pasar voz a texto en la PC (dictado), con Gemini.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { noteShares, notes, users } from "../db/schema.js";
import { HttpError, missingConfig } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { claveEfectiva } from "./claves-usuario.js";
import { clientInfo, idParams, requireCipher, type ModuleDeps } from "./common.js";

const MAX_AUDIO = 8 * 1024 * 1024;
const hash = (t: string) => createHash("sha256").update(t).digest("hex");

export function notasCompartirRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const escribir = { config: { acceso: { modulo: "notas" as const, nivel: "escritura" as const } } };
  const leer = { config: { acceso: { modulo: "notas" as const, nivel: "lectura" as const } } };
  const enlace = (token: string) => `https://${deps.config.env.APP_HOST}/n/${token}`;

  async function notaPropia(userId: string, id: string) {
    const [n] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, id), eq(notes.userId, userId)));
    if (!n) throw new HttpError(404, "Nota no encontrada");
  }

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/notas/:id/compartir", leer, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await notaPropia(user.id, id);
      const [c] = await db.select().from(noteShares).where(eq(noteShares.noteId, id));
      if (!c || (c.expiresAt && c.expiresAt < deps.now())) return { activo: false };
      return { activo: true, url: enlace(requireCipher(deps).decrypt(c.tokenCifrado)), vence: c.expiresAt?.toISOString() ?? null };
    });

    app.post("/api/notas/:id/compartir", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const { dias } = z.object({ dias: z.number().int().min(1).max(365).nullable().default(null) }).parse(request.body ?? {});
      await notaPropia(user.id, id);
      const token = randomBytes(24).toString("base64url");
      const vence = dias ? new Date(deps.now().getTime() + dias * 86_400_000) : null;
      await db.delete(noteShares).where(eq(noteShares.noteId, id));
      await db.insert(noteShares).values({ noteId: id, userId: user.id, tokenHash: hash(token), tokenCifrado: requireCipher(deps).encrypt(token), expiresAt: vence });
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "nota_compartida", module: "notas", target: id, outcome: "ok", ...clientInfo(request) });
      return { activo: true, url: enlace(token), vence: vence?.toISOString() ?? null };
    });

    app.delete("/api/notas/:id/compartir", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await notaPropia(user.id, id);
      await db.delete(noteShares).where(eq(noteShares.noteId, id));
      return { activo: false };
    });

    /** Página pública de la nota (solo lectura). Las fotos van con su dirección firmada. */
    app.get("/api/notas-publicas/:token", { config: { acceso: { publico: true } } }, async (request) => {
      const { token } = z.object({ token: z.string().min(20).max(64) }).parse(request.params);
      const [fila] = await db
        .select({ n: notes, vence: noteShares.expiresAt, autor: users.displayName })
        .from(noteShares)
        .innerJoin(notes, eq(notes.id, noteShares.noteId))
        .innerJoin(users, eq(users.id, noteShares.userId))
        .where(eq(noteShares.tokenHash, hash(token)));
      if (!fila || (fila.vence && fila.vence < deps.now())) throw new HttpError(404, "Este enlace ya no sirve");
      return { titulo: fila.n.title, icono: fila.n.icon, contenido: fila.n.content, autor: fila.autor, actualizada: fila.n.updatedAt.toISOString() };
    });

    // ---------------------------------------------------------------- voz a texto (PC)
    app.post("/api/voz/transcribir", { config: { acceso: { autenticado: true } } }, async (request) => {
      const user = currentUser(request);
      const clave = (await claveEfectiva(deps, user, "GEMINI_API_KEY"))?.valor;
      if (!clave) throw missingConfig("GEMINI_API_KEY");
      const archivo = await request.file({ limits: { fileSize: MAX_AUDIO, files: 1 } });
      if (!archivo) throw new HttpError(400, "Falta el audio");
      const buf = await archivo.toBuffer();
      if (archivo.file.truncated) throw new HttpError(413, "El audio es muy largo");
      const tipo = /^audio\/(webm|ogg|mp4|mpeg|wav)/.exec(archivo.mimetype)?.[0] ?? "audio/webm";
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(deps.config.env.GEMINI_TEXT_MODEL)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": clave },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: "Transcribe exactamente lo que se dice en este audio, en el idioma en que se habla. Devuelve solo el texto, con puntuación, sin comentarios. Si no se entiende nada, devuelve vacío." },
                { inlineData: { mimeType: tipo, data: buf.toString("base64") } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      }).catch(() => null);
      if (!r) throw new HttpError(502, "Gemini no respondió");
      const cuerpo = (await r.json().catch(() => null)) as { error?: { message?: string }; candidates?: { content?: { parts?: { text?: string }[] } }[] } | null;
      if (!r.ok) {
        if (r.status === 429) throw new HttpError(429, "Llegaste al límite de Gemini por ahora.");
        throw new HttpError(502, `Gemini respondió ${r.status}: ${(cuerpo?.error?.message ?? "error").slice(0, 200)}`);
      }
      return { texto: (cuerpo?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim() };
    });
  };
}
