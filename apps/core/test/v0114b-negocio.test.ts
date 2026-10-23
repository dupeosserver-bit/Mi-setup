import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

interface Resumen {
  porMes: { mes: string; cobrado: number }[];
  cobradoMes: number;
  porCobrar: { total: number; cobros: number };
  vencido: { total: number; clientes: number };
  clientesActivos: number;
  pausados: number;
}

describe("0.11.4b · resumen de cobros", () => {
  it("suma lo cobrado por mes, lo que vence pronto, lo vencido y los clientes activos", async () => {
    ctx = await createTestContext();
    const secreto = generateTotpSecret();
    await seedUser(ctx.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secreto });
    const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secreto, ctx.clock.now) } });
    const h = bearer(r.json<{ accessToken: string }>().accessToken);
    const cliente = async (nombre: string) => (await ctx!.app.inject({ method: "POST", url: "/api/clientes", headers: h, payload: { nombre } })).json<{ id: string }>().id;
    const cobro = async (clienteId: string, monto: number, proximo: string, estado = "activo") =>
      (await ctx!.app.inject({ method: "POST", url: "/api/cobros", headers: h, payload: { clienteId, concepto: "Servidor", monto, frecuencia: "mensual", proximo, estado } })).json<{ id: string }>().id;

    const a = await cliente("Clan Azteca");
    const b = await cliente("Comunidad Aurora");
    const c = await cliente("Tienda Norte");
    const pagado = await cobro(a, 350, "2026-03-02T00:00:00Z");
    await cobro(b, 200, "2026-02-20T00:00:00Z");
    await cobro(a, 100, "2026-03-05T00:00:00Z");
    await cobro(c, 999, "2026-03-04T00:00:00Z", "pausado");
    expect((await ctx.app.inject({ method: "POST", url: `/api/cobros/${pagado}/pagado`, headers: h })).statusCode).toBe(200);

    const d = (await ctx.app.inject({ method: "GET", url: "/api/cobros/resumen?meses=3", headers: h })).json<Resumen>();
    expect(d.porMes).toHaveLength(3);
    expect(d.porMes.at(-1)).toEqual({ mes: "2026-03", cobrado: 350 });
    expect(d.cobradoMes).toBe(350);
    expect(d.vencido).toEqual({ total: 200, clientes: 1 });
    expect(d.porCobrar).toEqual({ total: 100, cobros: 1 });
    expect(d.clientesActivos).toBe(2);
    expect(d.pausados).toBe(1);
  });

  it("necesita permiso de clientes", async () => {
    ctx = await createTestContext();
    await seedUser(ctx.db, { email: "u@x.test", password: "clave-usuario-123", permissions: { notas: "escritura" } });
    const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-usuario-123" } });
    const h = bearer(r.json<{ accessToken: string }>().accessToken);
    expect((await ctx.app.inject({ method: "GET", url: "/api/cobros/resumen", headers: h })).statusCode).toBe(403);
  });
});
