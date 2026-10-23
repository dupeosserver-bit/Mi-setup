import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { appSettings } from "../src/db/schema.js";
import type { ClienteIa, PeticionIa } from "../src/modules/ia/servicio.js";
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

async function usuario(c: Ctx, email = "u@x.test") {
  const res = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-usuario-123" } });
  return bearer(res.json<{ accessToken: string }>().accessToken);
}

describe("roles tipo Discord", () => {
  it("crea Fundador, Dev e Invitado; un rol otorga sus permisos pero nunca módulos solo-maestra", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const roles = (await ctx.app.inject({ method: "GET", url: "/api/roles", headers: h })).json<{ id: string; nombre: string }[]>();
    expect(roles.map((r) => r.nombre)).toEqual(["Fundador", "Dev", "Invitado"]);

    const uid = await seedUser(ctx.db, { email: "u@x.test", password: "clave-usuario-123" });
    let hu = await usuario(ctx);
    expect((await ctx.app.inject({ method: "GET", url: "/api/notas", headers: hu })).statusCode).toBe(403);

    const dev = roles.find((r) => r.nombre === "Dev")!;
    await ctx.app.inject({ method: "PATCH", url: `/api/roles/${dev.id}`, headers: h, payload: { permisos: { notas: "escritura", boveda: "administrar" } } });
    expect((await ctx.app.inject({ method: "PUT", url: `/api/cuentas/${uid}/roles`, headers: h, payload: { roles: [dev.id] } })).statusCode).toBe(200);

    hu = await usuario(ctx);
    expect((await ctx.app.inject({ method: "GET", url: "/api/notas", headers: hu })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: "GET", url: "/api/boveda/config", headers: hu })).statusCode).toBe(403);
    const me = (await ctx.app.inject({ method: "GET", url: "/api/auth/me", headers: hu })).json<{ roles: { nombre: string }[] }>();
    expect(me.roles.map((r) => r.nombre)).toEqual(["Dev"]);

    await ctx.app.inject({ method: "PUT", url: `/api/cuentas/${uid}/roles`, headers: h, payload: { roles: [] } });
    expect((await ctx.app.inject({ method: "GET", url: "/api/notas", headers: hu })).statusCode).toBe(403);
  });
});

describe("claves desde Ajustes → Servicios", () => {
  it("solo la maestra las configura; se guardan cifradas y nunca se devuelven", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    await seedUser(ctx.db, { email: "u@x.test", password: "clave-usuario-123", permissions: { ajustes: "administrar" } });
    const hu = await usuario(ctx);
    expect((await ctx.app.inject({ method: "GET", url: "/api/claves", headers: hu })).statusCode).toBe(403);

    expect((await ctx.app.inject({ method: "GET", url: "/api/discord/canales", headers: h })).json()).toMatchObject({ configurado: false });
    const puesta = await ctx.app.inject({ method: "PUT", url: "/api/claves/DISCORD_BOT_TOKEN", headers: h, payload: { valor: "token-secreto-del-bot-123" } });
    expect(puesta.statusCode).toBe(200);

    const lista = await ctx.app.inject({ method: "GET", url: "/api/claves", headers: h });
    expect(lista.body).not.toContain("token-secreto-del-bot-123");
    expect(lista.json<{ nombre: string; origen: string; valor: string }[]>().find((c) => c.nombre === "DISCORD_BOT_TOKEN")).toMatchObject({ origen: "ajustes", valor: "••••-123" });
    const filas = await ctx.db.select().from(appSettings);
    expect(JSON.stringify(filas)).not.toContain("token-secreto-del-bot-123");
    // Se aplica al momento, sin reiniciar.
    expect(ctx.deps.config.env.DISCORD_BOT_TOKEN).toBe("token-secreto-del-bot-123");

    expect((await ctx.app.inject({ method: "PUT", url: "/api/claves/AI_MONTHLY_BUDGET_USD", headers: h, payload: { valor: "no-es-numero" } })).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: "PUT", url: "/api/claves/JWT_SECRET", headers: h, payload: { valor: "x".repeat(40) } })).statusCode).toBe(404);

    await ctx.app.inject({ method: "DELETE", url: "/api/claves/DISCORD_BOT_TOKEN", headers: h });
    expect(ctx.deps.config.env.DISCORD_BOT_TOKEN).toBeUndefined();
  });
});

