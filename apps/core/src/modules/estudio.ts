/**
 * Estudio creativo: guarda lo que haces en el editor de fotos (proyectos con capas e imágenes
 * exportadas) y en el editor de video (videos terminados). Los archivos viven en
 * ARCHIVOS_DIR/estudio/<cuenta>/ y se ven con una dirección firmada (HMAC) para poder usarlos en
 * <img> y <video>, que no pueden mandar el token.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { can, type ModuleId } from "@mi-setup/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { studioProjects } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";
import { carpetaArchivos, disposicion } from "./herramientas.js";
import { tipoPorBytes } from "./notas-adjuntos.js";

const TIPOS = { foto: "editor_fotos", imagen: "editor_fotos", video: "editor_video" } as const satisfies Record<string, ModuleId>;
type Tipo = keyof typeof TIPOS;
const CUOTA = 2 * 1024 ** 3;
const MIMES_VIDEO = /^video\/(webm|mp4)$/;

export function firmarEstudio(secreto: string, id: string): string {
  return createHmac("sha256", secreto).update(`estudio:${id}`).digest("base64url").slice(0, 24);
}
export function firmaEstudioValida(secreto: string, id: string, firma: string): boolean {
  const a = Buffer.from(firmarEstudio(secreto, id));
  const b = Buffer.from(firma);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Tipo real del archivo según su kind (nunca se cree lo que dice el navegador). */
export function mimeEstudio(tipo: Tipo, buf: Buffer, declarado: string): string {
  if (tipo === "foto") {
    try {
      JSON.parse(buf.toString("utf8"));
    } catch {
      throw new HttpError(400, "El proyecto no es un archivo válido");
    }
    return "application/json";
  }
  if (tipo === "imagen") {
    const m = tipoPorBytes(buf, declarado);
    if (!/^image\/(png|jpeg|webp)$/.test(m)) throw new HttpError(415, "Solo PNG, JPG o WebP");
    return m;
  }
  const webm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
  const mp4 = buf.subarray(4, 8).toString("ascii") === "ftyp";
  if (!webm && !mp4) throw new HttpError(415, "Solo videos WebM o MP4");
  return webm ? "video/webm" : "video/mp4";
}

