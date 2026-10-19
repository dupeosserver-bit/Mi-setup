/**
 * Adjuntos del bloc de notas: fotos, dibujos y archivos dentro de una nota (como Samsung Notes).
 * Los archivos viven en ARCHIVOS_DIR/notas/<nota>/. Para verlos en <img> (que no puede mandar el token)
 * cada adjunto tiene una dirección firmada (HMAC) que solo conoce quien abrió la nota.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { noteAttachments, notes } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";
import { carpetaArchivos, disposicion } from "./herramientas.js";

const MAX_ADJUNTO = 25 * 1024 * 1024;
/** Solo estos tipos se muestran dentro de la página; todo lo demás se descarga (nunca se ejecuta en el navegador). */
const IMAGEN_SEGURA = /^image\/(png|jpeg|webp|gif)$/;

export function firmarAdjunto(secreto: string, id: string): string {
  return createHmac("sha256", secreto).update(`nota-adjunto:${id}`).digest("base64url").slice(0, 24);
}

export function firmaValida(secreto: string, id: string, firma: string): boolean {
  const esperada = Buffer.from(firmarAdjunto(secreto, id));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** Tipo real por los primeros bytes (el que manda el navegador no se cree). */
export function tipoPorBytes(buf: Buffer, declarado: string): string {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buf.subarray(0, 4).toString("ascii") === "GIF8") return "image/gif";
  return declarado.startsWith("image/") ? "application/octet-stream" : declarado || "application/octet-stream";
}

export function notasAdjuntosRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const secreto = () => deps.config.env.JWT_SECRET ?? deps.config.env.SERVER_ENC_KEY ?? "desarrollo-sin-secreto";
  const carpeta = (notaId: string) => join(carpetaArchivos(deps), "notas", notaId);
  const leer = { config: { acceso: { modulo: "notas" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "notas" as const, nivel: "escritura" as const } } };

  const dto = (a: typeof noteAttachments.$inferSelect) => ({
    id: a.id,
    nombre: a.name,
    tipo: a.mime,
    tamano: a.size,
    imagen: IMAGEN_SEGURA.test(a.mime),
    url: `/api/notas/adjuntos/${a.id}/${firmarAdjunto(secreto(), a.id)}`,
  });

  async function notaPropia(userId: string, id: string): Promise<void> {
    const [n] = await db.select({ id: notes.id }).from(notes).where(and(eq(notes.id, id), eq(notes.userId, userId)));
    if (!n) throw new HttpError(404, "Nota no encontrada");
  }

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/notas/:id/adjuntos", leer, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await notaPropia(user.id, id);
      const filas = await db.select().from(noteAttachments).where(eq(noteAttachments.noteId, id)).orderBy(asc(noteAttachments.createdAt));
      return filas.map(dto);
    });

    app.post("/api/notas/:id/adjuntos", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await notaPropia(user.id, id);
      const archivo = await request.file({ limits: { fileSize: MAX_ADJUNTO, files: 1 } });
      if (!archivo) throw new HttpError(400, "Falta el archivo");
      const buf = await archivo.toBuffer();
      if (archivo.file.truncated) throw new HttpError(413, "El archivo pasa de 25 MB");
      if (buf.length === 0) throw new HttpError(400, "El archivo está vacío");
      const nombre = basename(archivo.filename || "archivo").replace(/[^\w.() áéíóúñÁÉÍÓÚÑ-]/g, "_").slice(0, 120) || "archivo";
      const mime = tipoPorBytes(buf, archivo.mimetype);
      const guardado = `${randomUUID()}.bin`;
      await mkdir(carpeta(id), { recursive: true });
      await writeFile(join(carpeta(id), guardado), buf);
      const [a] = await db.insert(noteAttachments).values({ noteId: id, userId: user.id, name: nombre, storedName: guardado, mime, size: buf.length }).returning();
      if (!a) throw new HttpError(500, "No se pudo guardar");
      return dto(a);
    });

    /** Ver o descargar. La firma va en la dirección: sirve para <img> sin mandar el token. */
    app.get("/api/notas/adjuntos/:id/:firma", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { id, firma } = z.object({ id: z.string().uuid(), firma: z.string().max(40) }).parse(request.params);
      if (!firmaValida(secreto(), id, firma)) throw new HttpError(404, "No encontrado");
      const [a] = await db.select().from(noteAttachments).where(eq(noteAttachments.id, id));
      if (!a) throw new HttpError(404, "No encontrado");
      const ruta = join(carpeta(a.noteId), basename(a.storedName));
      const s = await stat(ruta).catch(() => null);
      if (!s?.isFile()) throw new HttpError(404, "El archivo ya no está");
      const imagen = IMAGEN_SEGURA.test(a.mime);
      return reply
        .header("content-type", imagen ? a.mime : "application/octet-stream")
        .header("content-length", String(s.size))
        .header("content-disposition", disposicion(a.name, imagen ? "inline" : "attachment"))
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "private, max-age=3600")
        .send(createReadStream(ruta));
    });

    app.delete("/api/notas/adjuntos/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const [a] = await db.delete(noteAttachments).where(and(eq(noteAttachments.id, id), eq(noteAttachments.userId, user.id))).returning();
      if (a) await rm(join(carpeta(a.noteId), basename(a.storedName)), { force: true });
      return { ok: true };
    });
  };
}

/** Al borrar una nota: sus archivos también (las filas se van solas por la relación). */
export async function borrarCarpetaAdjuntos(deps: ModuleDeps, notaId: string): Promise<void> {
  await rm(join(carpetaArchivos(deps), "notas", notaId), { recursive: true, force: true });
}