describe("cuenta y preferencias", () => {
  it("guarda preferencias, cambia el nombre y valida la contraseña actual", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    expect((await ctx.app.inject({ method: "GET", url: "/api/preferencias", headers: h })).json()).toMatchObject({ tema: "oscuro", zoom: 100 });
    const prefs = { tema: "oceano", fuente: "poppins", zoom: 120, terminal: { tema: "dracula", fuente: "fira", tamano: 15 }, voz: {}, ia: { modelo: "claude-opus-5-5" } };
    expect((await ctx.app.inject({ method: "PUT", url: "/api/preferencias", headers: h, payload: prefs })).statusCode).toBe(200);
    expect((await ctx.app.inject({ method: "GET", url: "/api/preferencias", headers: h })).json()).toMatchObject({ tema: "oceano", terminal: { tema: "dracula" }, ia: { modelo: "claude-opus-5-5" } });
    expect((await ctx.app.inject({ method: "PUT", url: "/api/preferencias", headers: h, payload: { ...prefs, tema: "inventado" } })).statusCode).toBe(400);

    await ctx.app.inject({ method: "PATCH", url: "/api/cuenta/perfil", headers: h, payload: { nombre: "Mr. Lucifer" } });
    expect((await ctx.app.inject({ method: "GET", url: "/api/auth/me", headers: h })).json()).toMatchObject({ usuario: { displayName: "Mr. Lucifer" } });

    const mala = await ctx.app.inject({ method: "POST", url: "/api/cuenta/contrasena", headers: h, payload: { actual: "otra-cosa-123", nueva: "Nueva-Clave-Segura-1" } });
    expect(mala.statusCode).toBe(400);
    const buena = await ctx.app.inject({ method: "POST", url: "/api/cuenta/contrasena", headers: h, payload: { actual: "clave-maestra-123", nueva: "Nueva-Clave-Segura-1" } });
    expect(buena.statusCode).toBe(200);
  });
});

describe("IA: adjuntos y modelo por cuenta", () => {
  it("envía la foto al modelo elegido y rechaza tipos no permitidos", async () => {
    const peticiones: PeticionIa[] = [];
    const ia: ClienteIa = {
      async mensajes(p) {
        peticiones.push(p);
        return { model: p.modelo, stop_reason: "end_turn", content: [{ type: "text", text: "Veo un logo." }], usage: { input_tokens: 10, output_tokens: 5 } };
      },
    };
    ctx = await createTestContext({ clienteIa: ia });
    const h = await maestra(ctx);
    await ctx.app.inject({ method: "PUT", url: "/api/preferencias", headers: h, payload: { ia: { modelo: "claude-haiku-5-5" } } });
    const png = Buffer.from("89504e470d0a1a0a", "hex").toString("base64");
    const r = await ctx.app.inject({
      method: "POST",
      url: "/api/ia/chat",
      headers: h,
      payload: { mensaje: "¿qué es esto?", adjuntos: [{ nombre: "logo.png", tipo: "image/png", datos: png }, { nombre: "notas.txt", tipo: "text/plain", datos: Buffer.from("hola").toString("base64") }] },
    });
    expect(r.statusCode).toBe(200);
    expect(peticiones[0]!.modelo).toBe("claude-haiku-5-5");
    const bloques = peticiones[0]!.mensajes.at(-1)!.content;
    expect(bloques.some((b) => b.type === "image")).toBe(true);
    expect(bloques.some((b) => b.type === "text" && String(b.text).includes("<contenido_no_confiable>hola"))).toBe(true);

    const exe = await ctx.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "x", adjuntos: [{ nombre: "a.exe", tipo: "application/x-msdownload", datos: "AA==" }] } });
    expect(exe.statusCode).toBe(400);
  });
});
