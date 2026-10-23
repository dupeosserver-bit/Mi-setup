import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { googleAccounts } from "../src/db/schema.js";
import { MAX_CUENTAS_GOOGLE } from "../src/modules/correo-google.js";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

async function entrar(c: Ctx, email: string, password: string, totp?: string, remoteAddress?: string) {
  const r = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password, totp }, ...(remoteAddress ? { remoteAddress } : {}) });
  expect(r.statusCode).toBe(200);
  return bearer(r.json<{ accessToken: string }>().accessToken);
}

async function preparar() {
  ctx = await createTestContext();
  const secreto = generateTotpSecret();
  await seedUser(ctx.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secreto });
  const uid = await seedUser(ctx.db, { email: "u@x.test", password: "clave-usuario-123", permissions: { notas: "escritura", ciberseguridad: "escritura" } });
  const dueno = await entrar(ctx, "m@x.test", "clave-maestra-123", totpAt(secreto, ctx.clock.now));
  return { c: ctx, dueno, uid, usuario: () => entrar(ctx!, "u@x.test", "clave-usuario-123") };
}

const PRIVADAS = ["/api/ptero/estado", "/api/clientes", "/api/hostlocal/servidores", "/api/x/estimacion", "/api/streams/twitch", "/api/vps/seguridad/entradas"];

describe("0.11.4b · permisos por categoría", () => {
  it("una cuenta sin rol no entra a Panel, Host local, Redes ni a las entradas del VPS; el dueño sí", async () => {
    const { c, dueno, usuario } = await preparar();
    const u = await usuario();
    for (const url of PRIVADAS) expect((await c.app.inject({ method: "GET", url, headers: u })).statusCode, url).toBe(403);
    for (const url of ["/api/ptero/estado", "/api/clientes", "/api/hostlocal/servidores", "/api/x/estimacion", "/api/vps/seguridad/entradas"]) {
      expect((await c.app.inject({ method: "GET", url, headers: dueno })).statusCode, url).not.toBe(403);
    }
  });

  it("el rol Invitado abre Redes y streams, pero nunca Host local", async () => {
    const { c, dueno, uid, usuario } = await preparar();
    const roles = (await c.app.inject({ method: "GET", url: "/api/roles", headers: dueno })).json<{ id: string; nombre: string }[]>();
    const invitado = roles.find((r) => r.nombre === "Invitado")!;
    expect(invitado).toBeTruthy();
    await c.app.inject({ method: "PATCH", url: `/api/roles/${invitado.id}`, headers: dueno, payload: { permisos: { x: "escritura", host_local: "administrar" } } });
    expect((await c.app.inject({ method: "PUT", url: `/api/cuentas/${uid}/roles`, headers: dueno, payload: { roles: [invitado.id] } })).statusCode).toBe(200);
    const u = await usuario();
    expect((await c.app.inject({ method: "GET", url: "/api/x/estimacion", headers: u })).statusCode).toBe(200);
    expect((await c.app.inject({ method: "GET", url: "/api/hostlocal/servidores", headers: u })).statusCode).toBe(403);
    expect((await c.app.inject({ method: "GET", url: "/api/ptero/estado", headers: u })).statusCode).toBe(403);
  });

  it("Agentes de IA vive en la categoría IA y sigue siendo solo del dueño", async () => {
    const { MODULES } = await import("@mi-setup/shared");
    expect(MODULES.vps_agentes.category).toBe("ia");
    expect(MODULES.vps_agentes.masterOnly).toBe(true);
    expect(MODULES.host_local.masterOnly).toBe(true);
  });

  it("las entradas recientes salen en VPS con paginas y quién entró", async () => {
    const { c, dueno, usuario } = await preparar();
    await usuario();
    await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "mala-clave-000" } });
    const r = (await c.app.inject({ method: "GET", url: "/api/vps/seguridad/entradas?porPagina=5", headers: dueno })).json<{ total: number; porPagina: number; entradas: { tipo: string; usuario: string | null }[] }>();
    expect(r.porPagina).toBe(5);
    expect(r.total).toBeGreaterThanOrEqual(3);
    expect(r.entradas.some((e) => e.tipo === "login_fallido")).toBe(true);
    expect(r.entradas.some((e) => e.usuario === "u")).toBe(true);
    expect((await c.app.inject({ method: "GET", url: "/api/seguridad/inicios", headers: dueno })).statusCode).toBe(404);
  });

  it(`no deja conectar más de ${MAX_CUENTAS_GOOGLE} cuentas de Google`, async () => {
    const { c, usuario, uid } = await preparar();
    const u = await usuario();
    const lista = (await c.app.inject({ method: "GET", url: "/api/google/correo/cuentas", headers: u })).json<{ limite: number }>();
    expect(lista.limite).toBe(10);
    await c.db.insert(googleAccounts).values(
      Array.from({ length: MAX_CUENTAS_GOOGLE }, (_, i) => ({ userId: uid, email: `c${i}@gmail.test`, accessTokenEnc: "x", expiresAt: c.clock.now, scopes: "" })),
    );
    await c.app.inject({ method: "POST", url: "/api/auth/reauth", headers: u, payload: { metodo: "password", password: "clave-usuario-123" } });
    const r = await c.app.inject({ method: "POST", url: "/api/google/correo/conectar", headers: u });
    expect(r.statusCode).toBe(400);
    expect(r.json<{ error: string }>().error).toContain("10 cuentas");
  });
});