export function estudioRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const secreto = () => deps.config.env.JWT_SECRET ?? deps.config.env.SERVER_ENC_KEY ?? "desarrollo-sin-secreto";
  const carpeta = (userId: string) => join(carpetaArchivos(deps), "estudio", userId);

  const exigir = (request: FastifyRequest, tipo: Tipo, nivel: "lectura" | "escritura") => {
    const user = currentUser(request);
    if (!can(user, TIPOS[tipo], nivel)) throw new HttpError(403, "No tienes permiso para esto", "sin_permiso");
    return user;
  };

  const dto = (p: typeof studioProjects.$inferSelect) => ({
    id: p.id,
    tipo: p.kind as Tipo,
    nombre: p.name,
    tamano: p.size,
    miniatura: p.thumb,
    mime: p.mime,
    creado: p.createdAt.toISOString(),
    actualizado: p.updatedAt.toISOString(),
    url: `/api/estudio/archivo/${p.id}/${firmarEstudio(secreto(), p.id)}`,
  });

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/estudio/proyectos", { config: { acceso: { autenticado: true } } }, async (request) => {
      const { tipo } = z.object({ tipo: z.enum(["foto", "imagen", "video"]) }).parse(request.query);
      const user = exigir(request, tipo, "lectura");
      const filas = await db.select().from(studioProjects).where(and(eq(studioProjects.userId, user.id), eq(studioProjects.kind, tipo))).orderBy(desc(studioProjects.updatedAt)).limit(200);
      return filas.map(dto);
    });

    /** Guardar o actualizar. Los campos de texto van ANTES del archivo en el formulario. */
    app.post("/api/estudio/proyectos", { config: { acceso: { autenticado: true } } }, async (request) => {
      const archivo = await request.file({ limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
      if (!archivo) throw new HttpError(400, "Falta el archivo");
      const campo = (k: string): string | undefined => {
        const f = archivo.fields[k] as { value?: unknown } | undefined;
        return typeof f?.value === "string" ? f.value : undefined;
      };
      const d = z
        .object({
          tipo: z.enum(["foto", "imagen", "video"]),
          nombre: z.string().trim().min(1, "Ponle un nombre").max(80),
          id: z.string().uuid().optional(),
          miniatura: z.string().max(90_000).regex(/^(data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)?$/).default(""),
        })
        .parse({ tipo: campo("tipo"), nombre: campo("nombre"), ...(campo("id") ? { id: campo("id") } : {}), ...(campo("miniatura") ? { miniatura: campo("miniatura") } : {}) });
      const user = exigir(request, d.tipo, "escritura");
      const buf = await archivo.toBuffer();
      if (archivo.file.truncated) throw new HttpError(413, "El archivo pasa de 100 MB");
      if (buf.length === 0) throw new HttpError(400, "El archivo está vacío");
      const mime = mimeEstudio(d.tipo, buf, archivo.mimetype);
      const [{ usado } = { usado: 0 }] = await db.select({ usado: sql<number>`coalesce(sum(${studioProjects.size}), 0)::float8` }).from(studioProjects).where(eq(studioProjects.userId, user.id));
      const previo = d.id ? (await db.select().from(studioProjects).where(and(eq(studioProjects.id, d.id), eq(studioProjects.userId, user.id))))[0] : undefined;
      if (usado - (previo?.size ?? 0) + buf.length > CUOTA) throw new HttpError(413, "Llegaste al límite de 2 GB del estudio: borra proyectos viejos.");
      await mkdir(carpeta(user.id), { recursive: true });
      const extension = d.tipo === "foto" ? "json" : mime.split("/")[1]!.replace("jpeg", "jpg");
      const guardado = `${randomUUID()}.${extension}`;
      await writeFile(join(carpeta(user.id), guardado), buf);
      if (previo) {
        await rm(join(carpeta(user.id), basename(previo.storedName)), { force: true });
        const [p] = await db
          .update(studioProjects)
          .set({ name: d.nombre, storedName: guardado, mime, size: buf.length, thumb: d.miniatura, updatedAt: deps.now() })
          .where(eq(studioProjects.id, previo.id))
          .returning();
        return dto(p!);
      }
      const [p] = await db.insert(studioProjects).values({ userId: user.id, kind: d.tipo, name: d.nombre, storedName: guardado, mime, size: buf.length, thumb: d.miniatura }).returning();
      if (!p) throw new HttpError(500, "No se pudo guardar");
      return dto(p);
    });

    /** El contenido de un proyecto (JSON de capas) para volver a abrirlo. */
    app.get("/api/estudio/proyectos/:id/datos", { config: { acceso: { autenticado: true } } }, async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const user = currentUser(request);
      const [p] = await db.select().from(studioProjects).where(and(eq(studioProjects.id, id), eq(studioProjects.userId, user.id)));
      if (!p) throw new HttpError(404, "Proyecto no encontrado");
      exigir(request, p.kind as Tipo, "lectura");
      if (p.kind !== "foto") throw new HttpError(400, "Solo los proyectos de fotos tienen capas");
      const texto = await readFile(join(carpeta(user.id), basename(p.storedName)), "utf8").catch(() => null);
      if (texto === null) throw new HttpError(404, "El archivo ya no está");
      return reply.type("application/json").send(texto);
    });

    app.get("/api/estudio/archivo/:id/:firma", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { id, firma } = z.object({ id: z.string().uuid(), firma: z.string().max(40) }).parse(request.params);
      if (!firmaEstudioValida(secreto(), id, firma)) throw new HttpError(404, "No encontrado");
      const [p] = await db.select().from(studioProjects).where(eq(studioProjects.id, id));
      if (!p) throw new HttpError(404, "No encontrado");
      const ruta = join(carpeta(p.userId), basename(p.storedName));
      const s = await stat(ruta).catch(() => null);
      if (!s?.isFile()) throw new HttpError(404, "El archivo ya no está");
      const visible = /^image\/(png|jpeg|webp)$/.test(p.mime) || MIMES_VIDEO.test(p.mime);
      const extension = p.kind === "foto" ? "json" : p.mime.split("/")[1]!.replace("jpeg", "jpg");
      const nombre = `${p.name}.${extension}`;
      return reply
        .header("content-type", visible ? p.mime : "application/octet-stream")
        .header("content-length", String(s.size))
        .header("content-disposition", disposicion(nombre, visible ? "inline" : "attachment"))
        .header("x-content-type-options", "nosniff")
        .header("cache-control", "private, max-age=3600")
        .send(createReadStream(ruta));
    });

    app.delete("/api/estudio/proyectos/:id", { config: { acceso: { autenticado: true } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const user = currentUser(request);
      const [p] = await db.select().from(studioProjects).where(and(eq(studioProjects.id, id), eq(studioProjects.userId, user.id)));
      if (!p) return { ok: true };
      exigir(request, p.kind as Tipo, "escritura");
      await db.delete(studioProjects).where(eq(studioProjects.id, id));
      await rm(join(carpeta(user.id), basename(p.storedName)), { force: true });
      return { ok: true };
    });
  };
}
