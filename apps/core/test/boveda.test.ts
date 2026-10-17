import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { vaultItems } from "../src/db/schema.js";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

// Datos con el formato del cliente (el servidor no puede ni intenta descifrarlos).
const dato = (n: number) => `v1.${"A".repeat(32)}.${String(n).padStart(4, "0")}${"B".repeat(40)}`;
const CONFIG = { sal: "c2FsLWRlLXBydWViYS0xMjM0", kdf: { alg: "argon2id13", opslimit: 3, memlimit: 67108864 }, verificador: dato(0) };

async function maestra(c: Ctx) {
  const secret = generateTotpSecret();
  await seedUser(c.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secret });
  const res = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secret, c.clock.now) } });
  return bearer(res.json<{ accessToken: string }>().accessToken);
}

describe("bóveda (el servidor solo guarda datos cifrados)", () => {
  it("guarda y entrega texto cifrado; abrirla exige reautenticación fuerte", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    expect((await ctx.app.inject({ method: "GET", url: "/api/boveda/config", headers: h })).json()).toEqual({ configurada: false });
    expect((await ctx.app.inject({ method: "PUT", url: "/api/boveda/config", headers: h, payload: CONFIG })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: "PUT", url: "/api/boveda/config", headers: h, payload: CONFIG })).statusCode).toBe(409);

    expect((await ctx.app.inject({ method: "POST", url: "/api/boveda/items", headers: h, payload: { tipo: "login", datos: "contraseña en claro" } })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: "POST", url: "/api/boveda/items", headers: h, payload: { tipo: "login", datos: dato(1) } })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: "POST", url: "/api/2fa/items", headers: h, payload: { tipo: "totp", datos: dato(2) } })).statusCode).toBe(200);
    // Un TOTP no puede guardarse en la colección de contraseñas.
    expect((await ctx.app.inject({ method: "POST", url: "/api/boveda/items", headers: h, payload: { tipo: "totp", datos: dato(3) } })).statusCode).toBe(400);

    const items = (await ctx.app.inject({ method: "GET", url: "/api/boveda/items", headers: h })).json<{ datos: string }[]>();
    expect(items.map((i) => i.datos)).toEqual([dato(1)]);

    ctx.advance(6 * 60_000);
    const vencida = await ctx.app.inject({ method: "GET", url: "/api/boveda/items", headers: h });
    expect(vencida.json()).toMatchObject({ codigo: "reauth_requerida", metodo: "fuerte" });
  });

  it("cambiar la clave maestra re-cifra todo de una vez o nada", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    await ctx.app.inject({ method: "PUT", url: "/api/boveda/config", headers: h, payload: CONFIG });
    const a = (await ctx.app.inject({ method: "POST", url: "/api/boveda/items", headers: h, payload: { tipo: "login", datos: dato(1) } })).json<{ id: string }>();
    const b = (await ctx.app.inject({ method: "POST", url: "/api/2fa/items", headers: h, payload: { tipo: "totp", datos: dato(2) } })).json<{ id: string }>();

    const incompleto = await ctx.app.inject({ method: "POST", url: "/api/boveda/cambiar-clave", headers: h, payload: { ...CONFIG, items: [{ id: a.id, datos: dato(9) }] } });
    expect(incompleto.statusCode).toBe(409);

    const ok = await ctx.app.inject({
      method: "POST",
      url: "/api/boveda/cambiar-clave",
      headers: h,
      payload: { ...CONFIG, sal: "bnVldmEtc2FsLWRlLXBydWViYQ", items: [{ id: a.id, datos: dato(7) }, { id: b.id, datos: dato(8) }] },
    });
    expect(ok.statusCode).toBe(200);
    expect((await ctx.db.select().from(vaultItems)).map((i) => i.data).sort()).toEqual([dato(7), dato(8)].sort());
    expect((await ctx.app.inject({ method: "GET", url: "/api/boveda/config", headers: h })).json()).toMatchObject({ sal: "bnVldmEtc2FsLWRlLXBydWViYQ" });
  });

  it("es solo de la cuenta maestra", async () => {
    ctx = await createTestContext();
    await seedUser(ctx.db, { email: "u@x.test", password: "clave-usuario-123", permissions: { boveda: "administrar" } });
    const res = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-usuario-123" } });
    const h = bearer(res.json<{ accessToken: string }>().accessToken);
    expect((await ctx.app.inject({ method: "GET", url: "/api/boveda/config", headers: h })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: "GET", url: "/api/boveda/items", headers: h })).statusCode).toBe(403);
  });
});
