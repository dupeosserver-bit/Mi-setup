import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { loadConfig } from "../src/config.js";
import { interpretarFeed } from "../src/modules/noticias.js";
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

async function maestra(c: Ctx) {
  const secret = generateTotpSecret();
  await seedUser(c.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secret });
  const res = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secret, c.clock.now) } });
  return bearer(res.json<{ accessToken: string }>().accessToken);
}

const respuesta = (cuerpo: unknown, tipo = "application/json") =>
  new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status: 200, headers: { "content-type": tipo } });

describe("noticias", () => {
  it("lee RSS y Atom, sin HTML y solo con enlaces http(s)", () => {
    const rss = `<?xml version="1.0"?><rss><channel>
      <item><title>Nuevo &lt;b&gt;Minecraft&lt;/b&gt;</title><link>https://ejemplo.mx/a</link><pubDate>Fri, 16 Oct 2026 10:00:00 GMT</pubDate>
        <description>&lt;p&gt;Hola &lt;b&gt;mundo&lt;/b&gt;&lt;/p&gt;</description><source url="https://x">El Diario</source></item>
      <item><title>Malo</title><link>javascript:alert(1)</link></item>
    </channel></rss>`;
    const n = interpretarFeed(rss, "Prueba");
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ titulo: "Nuevo Minecraft", url: "https://ejemplo.mx/a", fuente: "El Diario", resumen: "Hola mundo" });
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Entrada</title><link href="https://b.mx/1"/><updated>2026-10-15T08:00:00Z</updated></entry></feed>`;
    expect(interpretarFeed(atom, "Atom")[0]).toMatchObject({ titulo: "Entrada", url: "https://b.mx/1", fuente: "Atom", fecha: "2026-10-15T08:00:00.000Z" });
  });
});

describe("mercados", () => {
  it("inversiones calcula el cambio con los últimos cierres; divisas convierte", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (destino: string | URL) => {
        const u = String(destino);
        if (u.includes("finance.yahoo.com") && u.includes("/AAPL?")) {
          return respuesta({ chart: { result: [{ meta: { symbol: "AAPL", currency: "USD", longName: "Apple Inc.", regularMarketPrice: 110 }, indicators: { quote: [{ close: [100, 110] }] } }], error: null } });
        }
        if (u.includes("finance.yahoo.com")) return new Response(JSON.stringify({ chart: { result: null, error: { description: "No data found" } } }), { status: 404 });
        if (u.includes("frankfurter.app/latest")) return respuesta({ date: "2026-10-16", rates: { MXN: 18.5 } });
        return respuesta({});
      }),
    );
    await ctx.app.inject({ method: "PUT", url: "/api/inversiones/lista", headers: h, payload: { simbolos: ["aapl", "XYZ"] } });
    const inv = (await ctx.app.inject({ method: "GET", url: "/api/inversiones", headers: h })).json<{ simbolo: string; precio: number | null; cambio: number | null; error?: string }[]>();
    expect(inv[0]).toMatchObject({ simbolo: "AAPL", nombre: "Apple Inc.", precio: 110 });
    expect(inv[0]!.cambio).toBeCloseTo(10);
    expect(inv[1]!.error).toMatch(/no encontrado/);
    expect((await ctx.app.inject({ method: "PUT", url: "/api/inversiones/lista", headers: h, payload: { simbolos: ["rm -rf"] } })).statusCode).toBe(400);

    const conv = await ctx.app.inject({ method: "GET", url: "/api/divisas/convertir?de=USD&a=MXN&cantidad=10", headers: h });
    expect(conv.json()).toMatchObject({ resultado: 185, tasa: 18.5 });
  });

  it("juegos gratis solo muestra los activos", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respuesta([
          { id: 1, title: "Juego A", worth: "$19.99", image: "https://i/a.jpg", description: "x", open_giveaway_url: "https://g/a", platforms: "PC, Epic Games Store", end_date: "N/A", status: "Active" },
          { id: 2, title: "Juego B", worth: "N/A", image: "https://i/b.jpg", description: "y", open_giveaway_url: "https://g/b", platforms: "Steam", end_date: "N/A", status: "Expired" },
        ]),
      ),
    );
    const r = (await ctx.app.inject({ method: "GET", url: "/api/novedades/juegos-gratis?plataforma=epic-games-store", headers: h })).json<{ pagina: number; totalPaginas: number; juegos: { titulo: string }[] }>();
    expect(r.juegos.map((g) => g.titulo)).toEqual(["Juego A"]);
    expect(r.pagina).toBe(1);
  });
});

describe("Discord: tarjetas (embed)", () => {
  it("envía la tarjeta con color y sin menciones masivas", async () => {
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, DISCORD_BOT_TOKEN: "bot-de-prueba" }) });
    const h = await maestra(ctx);
    const cuerpos: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (destino: string | URL, init?: RequestInit) => {
        const u = String(destino);
        if (typeof init?.body === "string") cuerpos.push(init.body);
        if (u.endsWith("/users/@me/guilds")) return respuesta([{ id: "900000000000000001", name: "MexicanLand" }]);
        if (u.includes("/guilds/")) return respuesta([{ id: "800000000000000001", name: "anuncios", type: 5, position: 0 }]);
        return respuesta({ id: "700000000000000001" });
      }),
    );
    const r = await ctx.app.inject({
      method: "POST",
      url: "/api/discord/enviar",
      headers: h,
      payload: { canalId: "800000000000000001", embed: { titulo: "Mantenimiento", descripcion: "20:00", color: "#ff0000" } },
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(cuerpos.at(-1)!)).toMatchObject({ embeds: [{ title: "Mantenimiento", color: 0xff0000 }], allowed_mentions: { parse: [] } });
    const vacio = await ctx.app.inject({ method: "POST", url: "/api/discord/enviar", headers: h, payload: { canalId: "800000000000000001" } });
    expect(vacio.statusCode).toBe(400);
  });
});
