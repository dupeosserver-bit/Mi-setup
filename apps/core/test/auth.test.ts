import { afterEach, describe, expect, it } from "vitest";
import { createDbAuditWriter } from "../src/audit/audit.js";
import { createMasterAccount, masterExists } from "../src/auth/master.js";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { loadConfig } from "../src/config.js";
import { auditLog } from "../src/db/schema.js";
import { auditRows, bearer, createTestContext, seedUser, testCipher } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const EMAIL = "jokeer@x.test";
const PASSWORD = "contraseña-muy-segura-123";
const MIN = 60 * 1000;

let ctx: Ctx | undefined;
afterEach(async () => ctx?.close());

async function conMaestra() {
  ctx = await createTestContext();
  const secret = generateTotpSecret();
  await seedUser(ctx.db, { email: EMAIL, password: PASSWORD, role: "maestra", totpSecret: secret });
  return { ctx, secret };
}

function login(c: Ctx, payload: Record<string, unknown>) {
  return c.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload,
    headers: { "user-agent": "vitest" },
  });
}

async function loginOk(c: Ctx, secret: string): Promise<Tokens> {
  const res = await login(c, { email: EMAIL, password: PASSWORD, totp: totpAt(secret, c.clock.now) });
  expect(res.statusCode).toBe(200);
  return res.json<Tokens>();
}

function refresh(c: Ctx, refreshToken: string) {
  return c.app.inject({ method: "POST", url: "/api/auth/refresh", payload: { refreshToken } });
}

function me(c: Ctx, accessToken: string) {
  return c.app.inject({ method: "GET", url: "/api/auth/me", headers: bearer(accessToken) });
}

describe("inicio de sesión", () => {
  it("la maestra necesita contraseña y código 2FA; cada fallo avisa por push y se audita", async () => {
    const { ctx: c, secret } = await conMaestra();

    const sinCodigo = await login(c, { email: EMAIL, password: PASSWORD, dispositivo: "PC" });
    expect(sinCodigo.statusCode).toBe(401);
    expect(sinCodigo.json()).toMatchObject({ codigo: "credenciales_invalidas" });

    const malaClave = await login(c, { email: EMAIL, password: "otra-cosa-123456", totp: totpAt(secret, c.clock.now) });
    expect(malaClave.statusCode).toBe(401);

    expect(c.notifier.sent).toHaveLength(2);
    expect(c.notifier.sent[0]?.title).toMatch(/intento fallido/);
    expect(c.notifier.sent[0]?.message).toContain(EMAIL);
    expect(c.notifier.sent[0]?.message).toContain("PC");

    const tokens = await loginOk(c, secret);
    expect(tokens.refreshToken).toContain(".");

    const perfil = await me(c, tokens.accessToken);
    expect(perfil.statusCode).toBe(200);
    expect(perfil.json()).toMatchObject({
      usuario: { email: EMAIL, role: "maestra" },
      permisos: { boveda: "administrar" },
      reauth: { metodo: "password" },
    });

    const acciones = (await auditRows(c.db)).map((r) => r.action);
    expect(acciones).toEqual(["login_fallido", "login_fallido", "login"]);
  });

  it("un código 2FA no se puede usar dos veces", async () => {
    const { ctx: c, secret } = await conMaestra();
    const codigo = totpAt(secret, c.clock.now);
    expect((await login(c, { email: EMAIL, password: PASSWORD, totp: codigo })).statusCode).toBe(200);
    expect((await login(c, { email: EMAIL, password: PASSWORD, totp: codigo })).statusCode).toBe(401);
    c.advance(30 * 1000);
    await loginOk(c, secret);
  });

  it("bloquea 15 minutos tras 5 fallos, aunque luego la contraseña sea correcta", async () => {
    const { ctx: c, secret } = await conMaestra();
    for (let i = 0; i < 5; i++) {
      expect((await login(c, { email: EMAIL, password: "incorrecta-123456" })).statusCode).toBe(401);
    }
    const bloqueado = await login(c, { email: EMAIL, password: PASSWORD, totp: totpAt(secret, c.clock.now) });
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json()).toMatchObject({ codigo: "bloqueo_temporal" });
    expect(Number(bloqueado.headers["retry-after"])).toBeGreaterThan(0);
    expect(c.notifier.sent.at(-1)?.title).toMatch(/bloqueado/);

    c.advance(15 * MIN + 1000);
    await loginOk(c, secret);
  });

  it("una cuenta desactivada no puede iniciar sesión", async () => {
    ctx = await createTestContext();
    await seedUser(ctx.db, { email: "baja@x.test", password: "clave-de-baja-123", isActive: false });
    expect((await login(ctx, { email: "baja@x.test", password: "clave-de-baja-123" })).statusCode).toBe(401);
  });

  it("sin JWT_SECRET responde 'Falta configurar' sin romperse", async () => {
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test" }) });
    const res = await login(ctx, { email: EMAIL, password: PASSWORD });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "Falta configurar: JWT_SECRET" });
  });
});

