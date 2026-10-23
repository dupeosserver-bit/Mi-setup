import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { auditLog } from "../src/db/schema.js";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

interface Resumen {
  semana: number;
  iaAprobadas: number;
  denegadas: number;
  errores: number;
  porHora: number[];
  top: { accion: string; veces: number }[];
}

describe("0.11.4b · resumen del registro de actividad", () => {
  it("cuenta la semana, lo de la IA, lo denegado, los errores y agrupa por hora local", async () => {
    ctx = await createTestContext();
    const secreto = generateTotpSecret();
    await seedUser(ctx.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secreto });
    const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secreto, ctx.clock.now) } });
    const h = bearer(r.json<{ accessToken: string }>().accessToken);

    const ahora = ctx.clock.now;
    const base = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 15, 30));
    const hace10dias = new Date(ahora.getTime() - 10 * 24 * 60 * 60 * 1000);
    await ctx.db.insert(auditLog).values([
      { actorType: "ia", action: "propuesta_aprobada", outcome: "ok", details: {}, createdAt: base },
      { actorType: "ia", action: "propuesta_aprobada", outcome: "ok", details: {}, createdAt: base },
      { actorType: "usuario", action: "nota_guardada", outcome: "denegado", details: {}, createdAt: base },
      { actorType: "sistema", action: "respaldo_creado", outcome: "error", details: {}, createdAt: base },
      { actorType: "usuario", action: "vieja", outcome: "error", details: {}, createdAt: hace10dias },
    ]);

    const desde = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate())).toISOString();
    const res = await ctx.app.inject({ method: "GET", url: `/api/auditoria/resumen?desde=${encodeURIComponent(desde)}&zona=360`, headers: h });
    expect(res.statusCode).toBe(200);
    const d = res.json<Resumen>();
    expect(d.iaAprobadas).toBe(2);
    expect(d.denegadas).toBe(1);
    expect(d.errores).toBe(1);
    expect(d.semana).toBeGreaterThanOrEqual(4);
    expect(d.top.find((t) => t.accion === "propuesta_aprobada")?.veces).toBe(2);
    expect(d.top.some((t) => t.accion === "vieja")).toBe(false);
    expect(d.porHora).toHaveLength(24);
    expect(d.porHora[9]).toBeGreaterThanOrEqual(4);

    const buscadas = await ctx.app.inject({ method: "GET", url: "/api/auditoria?q=respaldo", headers: h });
    expect(buscadas.json<{ accion: string }[]>().map((f) => f.accion)).toEqual(["respaldo_creado"]);
    const raras = await ctx.app.inject({ method: "GET", url: "/api/auditoria?q=%25", headers: h });
    expect(raras.json<unknown[]>()).toHaveLength(0);
  });

  it("pide permiso de lectura del registro", async () => {
    ctx = await createTestContext();
    await seedUser(ctx.db, { email: "u@x.test", password: "clave-usuario-123", permissions: { notas: "escritura" } });
    const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-usuario-123" } });
    const h = bearer(r.json<{ accessToken: string }>().accessToken);
    const res = await ctx.app.inject({ method: "GET", url: `/api/auditoria/resumen?desde=${encodeURIComponent(new Date().toISOString())}`, headers: h });
    expect(res.statusCode).toBe(403);
  });
});
