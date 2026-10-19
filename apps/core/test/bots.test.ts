import { CONFIG_BOT_INICIAL, botConfigSchema, type BotConfig } from "@mi-setup/shared";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { hostedBots } from "../src/db/schema.js";
import { construirComandos } from "../src/modules/bots-discord/index.js";
import type { FabricaMotor, Motor, OpcionesMotor } from "../src/modules/bots-discord/motor.js";
import { bearer, createTestContext, seedUser, TEST_SECRETS } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

const TOKEN = "MTIzNDU2Nzg5MDEyMzQ1Njc4.GabcDE.".padEnd(60, "x");
const PASS = "clave-de-prueba-123";

/** Motor falso: no se conecta a Discord, solo anota lo que se le pide. */
function fabricaFalsa() {
  const vivos: { opciones: OpcionesMotor; llamadas: string[]; config: BotConfig; estado: "encendido" | "apagado" }[] = [];
  const fabrica: FabricaMotor = (o) => {
    const reg = { opciones: o, llamadas: [] as string[], config: o.config, estado: "apagado" as "encendido" | "apagado" };
    vivos.push(reg);
    const m: Motor = {
      async iniciar() {
        reg.llamadas.push("iniciar");
        if (o.token.includes("MALO")) throw new Error("An invalid token was provided");
        reg.estado = "encendido";
        return { appId: "123456789012345678", nombre: "MiBotPrueba" };
      },
      async detener() {
        reg.llamadas.push("detener");
        reg.estado = "apagado";
      },
      async aplicarConfig(c) {
        reg.llamadas.push("config");
        reg.config = c;
      },
      estado: () => reg.estado,
      servidores: () => [{ id: "999999999999999999", nombre: "Mi servidor", miembros: 12, canales: [{ id: "111111111111111111", nombre: "general", tipo: "texto" }], roles: [{ id: "222222222222222222", nombre: "Miembro", color: "#ffffff" }] }],
    };
    return m;
  };
  return { fabrica, vivos };
}

async function preparar() {
  const falsa = fabricaFalsa();
  ctx = await createTestContext({
    config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS }),
    fabricaBots: falsa.fabrica,
    validarTokenBot: async (t) => (t.includes("INVALIDO") ? Promise.reject(Object.assign(new Error("Ese token no es válido"), { statusCode: 400 })) : { appId: "123456789012345678", nombre: "MiBotPrueba" }),
  });
  await seedUser(ctx.db, { email: "dueno@x.test", password: PASS, permissions: { bots_discord: "escritura" } as never });
  await seedUser(ctx.db, { email: "otro@x.test", password: PASS, permissions: { bots_discord: "escritura" } as never });
  const login = async (email: string) => {
    const t = (await ctx!.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: PASS } })).json<{ accessToken: string }>().accessToken;
    await ctx!.app.inject({ method: "POST", url: "/api/auth/reauth", headers: bearer(t), payload: { metodo: "password", password: PASS } });
    return bearer(t);
  };
  return { h: await login("dueno@x.test"), otro: await login("otro@x.test"), falsa, entrar: login };
}

const crear = (h: Record<string, string>, extra: Record<string, unknown> = {}) => ctx!.app.inject({ method: "POST", url: "/api/bots", headers: h, payload: { nombre: "Bot del clan", token: TOKEN, ...extra } });

