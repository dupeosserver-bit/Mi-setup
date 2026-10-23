import { afterEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

async function preparar() {
  ctx = await createTestContext();
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { enlaces: "escritura" } as never });
  const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } });
  return bearer(r.json<{ accessToken: string }>().accessToken);
}

describe("0.11.4b enlaces cortos", () => {
  it("cambia a dónde lleva un enlace sin cambiar su nombre corto", async () => {
    const h = await preparar();
    const app = ctx!.app;
    await app.inject({ method: "POST", url: "/api/enlaces", headers: h, payload: { destino: "https://ejemplo.net/viejo", codigo: "promo" } });
    const [enlace] = (await app.inject({ method: "GET", url: "/api/enlaces", headers: h })).json<{ id: string }[]>();
    const cambio = await app.inject({ method: "PATCH", url: `/api/enlaces/${enlace!.id}`, headers: h, payload: { destino: "https://ejemplo.net/nuevo" } });
    expect(cambio.statusCode).toBe(200);
    const [despues] = (await app.inject({ method: "GET", url: "/api/enlaces", headers: h })).json<{ codigo: string; destino: string; activo: boolean }[]>();
    expect(despues).toMatchObject({ codigo: "promo", destino: "https://ejemplo.net/nuevo", activo: true });
    const salto = await app.inject({ method: "GET", url: "/l/promo" });
    expect(salto.headers.location).toBe("https://ejemplo.net/nuevo");
  });

  it("rechaza destinos que no son http y cambios vacíos", async () => {
    const h = await preparar();
    const app = ctx!.app;
    await app.inject({ method: "POST", url: "/api/enlaces", headers: h, payload: { destino: "https://ejemplo.net/a" } });
    const [enlace] = (await app.inject({ method: "GET", url: "/api/enlaces", headers: h })).json<{ id: string }[]>();
    expect((await app.inject({ method: "PATCH", url: `/api/enlaces/${enlace!.id}`, headers: h, payload: { destino: "javascript:alert(1)" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: `/api/enlaces/${enlace!.id}`, headers: h, payload: {} })).statusCode).toBe(400);
  });
});