describe("sesiones y refresh rotativo", () => {
  it("rota el refresh token y, si se reutiliza uno viejo, revoca la sesión y avisa", async () => {
    const { ctx: c, secret } = await conMaestra();
    const t1 = await loginOk(c, secret);

    const r2 = await refresh(c, t1.refreshToken);
    expect(r2.statusCode).toBe(200);
    const t2 = r2.json<Tokens>();
    expect(t2.refreshToken).not.toBe(t1.refreshToken);

    const t3 = (await refresh(c, t2.refreshToken)).json<Tokens>();
    expect((await me(c, t3.accessToken)).statusCode).toBe(200);

    // Alguien reutiliza t2 (ya rotado): se considera robo.
    expect((await refresh(c, t2.refreshToken)).statusCode).toBe(401);
    expect((await me(c, t3.accessToken)).statusCode).toBe(401);
    expect((await refresh(c, t3.refreshToken)).statusCode).toBe(401);
    expect(c.notifier.sent.at(-1)?.title).toMatch(/robo de sesión/);
  });

  it("el accessToken vence a los 15 minutos", async () => {
    const { ctx: c, secret } = await conMaestra();
    const t = await loginOk(c, secret);
    c.advance(16 * MIN);
    expect((await me(c, t.accessToken)).statusCode).toBe(401);
    expect((await refresh(c, t.refreshToken)).statusCode).toBe(200);
  });

  it("cerrar sesión invalida los tokens", async () => {
    const { ctx: c, secret } = await conMaestra();
    const t = await loginOk(c, secret);
    const salir = await c.app.inject({ method: "POST", url: "/api/auth/logout", headers: bearer(t.accessToken) });
    expect(salir.statusCode).toBe(200);
    expect((await me(c, t.accessToken)).statusCode).toBe(401);
    expect((await refresh(c, t.refreshToken)).statusCode).toBe(401);
  });
});

describe("reautenticación (5 minutos)", () => {
  function rutas(c: Ctx) {
    const ok = async () => ({ ok: true });
    c.app.get("/api/prueba/fuerte", { config: { acceso: { autenticado: true, reauth: "fuerte" } } }, ok);
    c.app.get("/api/prueba/pin", { config: { acceso: { autenticado: true, reauth: "pin" } } }, ok);
  }
  const get = (c: Ctx, url: string, token: string) => c.app.inject({ method: "GET", url, headers: bearer(token) });
  const reauth = (c: Ctx, token: string, payload: Record<string, unknown>) =>
    c.app.inject({ method: "POST", url: "/api/auth/reauth", headers: bearer(token), payload });
  const setPin = (c: Ctx, token: string, pin: string) =>
    c.app.inject({ method: "PUT", url: "/api/auth/pin", headers: bearer(token), payload: { pin } });

  it("vence a los 5 min; el PIN o la contraseña sirven también para acciones fuertes", async () => {
    const { ctx: c, secret } = await conMaestra();
    rutas(c);
    const { accessToken: t } = await loginOk(c, secret);

    // Recién iniciada la sesión (contraseña + 2FA) cuenta como reautenticación fuerte.
    expect((await get(c, "/api/prueba/fuerte", t)).statusCode).toBe(200);

    c.advance(6 * MIN);
    const vencida = await get(c, "/api/prueba/fuerte", t);
    expect(vencida.statusCode).toBe(403);
    expect(vencida.json()).toMatchObject({ codigo: "reauth_requerida", metodo: "fuerte" });
    expect((await setPin(c, t, "123456")).statusCode).toBe(403);

    expect((await reauth(c, t, { metodo: "password", password: PASSWORD })).statusCode).toBe(200);
    expect((await get(c, "/api/prueba/fuerte", t)).statusCode).toBe(200);
    expect((await setPin(c, t, "48151623")).statusCode).toBe(200);
    expect((await setPin(c, t, "123")).statusCode).toBe(400);

    c.advance(6 * MIN);
    expect((await reauth(c, t, { metodo: "pin", pin: "48151623" })).statusCode).toBe(200);
    expect((await get(c, "/api/prueba/pin", t)).statusCode).toBe(200);
    // Con PIN correcto entra directo (sin pedir además la contraseña).
    expect((await get(c, "/api/prueba/fuerte", t)).statusCode).toBe(200);
  });

  it("5 PIN incorrectos seguidos cierran la sesión", async () => {
    const { ctx: c, secret } = await conMaestra();
    const { accessToken: t } = await loginOk(c, secret);
    expect((await setPin(c, t, "48151623")).statusCode).toBe(200);

    for (let i = 1; i <= 4; i++) {
      const res = await reauth(c, t, { metodo: "pin", pin: "000000" });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toMatchObject({ codigo: "reauth_fallida", intentosRestantes: 5 - i });
    }
    const ultimo = await reauth(c, t, { metodo: "pin", pin: "000000" });
    expect(ultimo.json()).toMatchObject({ codigo: "sesion_revocada" });
    expect((await me(c, t)).statusCode).toBe(401);
    expect(c.notifier.sent.at(-1)?.title).toMatch(/sesión cerrada/);
  });
});

describe("cuenta maestra y auditoría", () => {
  it("solo puede existir una cuenta maestra", async () => {
    ctx = await createTestContext();
    const audit = createDbAuditWriter(ctx.db);
    const datos = { email: "Jefe@X.test", displayName: "Jefe", password: PASSWORD, totpSecret: generateTotpSecret() };
    await createMasterAccount(ctx.db, testCipher, audit, datos);
    expect(await masterExists(ctx.db)).toBe(true);
    await expect(createMasterAccount(ctx.db, testCipher, audit, datos)).rejects.toThrow(/Ya existe/);
    expect((await auditRows(ctx.db)).map((r) => r.action)).toEqual(["cuenta_maestra_creada"]);
  });

  it("el registro de auditoría no se puede modificar ni borrar", async () => {
    const { ctx: c } = await conMaestra();
    await login(c, { email: EMAIL, password: "incorrecta-123456" });
    await expect(c.db.update(auditLog).set({ action: "alterado" })).rejects.toThrow();
    await expect(c.db.delete(auditLog)).rejects.toThrow();
    expect((await auditRows(c.db)).map((r) => r.action)).toEqual(["login_fallido"]);
  });
});
