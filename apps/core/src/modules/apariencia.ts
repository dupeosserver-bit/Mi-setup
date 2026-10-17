/**
 * Ajustes → Apariencia: el usuario sube su logo, un fondo opcional y el
 * avatar de su cuenta. Se valida el tipo real del archivo (png/jpg/webp/svg
 * saneado) y el tamaño (≤ 5 MB). Restablecer vuelve al logo de MexicanLand.
 */
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { users } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, type ModuleDeps } from "./common.js";
import { deleteSetting, getSetting, setSetting } from "./settings.js";

export const MAX_IMAGEN_BYTES = 5 * 1024 * 1024;

export interface ImagenValida {
  readonly ext: "png" | "jpg" | "webp" | "svg";
}

const SVG_PELIGROSO =
  /<script|<foreignObject|<iframe|<embed|<object|<use[^>]+href\s*=\s*["'](?!#)|\son[a-z]+\s*=|javascript:|data:text\/html|(xlink:)?href\s*=\s*["'](?!#)|@import|<!ENTITY/i;

/** Detecta el tipo por sus primeros bytes; los SVG con contenido activo se rechazan. */
export function validarImagen(buf: Buffer): ImagenValida {
  if (buf.length === 0) throw new HttpError(400, "El archivo está vacío");
  if (buf.length > MAX_IMAGEN_BYTES) throw new HttpError(413, "La imagen supera 5 MB");
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg" };
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") {
    return { ext: "webp" };
  }
  const texto = buf.subarray(0, 512).toString("utf8").trimStart();
  if (texto.startsWith("<svg") || (texto.startsWith("<?xml") && buf.toString("utf8").includes("<svg"))) {
    if (SVG_PELIGROSO.test(buf.toString("utf8"))) {
      throw new HttpError(400, "El SVG contiene scripts o enlaces externos y no se acepta");
    }
    return { ext: "svg" };
  }
  throw new HttpError(415, "Formato no permitido. Usa PNG, JPG, WEBP o SVG");
}

const tipoGlobal = z.object({ tipo: z.enum(["logo", "fondo"]) });
const CLAVE = (tipo: "logo" | "fondo") => `apariencia.${tipo}`;
const url = (archivo: string | null | undefined) => (archivo ? `/uploads/${archivo}` : null);

export function aparienciaRoutes(deps: ModuleDeps) {
  const dir = deps.config.uploadsDir;

  async function guardar(request: import("fastify").FastifyRequest, prefijo: string): Promise<string> {
    const archivo = await request.file({ limits: { fileSize: MAX_IMAGEN_BYTES, files: 1 } });
    if (!archivo) throw new HttpError(400, "Falta el archivo");
    const buf = await archivo.toBuffer();
    if (archivo.file.truncated) throw new HttpError(413, "La imagen supera 5 MB");
    const { ext } = validarImagen(buf);
    await mkdir(dir, { recursive: true });
    const nombre = `${prefijo}-${randomUUID()}.${ext}`;
    await writeFile(join(dir, nombre), buf);
    return nombre;
  }

  async function borrar(nombre: string | null | undefined): Promise<void> {
    if (!nombre) return;
    await unlink(join(dir, basename(nombre))).catch(() => undefined);
  }

  deps.hub.registrarTema("apariencia", () => true);

  return async function (app: FastifyInstance): Promise<void> {
    // Pública: la pantalla de inicio de sesión también muestra el logo y el fondo.
    app.get("/api/apariencia/publica", { config: { acceso: { publico: true } } }, async () => ({
      logo: url(await getSetting<string>(deps.db, CLAVE("logo"))),
      fondo: url(await getSetting<string>(deps.db, CLAVE("fondo"))),
    }));

    app.get("/api/apariencia", { config: { acceso: { autenticado: true } } }, async (request) => {
      const user = currentUser(request);
      const [fila] = await deps.db.select({ avatar: users.avatarPath }).from(users).where(eq(users.id, user.id));
      return {
        logo: url(await getSetting<string>(deps.db, CLAVE("logo"))),
        fondo: url(await getSetting<string>(deps.db, CLAVE("fondo"))),
        avatar: url(fila?.avatar),
      };
    });

    app.post(
      "/api/apariencia/global/:tipo",
      { config: { acceso: { modulo: "ajustes", nivel: "administrar" } } },
      async (request) => {
        const { tipo } = tipoGlobal.parse(request.params);
        const nombre = await guardar(request, tipo);
        await borrar(await getSetting<string>(deps.db, CLAVE(tipo)));
        await setSetting(deps.db, CLAVE(tipo), nombre, deps.now());
        await deps.audit.record({
          actorType: "usuario",
          actorUserId: currentUser(request).id,
          action: `apariencia_${tipo}`,
          module: "ajustes",
          outcome: "ok",
          ...clientInfo(request),
        });
        deps.hub.publicar("apariencia", { tipo });
        return { url: url(nombre) };
      },
    );

    app.delete(
      "/api/apariencia/global/:tipo",
      { config: { acceso: { modulo: "ajustes", nivel: "administrar" } } },
      async (request) => {
        const { tipo } = tipoGlobal.parse(request.params);
        await borrar(await getSetting<string>(deps.db, CLAVE(tipo)));
        await deleteSetting(deps.db, CLAVE(tipo));
        deps.hub.publicar("apariencia", { tipo });
        return { ok: true };
      },
    );

    app.post("/api/apariencia/avatar", { config: { acceso: { autenticado: true } } }, async (request) => {
      const user = currentUser(request);
      const nombre = await guardar(request, "avatar");
      const [fila] = await deps.db.select({ avatar: users.avatarPath }).from(users).where(eq(users.id, user.id));
      await borrar(fila?.avatar);
      await deps.db.update(users).set({ avatarPath: nombre, updatedAt: deps.now() }).where(eq(users.id, user.id));
      return { url: url(nombre) };
    });

    app.delete("/api/apariencia/avatar", { config: { acceso: { autenticado: true } } }, async (request) => {
      const user = currentUser(request);
      const [fila] = await deps.db.select({ avatar: users.avatarPath }).from(users).where(eq(users.id, user.id));
      await borrar(fila?.avatar);
      await deps.db.update(users).set({ avatarPath: null }).where(eq(users.id, user.id));
      return { ok: true };
    });
  };
}
