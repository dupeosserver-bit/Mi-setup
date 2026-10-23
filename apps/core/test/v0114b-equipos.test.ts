import { clasificarAgente, MAX_HISTORIAL_SESIONES } from "@mi-setup/shared";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { devices, sessions } from "../src/db/schema.js";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

const UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) MiSetup/0.11.4 Chrome/124.0 Electron/30.0 Safari/537.36";
const UA_CEL = "Mozilla/5.0 (Linux; Android 16; SM-A566B Build/BP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36";
const UA_TABLET = "Mozilla/5.0 (Linux; Android 15; SM-X210) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

async function preparar() {
  ctx = await createTestContext();
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-usuario-123", permissions: { equipos: "escritura" } });
  return ctx;
}

async function entrar(c: Ctx, ua = UA_PC) {
  const r = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-usuario-123", dispositivo: "PC" }, headers: { "user-agent": ua } });
  expect(r.statusCode).toBe(200);
  return bearer(r.json<{ accessToken: string }>().accessToken);
}

async function registrar(c: Ctx, h: Record<string, string>, cuerpo: Record<string, unknown>) {
  const r = await c.app.inject({ method: "POST", url: "/api/equipos/registrar", headers: h, payload: { nombre: "PC de prueba", tipo: "pc", ...cuerpo } });
  expect(r.statusCode).toBe(200);
  return r.json<{ id: string }>().id;
}

describe("0.11.4b · Equipos", () => {
  it("reinstalar la app en el mismo aparato no crea otro equipo y cierra la sesión vieja", async () => {
    const c = await preparar();
    const h1 = await entrar(c);
    const id1 = await registrar(c, h1, { huella: "maquina-abc-123" });
    const h2 = await entrar(c);
    const id2 = await registrar(c, h2, { huella: "maquina-abc-123" });
    expect(id2).toBe(id1);
    const lista = await c.db.select().from(devices);
    expect(lista).toHaveLength(1);
    expect(lista[0]!.reinstalls).toBe(1);
    expect((await c.app.inject({ method: "GET", url: "/api/equipos", headers: h1 })).statusCode).toBe(401);
    const abiertas = (await c.app.inject({ method: "GET", url: "/api/seguridad/sesiones", headers: h2 })).json<unknown[]>();
    expect(abiertas).toHaveLength(1);
  });

  it("un equipo viejo sin huella la adopta y se juntan sus copias repetidas", async () => {
    const c = await preparar();
    const h = await entrar(c);
    const viejo = await registrar(c, h, {});
    await registrar(c, h, {});
    expect(await c.db.select().from(devices)).toHaveLength(2);
    const id = await registrar(c, h, { id: viejo, huella: "maquina-xyz-999" });
    expect(id).toBe(viejo);
    const lista = await c.db.select().from(devices);
    expect(lista).toHaveLength(1);
    expect(lista[0]!.fingerprint).not.toBe("maquina-xyz-999");
  });

  it("otro aparato distinto sí cuenta aparte y se detecta si es PC, tablet o celular", async () => {
    const c = await preparar();
    const h = await entrar(c);
    await registrar(c, h, { huella: "maquina-1" });
    await registrar(c, h, { huella: "tablet-1", tipo: "tablet", nombre: "Tablet" });
    expect(await c.db.select().from(devices)).toHaveLength(2);
    expect(clasificarAgente(UA_PC)).toEqual({ tipo: "pc", sistema: "Windows", cliente: "app" });
    expect(clasificarAgente(UA_CEL)).toEqual({ tipo: "celular", sistema: "Android 16", cliente: "app" });
    expect(clasificarAgente(UA_TABLET)).toEqual({ tipo: "tablet", sistema: "Android 15", cliente: "navegador" });
    expect(clasificarAgente("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)").tipo).toBe("tablet");
  });

  it("el historial guarda como máximo 9 sesiones", async () => {
    const c = await preparar();
    let h = await entrar(c);
    for (let i = 0; i < MAX_HISTORIAL_SESIONES + 3; i++) {
      c.advance(60_000);
      h = await entrar(c, i % 2 ? UA_CEL : UA_PC);
    }
    expect(await c.db.select().from(sessions)).toHaveLength(MAX_HISTORIAL_SESIONES);
    const historial = (await c.app.inject({ method: "GET", url: "/api/seguridad/sesiones/historial", headers: h })).json<{ tipo: string; estado: string }[]>();
    expect(historial).toHaveLength(MAX_HISTORIAL_SESIONES);
    expect(historial[0]!.estado).toBe("abierta");
  });

  it("«Cerrar todas menos esta» deja abierta solo la sesión actual", async () => {
    const c = await preparar();
    await entrar(c, UA_CEL);
    await entrar(c, UA_TABLET);
    const h = await entrar(c);
    const pin = await c.app.inject({ method: "POST", url: "/api/seguridad/sesiones/cerrar-otras", headers: h });
    if (pin.statusCode === 200) {
      expect(pin.json<{ cerradas: number }>().cerradas).toBe(2);
    } else {
      expect([401, 403, 428]).toContain(pin.statusCode);
      const filas = await c.db.select().from(sessions);
      const actual = filas.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]!;
      await c.db.update(sessions).set({ reauthAt: c.clock.now, reauthMethod: "pin" }).where(eq(sessions.id, actual.id));
      const r = await c.app.inject({ method: "POST", url: "/api/seguridad/sesiones/cerrar-otras", headers: h });
      expect(r.statusCode).toBe(200);
      expect(r.json<{ cerradas: number }>().cerradas).toBe(2);
    }
    const abiertas = (await c.app.inject({ method: "GET", url: "/api/seguridad/sesiones", headers: h })).json<{ actual: boolean }[]>();
    expect(abiertas).toHaveLength(1);
    expect(abiertas[0]!.actual).toBe(true);
  });
});