describe("bots de Discord: administración", () => {
  it("crea el bot con el token cifrado (nunca vuelve a mostrarse) y es solo de su dueño", async () => {
    const { h, otro } = await preparar();
    const r = await crear(h, { cliente: "Pedro" });
    expect(r.statusCode).toBe(200);
    const b = r.json<{ id: string; invitacion: string; botNombre: string }>();
    expect(b.botNombre).toBe("MiBotPrueba");
    expect(b.invitacion).toContain("client_id=123456789012345678");
    expect(JSON.stringify(r.json())).not.toContain(TOKEN);
    const [fila] = await ctx!.db.select().from(hostedBots);
    expect(fila!.tokenEnc).not.toContain(TOKEN);
    expect(fila!.tokenEnc.length).toBeGreaterThan(20);
    expect((await ctx!.app.inject({ method: "GET", url: `/api/bots/${b.id}`, headers: otro })).statusCode).toBe(404);
    expect((await ctx!.app.inject({ method: "GET", url: "/api/bots", headers: otro })).json<unknown[]>()).toHaveLength(0);
    expect((await ctx!.app.inject({ method: "GET", url: "/api/bots", headers: h })).json<unknown[]>()).toHaveLength(1);
  });

  it("rechaza un token inválido", async () => {
    const { h } = await preparar();
    expect((await crear(h, { token: `INVALIDO${TOKEN}` })).statusCode).toBe(400);
    expect((await crear(h, { token: "corto" })).statusCode).toBe(400);
  });

  it("enciende, apaga y reinicia; si Discord rechaza el token queda el motivo", async () => {
    const { h, falsa } = await preparar();
    const b = (await crear(h)).json<{ id: string }>();
    const enc = (await ctx!.app.inject({ method: "POST", url: `/api/bots/${b.id}/encender`, headers: h })).json<{ estado: string; deberiaEstarEncendido: boolean }>();
    expect(enc.estado).toBe("encendido");
    expect(enc.deberiaEstarEncendido).toBe(true);
    const reinicio = (await ctx!.app.inject({ method: "POST", url: `/api/bots/${b.id}/reiniciar`, headers: h })).json<{ estado: string }>();
    expect(reinicio.estado).toBe("encendido");
    expect(falsa.vivos.flatMap((v) => v.llamadas)).toContain("detener");
    const ap = (await ctx!.app.inject({ method: "POST", url: `/api/bots/${b.id}/apagar`, headers: h })).json<{ estado: string; deberiaEstarEncendido: boolean }>();
    expect(ap.estado).toBe("apagado");
    expect(ap.deberiaEstarEncendido).toBe(false);
    // Token que Discord rechaza al conectar
    const malo = (await crear(h, { nombre: "Malo", token: `MALO${TOKEN}` })).json<{ id: string }>();
    const fallo = await ctx!.app.inject({ method: "POST", url: `/api/bots/${malo.id}/encender`, headers: h });
    expect(fallo.statusCode).toBe(502);
    expect(fallo.json<{ error: string }>().error).toContain("token");
    expect((await ctx!.app.inject({ method: "GET", url: `/api/bots/${malo.id}`, headers: h })).json<{ error: string }>().error).toContain("token");
  });

  it("guarda la configuración, la valida y la aplica al bot encendido", async () => {
    const { h, falsa } = await preparar();
    const b = (await crear(h)).json<{ id: string }>();
    await ctx!.app.inject({ method: "POST", url: `/api/bots/${b.id}/encender`, headers: h });
    const cfg = { ...CONFIG_BOT_INICIAL, bienvenida: { ...CONFIG_BOT_INICIAL.bienvenida, activa: true, canalId: "111111111111111111" }, comandos: [{ nombre: "reglas", descripcion: "Las reglas", respuesta: "Sé amable", conEmbed: false, privado: false }] };
    const ok = await ctx!.app.inject({ method: "PUT", url: `/api/bots/${b.id}/config`, headers: h, payload: cfg });
    expect(ok.statusCode).toBe(200);
    expect(falsa.vivos.at(-1)!.config.bienvenida.activa).toBe(true);
    expect((await ctx!.app.inject({ method: "GET", url: `/api/bots/${b.id}`, headers: h })).json<{ config: BotConfig }>().config.comandos[0]!.nombre).toBe("reglas");
    // inválidos
    expect((await ctx!.app.inject({ method: "PUT", url: `/api/bots/${b.id}/config`, headers: h, payload: { bienvenida: { canalId: "nada" } } })).statusCode).toBe(400);
    const pisa = { ...cfg, comandos: [{ nombre: "ban", descripcion: "x", respuesta: "y", conEmbed: false, privado: false }] };
    expect((await ctx!.app.inject({ method: "PUT", url: `/api/bots/${b.id}/config`, headers: h, payload: pisa })).statusCode).toBe(400);
  });

  it("al vencer, el bot se apaga solo y ya no deja encenderlo", async () => {
    const { h, entrar } = await preparar();
    const b = (await crear(h, { vence: "2026-03-02T12:00:00.000Z" })).json<{ id: string; vencido: boolean }>();
    expect(b.vencido).toBe(false);
    await ctx!.app.inject({ method: "POST", url: `/api/bots/${b.id}/encender`, headers: h });
    ctx!.advance(25 * 3600_000);
    // Es lo que hace la tarea que corre cada 5 minutos.
    const apagados = await ctx!.gestorBots.apagarVencidos();
    expect(apagados).toBe(1);
    // Pasó un día: la sesión anterior ya venció, se entra de nuevo.
    const e = await ctx!.app.inject({ method: "POST", url: `/api/bots/${b.id}/encender`, headers: await entrar("dueno@x.test") });
    expect(e.statusCode).toBe(403);
    expect(e.json<{ codigo: string }>().codigo).toBe("bot_vencido");
    expect(ctx!.notifier.sent.some((n) => n.title.includes("venció"))).toBe(true);
  });
});

