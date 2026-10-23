/**
 * Herramientas del servidor:
 * - Enlaces cortos de tu dominio (/l/<codigo>) con contador de clics.
 * - Compartir archivos por enlace (/s/<codigo>), tipo Mega o MediaFire, con
 *   contraseña, caducidad y límite de descargas opcionales.
 * - Portapapeles compartido entre tus equipos.
 * - Página aislada para la vista previa de HTML (sin acceso a la sesión).
 * - Convertidor de audio y video con ffmpeg.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rm, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { hashSecret, verifySecret } from "../auth/password.js";
import { clipboardItems, sharedFiles, shortLinks } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "./common.js";

const MAX_COMPARTIR = 2 * 1024 * 1024 * 1024;
const MAX_CONVERTIR = 500 * 1024 * 1024;
const MAX_PORTAPAPELES = 50;
const CODIGO = /^[a-zA-Z0-9_-]{3,40}$/;

export function carpetaArchivos(deps: ModuleDeps): string {
  return deps.config.env.ARCHIVOS_DIR ?? join(deps.config.uploadsDir, "..", "archivos");
}

const codigoAleatorio = (n = 7) => randomBytes(n).toString("base64url").slice(0, n);

/** Nombre seguro para Content-Disposition (con versión UTF-8). */
export function disposicion(nombre: string, tipo: "attachment" | "inline" = "attachment"): string {
  const simple = nombre.replace(/[^\w.() -]/g, "_").slice(0, 150) || "archivo";
  return `${tipo}; filename="${simple}"; filename*=UTF-8''${encodeURIComponent(nombre)}`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function tamanoLegible(b: number): string {
  if (b < 1024) return `${b} B`;
  const u = ["KB", "MB", "GB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${u[i]}`;
}

/** Página pública sencilla (oscura, legible en celular) para bajar un archivo compartido. */
function paginaCompartido(f: { name: string; size: number; conClave: boolean; codigo: string }, error?: string): string {
  const cuerpo = f.conClave
    ? `<form method="post" action="/s/${esc(f.codigo)}"><input type="password" name="clave" placeholder="Contraseña" required autofocus><button type="submit">Descargar</button></form>`
    : `<a class="boton" href="/s/${esc(f.codigo)}/archivo">Descargar</a>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(f.name)}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#121212;color:#eee;font-family:system-ui,sans-serif;padding:16px;box-sizing:border-box}
.c{max-width:420px;width:100%;background:#1e1e1e;border:1px solid #333;border-radius:20px;padding:24px;text-align:center}
h1{font-size:18px;word-break:break-word}p{color:#aaa;font-size:14px}.boton,button{display:block;width:100%;box-sizing:border-box;margin-top:12px;padding:14px;border:0;border-radius:14px;background:#4ade80;color:#000;font-weight:700;font-size:16px;text-decoration:none;cursor:pointer}
input{width:100%;box-sizing:border-box;padding:12px;border-radius:12px;border:1px solid #444;background:#121212;color:#eee;font-size:16px}.e{color:#f87171}</style></head>
<body><div class="c"><p>Te compartieron un archivo</p><h1>${esc(f.name)}</h1><p>${tamanoLegible(f.size)}</p>${error ? `<p class="e">${esc(error)}</p>` : ""}${cuerpo}</div></body></html>`;
}

const FORMATOS = {
  mp3: { ext: "mp3", mime: "audio/mpeg", args: ["-vn", "-c:a", "libmp3lame", "-q:a", "2"] },
  m4a: { ext: "m4a", mime: "audio/mp4", args: ["-vn", "-c:a", "aac", "-b:a", "192k"] },
  wav: { ext: "wav", mime: "audio/wav", args: ["-vn"] },
  mp4: { ext: "mp4", mime: "video/mp4", args: ["-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-vf", "scale='min(1280,iw)':-2", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"] },
  webm: { ext: "webm", mime: "video/webm", args: ["-c:v", "libvpx-vp9", "-crf", "35", "-b:v", "0", "-c:a", "libopus"] },
  gif: { ext: "gif", mime: "image/gif", args: ["-vf", "fps=12,scale=480:-1:flags=lanczos", "-t", "20"] },
} as const;

function correrFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let error = "";
    p.stderr.on("data", (d: Buffer) => (error = (error + d.toString()).slice(-2000)));
    p.on("error", () => reject(new HttpError(501, "El servidor no tiene ffmpeg instalado (se instala solo al actualizar el VPS con Docker).")));
    p.on("close", (codigo) => (codigo === 0 ? resolve() : reject(new HttpError(422, `No se pudo convertir: ${error.trim().split("\n").pop() ?? "error"}`))));
  });
}

export function herramientasRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const dirCompartidos = join(carpetaArchivos(deps), "compartidos");

  /** Entrega un archivo compartido (cuenta la descarga y respeta límite y caducidad). */
  async function entregar(reply: FastifyReply, f: typeof sharedFiles.$inferSelect) {
    const [act] = await db
      .update(sharedFiles)
      .set({ downloads: sql`${sharedFiles.downloads} + 1` })
      .where(and(eq(sharedFiles.id, f.id), sql`(${sharedFiles.maxDownloads} IS NULL OR ${sharedFiles.downloads} < ${sharedFiles.maxDownloads})`))
      .returning({ id: sharedFiles.id });
    if (!act) throw new HttpError(410, "Este archivo ya alcanzó su límite de descargas");
    return reply
      .header("content-type", f.mime)
      .header("content-length", String(f.size))
      .header("content-disposition", disposicion(f.name))
      .header("cache-control", "no-store")
      .send(createReadStream(join(dirCompartidos, f.storedName)));
  }

  async function buscarCompartido(codigo: string) {
    if (!CODIGO.test(codigo)) return null;
    const [f] = await db.select().from(sharedFiles).where(eq(sharedFiles.code, codigo));
    if (!f) return null;
    if (f.expiresAt && f.expiresAt < deps.now()) return null;
    if (f.maxDownloads !== null && f.downloads >= f.maxDownloads) return null;
    return f;
  }

  return async function (app: FastifyInstance): Promise<void> {
    // El formulario de contraseña de /s/<codigo> llega como formulario HTML.
    if (!app.hasContentTypeParser("application/x-www-form-urlencoded")) {
      app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 4096 }, (_req, cuerpo, hecho) => {
        hecho(null, Object.fromEntries(new URLSearchParams(String(cuerpo))));
      });
    }

    // ---------------------------------------------------------------- enlaces cortos
    const enlacesLeer = { config: { acceso: { modulo: "enlaces" as const, nivel: "lectura" as const } } };
    const enlacesEscribir = { config: { acceso: { modulo: "enlaces" as const, nivel: "escritura" as const } } };

    app.get("/api/enlaces", enlacesLeer, async (request) => {
      const filas = await db.select().from(shortLinks).where(eq(shortLinks.userId, currentUser(request).id)).orderBy(desc(shortLinks.createdAt));
      return filas.map((l) => ({ id: l.id, codigo: l.code, destino: l.target, clics: l.clicks, activo: l.active, creado: l.createdAt.toISOString() }));
    });

    app.post("/api/enlaces", enlacesEscribir, async (request) => {
      const user = currentUser(request);
      const d = z
        .object({
          destino: z.string().trim().url("Pega un enlace completo (https://…)").max(4000).refine((u) => /^https?:\/\//i.test(u), "Solo enlaces http o https"),
          codigo: z.string().trim().regex(CODIGO, "Usa de 3 a 40 letras, números, - o _").optional().or(z.literal("")),
        })
        .parse(request.body);
      const codigo = d.codigo || codigoAleatorio(6);
      const [existe] = await db.select({ id: shortLinks.id }).from(shortLinks).where(eq(shortLinks.code, codigo));
      if (existe) throw new HttpError(409, "Ese nombre corto ya está en uso");
      const [l] = await db.insert(shortLinks).values({ userId: user.id, code: codigo, target: d.destino }).returning();
      if (!l) throw new HttpError(500, "No se pudo guardar");
      return { id: l.id, codigo: l.code };
    });

    app.patch("/api/enlaces/:id", enlacesEscribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = z
        .object({
          activo: z.boolean().optional(),
          destino: z.string().trim().url("Pega un enlace completo (https://…)").max(4000).refine((u) => /^https?:\/\//i.test(u), "Solo enlaces http o https").optional(),
        })
        .refine((x) => x.activo !== undefined || x.destino !== undefined, "Nada que cambiar")
        .parse(request.body);
      await db
        .update(shortLinks)
        .set({ ...(d.activo !== undefined ? { active: d.activo } : {}), ...(d.destino ? { target: d.destino } : {}) })
        .where(and(eq(shortLinks.id, id), eq(shortLinks.userId, currentUser(request).id)));
      return { ok: true };
    });

    app.delete("/api/enlaces/:id", enlacesEscribir, async (request) => {
      const { id } = idParams.parse(request.params);
      await db.delete(shortLinks).where(and(eq(shortLinks.id, id), eq(shortLinks.userId, currentUser(request).id)));
      return { ok: true };
    });

    // Público: redirige y cuenta el clic.
    app.get("/l/:codigo", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { codigo } = z.object({ codigo: z.string().max(60) }).parse(request.params);
      if (!CODIGO.test(codigo)) throw new HttpError(404, "Enlace no encontrado");
      const [l] = await db
        .update(shortLinks)
        .set({ clicks: sql`${shortLinks.clicks} + 1` })
        .where(and(eq(shortLinks.code, codigo), eq(shortLinks.active, true)))
        .returning({ destino: shortLinks.target });
      if (!l) throw new HttpError(404, "Enlace no encontrado o desactivado");
      return reply.redirect(l.destino, 302);
    });

    // ---------------------------------------------------------------- compartir archivos
    const compartirLeer = { config: { acceso: { modulo: "compartir" as const, nivel: "lectura" as const } } };
    const compartirEscribir = { config: { acceso: { modulo: "compartir" as const, nivel: "escritura" as const } } };

    app.get("/api/compartir", compartirLeer, async (request) => {
      const user = currentUser(request);
      const filas = await db.select().from(sharedFiles).where(eq(sharedFiles.userId, user.id)).orderBy(desc(sharedFiles.createdAt));
      const [uso] = await db.select({ total: sql<string>`coalesce(sum(${sharedFiles.size}), 0)` }).from(sharedFiles);
      const ahora = deps.now();
      return {
        usoTotal: Number(uso?.total ?? 0),
        archivos: filas.map((f) => ({
          id: f.id,
          codigo: f.code,
          nombre: f.name,
          tamano: f.size,
          conClave: Boolean(f.passwordHash),
          caduca: f.expiresAt?.toISOString() ?? null,
          caducado: Boolean(f.expiresAt && f.expiresAt < ahora) || (f.maxDownloads !== null && f.downloads >= f.maxDownloads),
          limite: f.maxDownloads,
          descargas: f.downloads,
          creado: f.createdAt.toISOString(),
        })),
      };
    });

    app.post("/api/compartir", { ...compartirEscribir, bodyLimit: MAX_COMPARTIR + 1024 * 1024 }, async (request) => {
      const user = currentUser(request);
      const opciones = z
        .object({
          clave: z.string().max(200).optional(),
          dias: z.coerce.number().int().min(0).max(365).default(0),
          limite: z.coerce.number().int().min(0).max(100_000).default(0),
        })
        .parse(request.query);
      const archivo = await request.file({ limits: { fileSize: MAX_COMPARTIR, files: 1 } });
      if (!archivo) throw new HttpError(400, "Falta el archivo");
      await mkdir(dirCompartidos, { recursive: true });
      const guardado = `${randomBytes(16).toString("hex")}`;
      const ruta = join(dirCompartidos, guardado);
      await pipeline(archivo.file, createWriteStream(ruta));
      if (archivo.file.truncated) {
        await unlink(ruta).catch(() => undefined);
        throw new HttpError(413, "El archivo supera 2 GB");
      }
      const tamano = (await stat(ruta)).size;
      const [f] = await db
        .insert(sharedFiles)
        .values({
          userId: user.id,
          code: codigoAleatorio(10),
          name: archivo.filename.slice(0, 200) || "archivo",
          storedName: guardado,
          size: tamano,
          mime: archivo.mimetype || "application/octet-stream",
          passwordHash: opciones.clave ? await hashSecret(opciones.clave) : null,
          expiresAt: opciones.dias ? new Date(deps.now().getTime() + opciones.dias * 86_400_000) : null,
          maxDownloads: opciones.limite || null,
        })
        .returning();
      if (!f) throw new HttpError(500, "No se pudo guardar");
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "archivo_compartido", module: "compartir", target: f.name, outcome: "ok", ...clientInfo(request) });
      return { id: f.id, codigo: f.code };
    });

    app.delete("/api/compartir/:id", compartirEscribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const [f] = await db.delete(sharedFiles).where(and(eq(sharedFiles.id, id), eq(sharedFiles.userId, currentUser(request).id))).returning();
      if (f) await unlink(join(dirCompartidos, f.storedName)).catch(() => undefined);
      return { ok: true };
    });

    // Página pública para descargar (con o sin contraseña).
    app.get("/s/:codigo", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { codigo } = z.object({ codigo: z.string().max(60) }).parse(request.params);
      const f = await buscarCompartido(codigo);
      if (!f) return reply.code(404).type("text/html; charset=utf-8").send(paginaCompartido({ name: "Este enlace ya no existe o caducó", size: 0, conClave: false, codigo: "" }).replace(/<a class="boton"[^>]*>Descargar<\/a>/, ""));
      return reply.type("text/html; charset=utf-8").send(paginaCompartido({ name: f.name, size: f.size, conClave: Boolean(f.passwordHash), codigo }));
    });

    app.get("/s/:codigo/archivo", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { codigo } = z.object({ codigo: z.string().max(60) }).parse(request.params);
      const f = await buscarCompartido(codigo);
      if (!f || f.passwordHash) throw new HttpError(404, "No encontrado");
      return entregar(reply, f);
    });

    app.post("/s/:codigo", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { codigo } = z.object({ codigo: z.string().max(60) }).parse(request.params);
      const f = await buscarCompartido(codigo);
      if (!f) throw new HttpError(404, "No encontrado");
      const { clave } = z.object({ clave: z.string().max(200).default("") }).parse(request.body ?? {});
      if (f.passwordHash && !(await verifySecret(f.passwordHash, clave))) {
        return reply.code(401).type("text/html; charset=utf-8").send(paginaCompartido({ name: f.name, size: f.size, conClave: true, codigo }, "Contraseña incorrecta"));
      }
      return entregar(reply, f);
    });

    /** Limpieza: borra del disco y de la lista lo que ya caducó (la llama una tarea diaria). */
    app.addHook("onReady", async () => {
      await mkdir(dirCompartidos, { recursive: true }).catch(() => undefined);
    });

    // ---------------------------------------------------------------- portapapeles
    const portaLeer = { config: { acceso: { modulo: "portapapeles" as const, nivel: "lectura" as const } } };
    const portaEscribir = { config: { acceso: { modulo: "portapapeles" as const, nivel: "escritura" as const } } };

    app.get("/api/portapapeles", portaLeer, async (request) => {
      const filas = await db.select().from(clipboardItems).where(eq(clipboardItems.userId, currentUser(request).id)).orderBy(desc(clipboardItems.createdAt)).limit(MAX_PORTAPAPELES);
      return filas.map((c) => ({ id: c.id, contenido: c.content, equipo: c.device, fecha: c.createdAt.toISOString() }));
    });

    app.post("/api/portapapeles", portaEscribir, async (request) => {
      const user = currentUser(request);
      const d = z.object({ contenido: z.string().min(1, "No hay nada que enviar").max(100_000), equipo: z.string().max(60).optional() }).parse(request.body);
      await db.insert(clipboardItems).values({ userId: user.id, content: d.contenido, device: d.equipo ?? null });
      // Solo se guardan los últimos 50.
      const viejos = await db.select({ id: clipboardItems.id }).from(clipboardItems).where(eq(clipboardItems.userId, user.id)).orderBy(desc(clipboardItems.createdAt)).offset(MAX_PORTAPAPELES);
      for (const v of viejos) await db.delete(clipboardItems).where(eq(clipboardItems.id, v.id));
      deps.hub.publicar(`usuario:${user.id}`, { recurso: "portapapeles", aviso: { titulo: "Portapapeles", cuerpo: d.contenido.slice(0, 80) } });
      return { ok: true };
    });

    app.delete("/api/portapapeles/:id", portaEscribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const user = currentUser(request);
      await db.delete(clipboardItems).where(and(eq(clipboardItems.id, id), eq(clipboardItems.userId, user.id)));
      deps.hub.publicar(`usuario:${user.id}`, { recurso: "portapapeles" });
      return { ok: true };
    });

    app.delete("/api/portapapeles", portaEscribir, async (request) => {
      const user = currentUser(request);
      await db.delete(clipboardItems).where(eq(clipboardItems.userId, user.id));
      deps.hub.publicar(`usuario:${user.id}`, { recurso: "portapapeles" });
      return { ok: true };
    });

    // ---------------------------------------------------------------- vista previa HTML
    /**
     * Página en blanco que pinta el código que le manda la app por postMessage.
     * La app la abre en un iframe con sandbox (sin allow-same-origin): corre con
     * origen opaco, así que el código no puede leer la sesión ni la app.
     */
    app.get("/vista-previa", { config: { acceso: { publico: true } } }, async (_request, reply) => {
      reply.removeHeader("x-frame-options");
      return reply
        .header(
          "content-security-policy",
          "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src * data: blob:; font-src * data:; media-src * data: blob:; connect-src https:; frame-ancestors *",
        )
        .type("text/html; charset=utf-8")
        .send(
          // El código del usuario corre en un marco interno (srcdoc, aislado). Esta página
          // nunca se reemplaza, así que sigue escuchando cada cambio o "Ejecutar".
          `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0;display:block;background:#fff}</style></head><body><iframe id="f" sandbox="allow-scripts allow-modals allow-forms allow-popups"></iframe><script>var f=document.getElementById("f");window.addEventListener("message",function(e){if(e.source!==parent||typeof e.data!=="string")return;f.srcdoc=e.data;});parent.postMessage("vista-previa-lista","*");</script></body></html>`,
        );
    });

    // ---------------------------------------------------------------- convertidor (audio y video)
    app.post(
      "/api/convertidor/media",
      { config: { acceso: { modulo: "convertidor", nivel: "escritura" } }, bodyLimit: MAX_CONVERTIR + 1024 * 1024 },
      async (request, reply) => {
        const q = z
          .object({
            formato: z.enum(Object.keys(FORMATOS) as [keyof typeof FORMATOS, ...(keyof typeof FORMATOS)[]]),
            desde: z.coerce.number().min(0).max(86_400).optional(),
            hasta: z.coerce.number().min(0).max(86_400).optional(),
          })
          .parse(request.query);
        const archivo = await request.file({ limits: { fileSize: MAX_CONVERTIR, files: 1 } });
        if (!archivo) throw new HttpError(400, "Falta el archivo");
        const dir = join(tmpdir(), `convertir-${randomBytes(8).toString("hex")}`);
        await mkdir(dir, { recursive: true });
        const entrada = join(dir, "entrada");
        const f = FORMATOS[q.formato];
        const salida = join(dir, `salida.${f.ext}`);
        try {
          await pipeline(archivo.file, createWriteStream(entrada));
          if (archivo.file.truncated) throw new HttpError(413, "El archivo supera 500 MB");
          const recorte = [...(q.desde !== undefined ? ["-ss", String(q.desde)] : []), ...(q.hasta !== undefined ? ["-to", String(q.hasta)] : [])];
          await correrFfmpeg([...recorte, "-i", entrada, ...f.args, salida]);
          const nombre = `${archivo.filename.replace(/\.[^.]+$/, "") || "convertido"}.${f.ext}`;
          const tamano = (await stat(salida)).size;
          const flujo = createReadStream(salida);
          flujo.on("close", () => void rm(dir, { recursive: true, force: true }));
          return reply.header("content-type", f.mime).header("content-length", String(tamano)).header("content-disposition", disposicion(nombre)).send(flujo);
        } catch (err) {
          await rm(dir, { recursive: true, force: true });
          throw err;
        }
      },
    );
  };
}

/** Tarea diaria: borra los archivos compartidos que ya caducaron. */
export async function limpiarCompartidos(deps: ModuleDeps): Promise<void> {
  const dir = join(carpetaArchivos(deps), "compartidos");
  const caducados = await deps.db.select().from(sharedFiles).where(sql`${sharedFiles.expiresAt} IS NOT NULL AND ${sharedFiles.expiresAt} < ${deps.now()}`);
  for (const f of caducados) {
    await unlink(join(dir, f.storedName)).catch(() => undefined);
    await deps.db.delete(sharedFiles).where(eq(sharedFiles.id, f.id));
  }
  // Archivos huérfanos (sin fila): restos de subidas interrumpidas.
  const enUso = new Set((await deps.db.select({ n: sharedFiles.storedName }).from(sharedFiles)).map((f) => f.n));
  for (const n of await readdir(dir).catch(() => [] as string[])) if (!enUso.has(n)) await unlink(join(dir, n)).catch(() => undefined);
}
