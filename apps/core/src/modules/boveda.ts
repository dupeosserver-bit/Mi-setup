/**
 * Bóveda (nivel A): contraseñas y 2FA cifrados de extremo a extremo. La clave
 * maestra se deriva en el cliente (Argon2id) y los datos se cifran allí con
 * XChaCha20-Poly1305: este módulo solo guarda y entrega texto cifrado, la sal
 * y los parámetros. Abrir (leer) la bóveda exige reautenticación fuerte.
 */
import { can, type ModuleId } from "@mi-setup/shared";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { vault, vaultItems } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "./common.js";

/** Formato de un dato cifrado por el cliente: v1.<nonce>.<cifrado> (base64url). */
export const CIFRADO = /^v1\.[A-Za-z0-9_-]{24,64}\.[A-Za-z0-9_-]{16,}$/;
const MAX_DATO = 256 * 1024;

const datoSchema = z.string().max(MAX_DATO).regex(CIFRADO, "Dato cifrado inválido");
const configSchema = z.object({
  sal: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/, "Sal inválida"),
  kdf: z.object({
    alg: z.literal("argon2id13"),
    opslimit: z.number().int().min(2).max(10),
    memlimit: z.number().int().min(8 * 1024 * 1024).max(1024 * 1024 * 1024),
  }),
  verificador: datoSchema,
});

const COLECCIONES: { prefijo: string; modulo: ModuleId; tipos: readonly string[] }[] = [
  // "generada": historial de las últimas contraseñas generadas (máx. 10, lo limpia el cliente).
  { prefijo: "/api/boveda", modulo: "boveda", tipos: ["login", "nota", "generada"] },
  { prefijo: "/api/2fa", modulo: "autenticador", tipos: ["totp"] },
];

const aDto = (i: typeof vaultItems.$inferSelect) => ({ id: i.id, tipo: i.kind, datos: i.data, actualizado: i.updatedAt.toISOString() });

