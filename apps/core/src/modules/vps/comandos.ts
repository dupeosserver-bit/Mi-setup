/**
 * Comandos guardados (botones para scripts como vps-manager.sh). Siempre con
 * confirmación; los peligrosos (rm -rf, dd, mkfs, shutdown, reboot,
 * iptables -F…) exigen doble confirmación (escribir el nombre exacto) y
 * reautenticación fuerte.
 */
import { analizarComando, can, reauthSatisfies } from "@mi-setup/shared";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { savedCommands } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import { currentUser, type AuthUser } from "../../security/rbac.js";
import { idParams, type ModuleDeps } from "../common.js";
import type { Servidores } from "./servidores.js";
import { ejecutar, type Resultado } from "./ssh.js";

const comandoSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  comando: z.string().trim().min(1).max(4000),
  descripcion: z.string().max(500).default(""),
  servidorId: z.string().uuid().nullable().default(null),
});

/**
 * Ejecuta un comando en un servidor con todas las salvaguardas. Lo usan los
 * comandos guardados y la IA (después de que el usuario aprueba la propuesta).
 */
export async function ejecutarSeguro(
  deps: ModuleDeps,
  servidores: Servidores,
  user: AuthUser,
  opciones: { servidorId: string; comando: string; confirmacion?: string; textoEsperado: string; origen: "comando_guardado" | "ia" },
): Promise<Resultado & { peligroso: boolean }> {
  if (!can(user, "vps_comandos", "escritura")) throw new HttpError(403, "Sin permiso para ejecutar comandos", "sin_permiso");
  const analisis = analizarComando(opciones.comando);
  if (analisis.peligroso) {
    if (!reauthSatisfies(user, "fuerte", deps.now())) {
      throw new HttpError(403, "Comando peligroso: confirma con contraseña o huella", "reauth_requerida", { metodo: "fuerte" });
    }
    if (opciones.confirmacion !== opciones.textoEsperado) {
      throw new HttpError(400, `Comando peligroso: escribe "${opciones.textoEsperado}" para confirmar`, "doble_confirmacion", {
        motivos: analisis.motivos,
      });
    }
  }
  const servidor = await servidores.obtener(opciones.servidorId);
  try {
    const r = await servidores.usar(servidor.id, (c) => ejecutar(c, opciones.comando));
    await deps.audit.record({
      actorType: opciones.origen === "ia" ? "ia" : "usuario",
      actorUserId: user.id,
      action: "comando_ejecutado",
      module: "vps_comandos",
      target: servidor.name,
      outcome: r.codigo === 0 ? "ok" : "error",
      details: { comando: opciones.comando.slice(0, 500), codigo: r.codigo, peligroso: analisis.peligroso },
    });
    return { ...r, peligroso: analisis.peligroso };
  } catch (err) {
    await deps.audit.record({
      actorType: opciones.origen === "ia" ? "ia" : "usuario",
      actorUserId: user.id,
      action: "comando_ejecutado",
      module: "vps_comandos",
      target: servidor.name,
      outcome: "error",
      details: { comando: opciones.comando.slice(0, 500), error: err instanceof Error ? err.message : "error" },
    });
    throw err;
  }
}

export function comandosRoutes(deps: ModuleDeps, servidores: Servidores) {
  const { db } = deps;
  const aDto = (c: typeof savedCommands.$inferSelect) => ({
    id: c.id,
    nombre: c.name,
    comando: c.command,
    descripcion: c.description,
    servidorId: c.serverId,
    ...analizarComando(c.command),
  });

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/vps/comandos", { config: { acceso: { modulo: "vps_comandos", nivel: "lectura" } } }, async () =>
      (await db.select().from(savedCommands).orderBy(asc(savedCommands.name))).map(aDto),
    );

    app.post("/api/vps/comandos", { config: { acceso: { modulo: "vps_comandos", nivel: "administrar", reauth: "pin" } } }, async (request) => {
      const d = comandoSchema.parse(request.body);
      const [c] = await db
        .insert(savedCommands)
        .values({ name: d.nombre, command: d.comando, description: d.descripcion, serverId: d.servidorId })
        .returning();
      if (!c) throw new HttpError(500, "No se pudo guardar");
      return aDto(c);
    });

    app.patch("/api/vps/comandos/:id", { config: { acceso: { modulo: "vps_comandos", nivel: "administrar", reauth: "pin" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = comandoSchema.partial().parse(request.body);
      const [c] = await db
        .update(savedCommands)
        .set({
          ...(d.nombre !== undefined ? { name: d.nombre } : {}),
          ...(d.comando !== undefined ? { command: d.comando } : {}),
          ...(d.descripcion !== undefined ? { description: d.descripcion } : {}),
          ...(d.servidorId !== undefined ? { serverId: d.servidorId } : {}),
        })
        .where(eq(savedCommands.id, id))
        .returning();
      if (!c) throw new HttpError(404, "Comando no encontrado");
      return aDto(c);
    });

    app.delete("/api/vps/comandos/:id", { config: { acceso: { modulo: "vps_comandos", nivel: "administrar" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      await db.delete(savedCommands).where(eq(savedCommands.id, id));
      return { ok: true };
    });

    app.post("/api/vps/comandos/:id/ejecutar", { config: { acceso: { modulo: "vps_comandos", nivel: "escritura" } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = z.object({ servidorId: z.string().uuid(), confirmacion: z.string().max(100).optional() }).parse(request.body);
      const [c] = await db.select().from(savedCommands).where(eq(savedCommands.id, id)).limit(1);
      if (!c) throw new HttpError(404, "Comando no encontrado");
      const user = currentUser(request);
      return ejecutarSeguro(deps, servidores, user, {
        servidorId: d.servidorId,
        comando: c.command,
        ...(d.confirmacion !== undefined ? { confirmacion: d.confirmacion } : {}),
        textoEsperado: c.name,
        origen: "comando_guardado",
      });
    });
  };
}
