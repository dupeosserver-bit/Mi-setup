import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { requirePermission, type AuthUser } from "../src/security/rbac.js";
import { memoryAudit, testConfig } from "./helpers.js";

const usuarios: Record<string, AuthUser> = {
  maestra: { id: "u-maestra", email: "m@x.test", role: "maestra", isActive: true, permissions: {} },
  lector: { id: "u-lector", email: "l@x.test", role: "usuario", isActive: true, permissions: { notas: "lectura" } },
};

async function appDePrueba() {
  const audit = memoryAudit();
  const app = await buildApp({ config: testConfig, audit, logger: false });
  // Solo en pruebas: simula la autenticación de la fase 2 con una cabecera.
  app.addHook("onRequest", async (request) => {
    const quien = request.headers["x-prueba-usuario"];
    request.authUser = typeof quien === "string" ? (usuarios[quien] ?? null) : null;
  });
  app.get("/api/notas", { preHandler: requirePermission("notas", "lectura") }, async () => ({ ok: true }));
  app.post("/api/notas", { preHandler: requirePermission("notas", "escritura") }, async () => ({ ok: true }));
  app.get("/api/boveda", { preHandler: requirePermission("boveda", "lectura") }, async () => ({ ok: true }));
  return { app, audit };
}

describe("RBAC en rutas", () => {
  it("sin sesión responde 401", async () => {
    const { app } = await appDePrueba();
    const res = await app.inject({ method: "GET", url: "/api/notas" });
    expect(res.statusCode).toBe(401);
  });

  it("permite el nivel asignado y niega el superior con 403 y auditoría", async () => {
    const { app, audit } = await appDePrueba();
    const headers = { "x-prueba-usuario": "lector" };
    expect((await app.inject({ method: "GET", url: "/api/notas", headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/notas", headers })).statusCode).toBe(403);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      actorUserId: "u-lector",
      action: "acceso_denegado",
      module: "notas",
      outcome: "denegado",
    });
  });

  it("la bóveda solo es accesible para la cuenta maestra", async () => {
    const { app } = await appDePrueba();
    const lector = await app.inject({ method: "GET", url: "/api/boveda", headers: { "x-prueba-usuario": "lector" } });
    const maestra = await app.inject({ method: "GET", url: "/api/boveda", headers: { "x-prueba-usuario": "maestra" } });
    expect(lector.statusCode).toBe(403);
    expect(maestra.statusCode).toBe(200);
  });
});
