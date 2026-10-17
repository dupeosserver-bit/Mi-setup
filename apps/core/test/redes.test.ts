import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { loadConfig } from "../src/config.js";
import { socialAccounts } from "../src/db/schema.js";
import type { ClienteIa } from "../src/modules/ia/servicio.js";
import { extraerPrecio, interpretarPrecio } from "../src/modules/novedades.js";
import { descargarTextoSeguro, ipNoPermitida } from "../src/modules/red-segura.js";
import { limpiarCacheDiscord } from "../src/modules/redes/index.js";
import { bearer, createTestContext, seedUser, TEST_SECRETS } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  vi.unstubAllGlobals();
  limpiarCacheDiscord();
  await ctx?.close();
  ctx = undefined;
});

const config = loadConfig({
  NODE_ENV: "test",
  ...TEST_SECRETS,
  TWITCH_CLIENT_ID: "id-de-prueba",
  TWITCH_CLIENT_SECRET: "secreto-de-prueba",
  X_CLIENT_ID: "x-id",
  X_CLIENT_SECRET: "x-secreto",
  DISCORD_BOT_TOKEN: "bot-de-prueba",
});

async function maestra(c: Ctx) {
  const secret = generateTotpSecret();
  await seedUser(c.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secret });
  const res = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secret, c.clock.now) } });
  return bearer(res.json<{ accessToken: string }>().accessToken);
}

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

describe("vigilante de precios", () => {
  it("lee precios en formatos comunes", () => {
    expect(interpretarPrecio("$1,299.00 MXN")).toBe(1299);
    expect(interpretarPrecio("1.299,99 €")).toBe(1299.99);
    expect(interpretarPrecio("MXN 2 450")).toBe(2450);
    expect(interpretarPrecio("Precio: 89.5")).toBe(89.5);
    expect(interpretarPrecio("Agotado")).toBeNull();
    expect(extraerPrecio('<meta itemprop="price" content="1549.00"><span class="p">$9</span>', 'meta[itemprop="price"]').precio).toBe(1549);
    expect(() => extraerPrecio("<p>hola</p>", ".precio")).toThrow(/selector/);
  });

  it("no descarga de la red interna (SSRF)", async () => {
    expect(ipNoPermitida("127.0.0.1")).toBe(true);
    expect(ipNoPermitida("10.0.0.5")).toBe(true);
    expect(ipNoPermitida("172.20.0.1")).toBe(true);
    expect(ipNoPermitida("169.254.169.254")).toBe(true);
    expect(ipNoPermitida("::1")).toBe(true);
    expect(ipNoPermitida("::ffff:192.168.1.1")).toBe(true);
    expect(ipNoPermitida("8.8.8.8")).toBe(false);
    const espia = vi.fn();
    vi.stubGlobal("fetch", espia);
    await expect(descargarTextoSeguro("http://127.0.0.1:3000/api/health")).rejects.toThrow(/red interna/);
    await expect(descargarTextoSeguro("http://[::1]/")).rejects.toThrow(/red interna/);
    await expect(descargarTextoSeguro("file:///etc/passwd")).rejects.toThrow(/http/);
    expect(espia).not.toHaveBeenCalled();
  });
});

describe("OAuth de redes", () => {
  it("el state es de un solo uso y los tokens se guardan cifrados", async () => {
    ctx = await createTestContext({ config });
    const h = await maestra(ctx);
    const inicio = await ctx.app.inject({ method: "POST", url: "/api/redes/oauth/twitch/iniciar", headers: h });
    expect(inicio.statusCode).toBe(200);
    const url = new URL(inicio.json<{ url: string }>().url);
    expect(url.origin).toBe("https://id.twitch.tv");
    const state = url.searchParams.get("state")!;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (destino: string | URL) => {
        const u = String(destino);
        if (u.startsWith("https://id.twitch.tv/oauth2/token")) return json({ access_token: "token-acceso-secreto", refresh_token: "token-refresh-secreto", expires_in: 3600 });
        if (u.startsWith("https://api.twitch.tv/helix/users")) return json({ data: [{ id: "123", display_name: "JokeerYT" }] });
        return json({}, 404);
      }),
    );
    const ok = await ctx.app.inject({ method: "GET", url: `/api/redes/oauth/twitch/callback?code=abc&state=${state}` });
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain("JokeerYT");

    const [cuenta] = await ctx.db.select().from(socialAccounts);
    expect(cuenta?.accessTokenEnc).not.toContain("token-acceso-secreto");
    expect(cuenta?.refreshTokenEnc).not.toContain("token-refresh-secreto");

    const repetido = await ctx.app.inject({ method: "GET", url: `/api/redes/oauth/twitch/callback?code=abc&state=${state}` });
    expect(repetido.statusCode).toBe(400);

    const cuentas = (await ctx.app.inject({ method: "GET", url: "/api/redes/cuentas", headers: h })).json<{ plataforma: string; cuenta: string | null }[]>();
    expect(cuentas.find((c) => c.plataforma === "twitch")?.cuenta).toBe("JokeerYT");
    expect(JSON.stringify(cuentas)).not.toContain("token-");
  });

  it("sin variables avisa cuál falta", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const r = await ctx.app.inject({ method: "POST", url: "/api/redes/oauth/kick/iniciar", headers: h });
    expect(r.json()).toMatchObject({ variable: "KICK_CLIENT_ID" });
  });
});

