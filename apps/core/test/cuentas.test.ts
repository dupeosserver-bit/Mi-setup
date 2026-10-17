import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { remoteHosts } from "../src/db/schema.js";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

async function maestra(c: Ctx) {
  const secret = generateTotpSecret();
  await seedUser(c.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secret });
  const res = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secret, c.clock.now) } });
  return bearer(res.json<{ accessToken: string }>().accessToken);
}

const login = async (c: Ctx, email: string, password: string) =>
  c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password } });

describe("cuentas y permisos", () => {
  it("la maestra crea cuentas; los módulos solo-maestra no se pueden otorgar", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const creada = await ctx.app.inject({
      method: "POST",
      url: "/api/cuentas",
      headers: h,
      payload: { email: "Ayudante@X.test", nombre: "Ayudante", password: "Contraseña-segura-123", permisos: { notas: "escritura", boveda: "administrar", cuentas: "administrar" } },
    });
    expect(creada.statusCode).toBe(200);
    expect(creada.json<{ permisos: Record<string, string> }>().permisos).toEqual({ notas: "escritura" });

    const r = await login(ctx, "ayudante@x.test", "Contraseña-segura-123");
    expect(r.statusCode).toBe(200);
    const hu = bearer(r.json<{ accessToken: string }>().accessToken);
    expect((await ctx.app.inject({ method: "GET", url: "/api/notas", headers: hu })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: "GET", url: "/api/boveda/config", headers: hu })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: "GET", url: "/api/cuentas", headers: hu })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: "GET", url: "/api/auditoria", headers: hu })).statusCode).toBe(403);

    const repetida = await ctx.app.inject({ method: "POST", url: "/api/cuentas", headers: h, payload: { email: "ayudante@x.test", nombre: "Otro", password: "Contraseña-segura-123" } });
    expect(repetida.statusCode).toBe(409);
  });

  it("desactivar corta la sesión al momento y no se puede tocar a la maestra", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const { id } = (
      await ctx.app.inject({ method: "POST", url: "/api/cuentas", headers: h, payload: { email: "u@x.test", nombre: "U", password: "Contraseña-segura-123", permisos: { notas: "lectura" } } })
    ).json<{ id: string }>();
    const hu = bearer((await login(ctx, "u@x.test", "Contraseña-segura-123")).json<{ accessToken: string }>().accessToken);
    expect((await ctx.app.inject({ method: "GET", url: "/api/notas", headers: hu })).statusCode).toBe(200);

    expect((await ctx.app.inject({ method: "PATCH", url: `/api/cuentas/${id}`, headers: h, payload: { activo: false } })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: "GET", url: "/api/notas", headers: hu })).statusCode).toBe(401);
    expect((await login(ctx, "u@x.test", "Contraseña-segura-123")).statusCode).not.toBe(200);

    const lista = (await ctx.app.inject({ method: "GET", url: "/api/cuentas", headers: h })).json<{ id: string; rol: string }[]>();
    const idMaestra = lista.find((c) => c.rol === "maestra")!.id;
    expect((await ctx.app.inject({ method: "PATCH", url: `/api/cuentas/${idMaestra}`, headers: h, payload: { activo: false } })).statusCode).toBe(403);

    // Los cambios exigen reautenticación fuerte reciente.
    ctx.advance(6 * 60_000);
    const vencida = await ctx.app.inject({ method: "PATCH", url: `/api/cuentas/${id}`, headers: h, payload: { activo: true } });
    expect(vencida.json()).toMatchObject({ codigo: "reauth_requerida" });
  });

  it("el registro de actividad filtra y exporta CSV sin fórmulas", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    await ctx.app.inject({ method: "POST", url: "/api/cuentas", headers: h, payload: { email: "u@x.test", nombre: "=HYPERLINK(1)", password: "Contraseña-segura-123" } });
    const filas = (await ctx.app.inject({ method: "GET", url: "/api/auditoria?accion=cuenta_creada", headers: h })).json<{ accion: string; usuario: string }[]>();
    expect(filas).toHaveLength(1);
    expect(filas[0]!.usuario).toBeTruthy();

    await ctx.deps.audit.record({ actorType: "sistema", action: "prueba", target: "=1+1", outcome: "ok" });
    const csv = await ctx.app.inject({ method: "GET", url: "/api/auditoria/exportar", headers: h });
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.body.startsWith("﻿id,fecha")).toBe(true);
    expect(csv.body).toContain("\"'=1+1\"");
    expect(csv.body).not.toMatch(/,"=/);
  });
});

describe("control remoto (RustDesk)", () => {
  it("guarda la contraseña cifrada y solo la entrega con reautenticación fuerte", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const r = await ctx.app.inject({ method: "POST", url: "/api/control-remoto", headers: h, payload: { nombre: "PC", rustdeskId: "123456789", contrasena: "clave-rustdesk" } });
    expect(r.statusCode).toBe(200);
    const [fila] = await ctx.db.select().from(remoteHosts);
    expect(fila?.passwordEnc).not.toContain("clave-rustdesk");

    const lista = (await ctx.app.inject({ method: "GET", url: "/api/control-remoto", headers: h })).json<{ servidor: string; equipos: { id: string }[] }>();
    expect(lista.servidor).toBe("rd.mexicanland.net");
    expect(JSON.stringify(lista)).not.toContain("clave-rustdesk");

    const id = lista.equipos[0]!.id;
    expect((await ctx.app.inject({ method: "POST", url: `/api/control-remoto/${id}/conectar`, headers: h })).json()).toMatchObject({ contrasena: "clave-rustdesk" });
    ctx.advance(6 * 60_000);
    expect((await ctx.app.inject({ method: "POST", url: `/api/control-remoto/${id}/conectar`, headers: h })).json()).toMatchObject({ codigo: "reauth_requerida" });
  });
});
