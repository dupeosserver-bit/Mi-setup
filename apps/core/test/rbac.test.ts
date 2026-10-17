import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { auditRows, bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;

async function token(ctx: Ctx, email: string, password: string, totp?: string): Promise<string> {
  const res = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password, totp } });
  expect(res.statusCode).toBe(200);
  return res.json<{ accessToken: string }>().accessToken;
}

function rutasDePrueba(ctx: Ctx) {
  const ok = async () => ({ ok: true });
  ctx.app.get("/api/prueba/notas", { config: { acceso: { modulo: "notas", nivel: "lectura" } } }, ok);
  ctx.app.post("/api/prueba/notas", { config: { acceso: { modulo: "notas", nivel: "escritura" } } }, ok);
  ctx.app.get("/api/prueba/boveda", { config: { acceso: { modulo: "boveda", nivel: "lectura" } } }, ok);
}

describe("RBAC activo en todas las rutas", () => {
  let ctx: Ctx | undefined;
  afterEach(async () => ctx?.close());

  it("una ruta /api sin config.acceso impide arrancar", async () => {
    ctx = await createTestContext();
    expect(() => ctx!.app.get("/api/sin-acceso", async () => ({}))).toThrow(/config\.acceso/);
  });

  it("sin sesión responde 401", async () => {
    ctx = await createTestContext();
    rutasDePrueba(ctx);
    expect((await ctx.app.inject({ method: "GET", url: "/api/prueba/notas" })).statusCode).toBe(401);
    const falso = await ctx.app.inject({ method: "GET", url: "/api/prueba/notas", headers: bearer("no.es.valido") });
    expect(falso.statusCode).toBe(401);
  });

  it("permite el nivel asignado, niega el superior con 403 y lo audita", async () => {
    ctx = await createTestContext();
    rutasDePrueba(ctx);
    const id = await seedUser(ctx.db, {
      email: "lector@x.test",
      password: "clave-de-lector-123",
      permissions: { notas: "lectura", boveda: "administrar" },
    });
    const headers = bearer(await token(ctx, "lector@x.test", "clave-de-lector-123"));

    expect((await ctx.app.inject({ method: "GET", url: "/api/prueba/notas", headers })).statusCode).toBe(200);
    const escribir = await ctx.app.inject({ method: "POST", url: "/api/prueba/notas", headers });
    expect(escribir.statusCode).toBe(403);
    expect(escribir.json()).toMatchObject({ codigo: "sin_permiso" });
    // La bóveda es solo-maestra aunque haya una asignación guardada.
    expect((await ctx.app.inject({ method: "GET", url: "/api/prueba/boveda", headers })).statusCode).toBe(403);

    const denegados = (await auditRows(ctx.db)).filter((r) => r.action === "acceso_denegado");
    expect(denegados).toHaveLength(2);
    expect(denegados[0]).toMatchObject({ actorUserId: id, module: "notas", outcome: "denegado" });
  });

  it("la cuenta maestra accede a la bóveda", async () => {
    ctx = await createTestContext();
    rutasDePrueba(ctx);
    const secret = generateTotpSecret();
    await seedUser(ctx.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secret });
    const headers = bearer(await token(ctx, "m@x.test", "clave-maestra-123", totpAt(secret, ctx.clock.now)));
    expect((await ctx.app.inject({ method: "GET", url: "/api/prueba/boveda", headers })).statusCode).toBe(200);
  });
});