describe("Discord y X", () => {
  it("Discord solo envía a canales del bot y sin menciones masivas", async () => {
    ctx = await createTestContext({ config });
    const h = await maestra(ctx);
    const llamadas: { url: string; cuerpo?: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (destino: string | URL, init?: RequestInit) => {
        const u = String(destino);
        llamadas.push({ url: u, ...(typeof init?.body === "string" ? { cuerpo: init.body } : {}) });
        if (u.endsWith("/users/@me/guilds")) return json([{ id: "900000000000000001", name: "MexicanLand" }]);
        if (u.includes("/guilds/")) return json([{ id: "800000000000000001", name: "anuncios", type: 5, position: 0 }]);
        if (u.includes("/messages")) return json({ id: "700000000000000001" });
        return json({}, 404);
      }),
    );
    const mal = await ctx.app.inject({ method: "POST", url: "/api/discord/enviar", headers: h, payload: { canalId: "123456789", texto: "hola" } });
    expect(mal.statusCode).toBe(404);
    const ok = await ctx.app.inject({ method: "POST", url: "/api/discord/enviar", headers: h, payload: { canalId: "800000000000000001", texto: "@everyone mantenimiento" } });
    expect(ok.statusCode).toBe(200);
    const envio = llamadas.find((l) => l.url.includes("/messages"));
    expect(JSON.parse(envio!.cuerpo!)).toMatchObject({ allowed_mentions: { parse: [] } });
  });

  it("X exige aceptar el costo estimado", async () => {
    ctx = await createTestContext({ config });
    const h = await maestra(ctx);
    expect((await ctx.app.inject({ method: "GET", url: "/api/x/estimacion", headers: h })).json()).toEqual({ publicarUsd: 0.01, leerPorMencionUsd: 0.005 });
    const sin = await ctx.app.inject({ method: "POST", url: "/api/x/publicar", headers: h, payload: { texto: "hola" } });
    expect(sin.statusCode).toBe(400);
  });

  it("la IA redacta el post, pero solo se publica al aprobar", async () => {
    const ia: ClienteIa = {
      async mensajes(p) {
        const ya = p.mensajes.at(-1)?.content.some((b) => b.type === "tool_result");
        return ya
          ? { model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Propuesto." }], usage: { input_tokens: 10, output_tokens: 10 } }
          : {
              model: "claude-sonnet-5-5",
              stop_reason: "tool_use",
              content: [{ type: "tool_use", id: "t1", name: "publicar_x", input: { texto: "Servidores de MexicanLand en mantenimiento 20:00" } }],
              usage: { input_tokens: 10, output_tokens: 10 },
            };
      },
    };
    ctx = await createTestContext({ config, clienteIa: ia });
    const h = await maestra(ctx);
    const llamadas: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (destino: string | URL) => {
        llamadas.push(String(destino));
        return json([]);
      }),
    );
    const { propuestas } = (await ctx.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "avisa del mantenimiento en X" } })).json<{
      propuestas: { id: string; descripcion: string }[];
    }>();
    expect(propuestas[0]!.descripcion).toContain("USD");
    expect(llamadas.filter((u) => u.includes("api.x.com"))).toHaveLength(0);
  });
});