describe("bots de Discord: enlace del cliente", () => {
  it("el cliente edita su bot con el enlace, sin ver el token ni a su vendedor", async () => {
    const { h } = await preparar();
    const b = (await crear(h, { cliente: "Pedro" })).json<{ id: string }>();
    const { ruta } = (await ctx!.app.inject({ method: "POST", url: `/api/bots/${b.id}/compartir`, headers: h })).json<{ ruta: string }>();
    expect(ruta).toMatch(/^\/bot\/[\w-]{40,}$/);
    const token = ruta.slice(5);
    const [fila] = await ctx!.db.select().from(hostedBots);
    expect(fila!.shareHash).not.toContain(token);
    const vista = await ctx!.app.inject({ method: "GET", url: `/api/bot-publico/${token}` });
    expect(vista.statusCode).toBe(200);
    expect(JSON.stringify(vista.json())).not.toContain("Pedro");
    expect(JSON.stringify(vista.json())).not.toContain(TOKEN);
    const cfg = botConfigSchema.parse({ general: { actividad: { tipo: "jugando", texto: "Con mi clan" } } });
    expect((await ctx!.app.inject({ method: "PUT", url: `/api/bot-publico/${token}/config`, payload: cfg })).statusCode).toBe(200);
    expect((await ctx!.app.inject({ method: "POST", url: `/api/bot-publico/${token}/encender` })).json<{ estado: string }>().estado).toBe("encendido");
    expect((await ctx!.app.inject({ method: "POST", url: `/api/bot-publico/${token}/apagar` })).json<{ estado: string }>().estado).toBe("apagado");
    // Un enlace inventado no sirve y el enlace se puede quitar.
    expect((await ctx!.app.inject({ method: "GET", url: `/api/bot-publico/${"a".repeat(43)}` })).statusCode).toBe(404);
    await ctx!.app.inject({ method: "DELETE", url: `/api/bots/${b.id}/compartir`, headers: h });
    expect((await ctx!.app.inject({ method: "GET", url: `/api/bot-publico/${token}` })).statusCode).toBe(404);
  });

  it("un enlace nuevo invalida el anterior y con el servicio vencido no deja encender", async () => {
    const { h } = await preparar();
    const b = (await crear(h, { vence: "2026-03-02T12:00:00.000Z" })).json<{ id: string }>();
    const t1 = (await ctx!.app.inject({ method: "POST", url: `/api/bots/${b.id}/compartir`, headers: h })).json<{ ruta: string }>().ruta.slice(5);
    const t2 = (await ctx!.app.inject({ method: "POST", url: `/api/bots/${b.id}/compartir`, headers: h })).json<{ ruta: string }>().ruta.slice(5);
    expect((await ctx!.app.inject({ method: "GET", url: `/api/bot-publico/${t1}` })).statusCode).toBe(404);
    ctx!.advance(48 * 3600_000);
    const r = await ctx!.app.inject({ method: "POST", url: `/api/bot-publico/${t2}/encender` });
    expect(r.statusCode).toBe(403);
  });
});

describe("bots de Discord: comandos de barra", () => {
  const nombres = (c: BotConfig) => construirComandos(c).map((x) => x.name);

  it("por defecto solo hay utilidades y el respaldo; cada módulo agrega los suyos", () => {
    const base = nombres(CONFIG_BOT_INICIAL);
    expect(base).toEqual(expect.arrayContaining(["ping", "ayuda", "avatar", "servidor", "usuario", "respaldo-servidor"]));
    expect(base).not.toContain("ban");
    const todo = botConfigSchema.parse({
      moderacion: { activa: true },
      niveles: { activo: true },
      economia: { activa: true, tienda: [{ id: "vip", nombre: "VIP", precio: 500, rolId: "222222222222222222" }] },
      tickets: { activo: true },
      roles: { paneles: [{ id: "juegos", roles: [{ rolId: "222222222222222222", etiqueta: "Minecraft" }] }] },
      comandos: [{ nombre: "reglas", descripcion: "Las reglas", respuesta: "Sé amable" }],
    });
    const n = nombres(todo);
    for (const esperado of ["ban", "kick", "timeout", "advertir", "limpiar", "rango", "top-niveles", "balance", "diario", "trabajar", "tienda", "comprar", "panel-tickets", "cerrar-ticket", "panel-roles", "reglas"]) expect(n).toContain(esperado);
    expect(new Set(n).size).toBe(n.length);
    expect(n.length).toBeLessThanOrEqual(100);
  });

  it("los comandos de sanción exigen permisos y todos son solo de servidor", () => {
    const defs = construirComandos(botConfigSchema.parse({ moderacion: { activa: true } }));
    const ban = defs.find((d) => d.name === "ban")!;
    expect(BigInt(ban.default_member_permissions!)).toBe(1n << 2n);
    for (const d of defs) expect(d.dm_permission).toBe(false);
  });
});