export function bovedaRoutes(deps: ModuleDeps) {
  const { db } = deps;

  const auditar = (request: import("fastify").FastifyRequest, modulo: ModuleId, accion: string, detalles?: Record<string, unknown>) =>
    deps.audit.record({
      actorType: "usuario",
      actorUserId: currentUser(request).id,
      action: accion,
      module: modulo,
      outcome: "ok",
      ...(detalles ? { details: detalles } : {}),
      ...clientInfo(request),
    });

  return async function (app: FastifyInstance): Promise<void> {
    // Parámetros de la bóveda (sin datos): los usan el gestor y el autenticador.
    app.get("/api/boveda/config", { config: { acceso: { autenticado: true } } }, async (request) => {
      const user = currentUser(request);
      if (!can(user, "boveda", "lectura") && !can(user, "autenticador", "lectura")) throw new HttpError(403, "Sin permiso", "sin_permiso");
      const [v] = await db.select().from(vault).where(eq(vault.userId, user.id));
      return v ? { configurada: true, sal: v.salt, kdf: v.kdf, verificador: v.verifier } : { configurada: false };
    });

    app.put(
      "/api/boveda/config",
      { config: { acceso: { modulo: "boveda", nivel: "administrar", reauth: "fuerte" } } },
      async (request) => {
        const user = currentUser(request);
        const d = configSchema.parse(request.body);
        const [existente] = await db.select({ u: vault.userId }).from(vault).where(eq(vault.userId, user.id));
        if (existente) throw new HttpError(409, "La bóveda ya existe. Para cambiar la clave maestra usa 'Cambiar clave maestra'.");
        await db.insert(vault).values({ userId: user.id, salt: d.sal, kdf: d.kdf, verifier: d.verificador });
        await auditar(request, "boveda", "boveda_creada");
        return { ok: true };
      },
    );

    // Cambiar la clave maestra: el cliente re-cifra TODO y se reemplaza de una vez.
    app.post(
      "/api/boveda/cambiar-clave",
      { config: { acceso: { modulo: "boveda", nivel: "administrar", reauth: "fuerte" } } },
      async (request) => {
        const user = currentUser(request);
        const d = configSchema.extend({ items: z.array(z.object({ id: z.string().uuid(), datos: datoSchema })).max(20_000) }).parse(request.body);
        await db.transaction(async (tx) => {
          const actuales = await tx.select({ id: vaultItems.id }).from(vaultItems).where(eq(vaultItems.userId, user.id));
          const nuevos = new Set(d.items.map((i) => i.id));
          if (actuales.length !== nuevos.size || actuales.some((a) => !nuevos.has(a.id))) {
            throw new HttpError(409, "La bóveda cambió mientras se re-cifraba. Vuelve a intentarlo.");
          }
          const ahora = deps.now();
          for (const i of d.items) {
            await tx.update(vaultItems).set({ data: i.datos, updatedAt: ahora }).where(and(eq(vaultItems.id, i.id), eq(vaultItems.userId, user.id)));
          }
          await tx.update(vault).set({ salt: d.sal, kdf: d.kdf, verifier: d.verificador, updatedAt: ahora }).where(eq(vault.userId, user.id));
        });
        await auditar(request, "boveda", "clave_maestra_cambiada", { elementos: d.items.length });
        return { ok: true };
      },
    );

    for (const col of COLECCIONES) {
      const leer = { config: { acceso: { modulo: col.modulo, nivel: "lectura" as const, reauth: "fuerte" as const } } };
      const escribir = { config: { acceso: { modulo: col.modulo, nivel: "escritura" as const } } };
      const tipoSchema = z.enum(col.tipos as [string, ...string[]]);

      app.get(`${col.prefijo}/items`, leer, async (request) => {
        const user = currentUser(request);
        const filas = await db
          .select()
          .from(vaultItems)
          .where(and(eq(vaultItems.userId, user.id), inArray(vaultItems.kind, [...col.tipos])))
          .orderBy(asc(vaultItems.createdAt));
        await auditar(request, col.modulo, "boveda_abierta", { elementos: filas.length });
        return filas.map(aDto);
      });

      app.post(`${col.prefijo}/items`, escribir, async (request) => {
        const user = currentUser(request);
        const d = z.object({ tipo: tipoSchema, datos: datoSchema }).parse(request.body);
        const [i] = await db.insert(vaultItems).values({ userId: user.id, kind: d.tipo, data: d.datos }).returning();
        if (!i) throw new HttpError(500, "No se pudo guardar");
        await auditar(request, col.modulo, "boveda_elemento_creado", { tipo: d.tipo });
        return aDto(i);
      });

      app.put(`${col.prefijo}/items/:id`, escribir, async (request) => {
        const user = currentUser(request);
        const { id } = idParams.parse(request.params);
        const { datos } = z.object({ datos: datoSchema }).parse(request.body);
        const [i] = await db
          .update(vaultItems)
          .set({ data: datos, updatedAt: deps.now() })
          .where(and(eq(vaultItems.id, id), eq(vaultItems.userId, user.id), inArray(vaultItems.kind, [...col.tipos])))
          .returning();
        if (!i) throw new HttpError(404, "No encontrado");
        return aDto(i);
      });

      app.delete(`${col.prefijo}/items/:id`, escribir, async (request) => {
        const user = currentUser(request);
        const { id } = idParams.parse(request.params);
        await db.delete(vaultItems).where(and(eq(vaultItems.id, id), eq(vaultItems.userId, user.id), inArray(vaultItems.kind, [...col.tipos])));
        await auditar(request, col.modulo, "boveda_elemento_borrado");
        return { ok: true };
      });

      // Importar: el cliente ya re-cifró cada elemento con la clave actual.
      app.post(
        `${col.prefijo}/importar`,
        { config: { acceso: { modulo: col.modulo, nivel: "escritura" as const, reauth: "fuerte" as const } } },
        async (request) => {
          const user = currentUser(request);
          const { items } = z.object({ items: z.array(z.object({ tipo: tipoSchema, datos: datoSchema })).min(1).max(5_000) }).parse(request.body);
          await db.insert(vaultItems).values(items.map((i) => ({ userId: user.id, kind: i.tipo, data: i.datos })));
          await auditar(request, col.modulo, "boveda_importada", { elementos: items.length });
          return { importados: items.length };
        },
      );
    }
  };
}
