import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { loadConfig } from "../src/config.js";
import { expirations } from "../src/db/schema.js";
import { recordarCobros, siguienteCobro } from "../src/modules/negocio.js";
import { revisarVencimiento, vencimientoRdap } from "../src/modules/vencimientos.js";
import { bearer, createTestContext, seedUser, TEST_SECRETS } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
let panel: Server | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
  panel?.close();
  panel = undefined;
});

async function maestra(c: Ctx) {
  const secret = generateTotpSecret();
  await seedUser(c.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secret });
  const res = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secret, c.clock.now) } });
  return bearer(res.json<{ accessToken: string }>().accessToken);
}

describe("Pterodactyl", () => {
  it("lista servidores y envía energía con la llave de cliente", async () => {
    const recibido: { ruta: string; auth: string | undefined; cuerpo: string }[] = [];
    panel = createServer((req, res) => {
      let cuerpo = "";
      req.on("data", (d) => (cuerpo += d));
      req.on("end", () => {
        recibido.push({ ruta: req.url ?? "", auth: req.headers.authorization, cuerpo });
        res.setHeader("content-type", "application/json");
        if (req.url?.startsWith("/api/client?")) {
          res.end(
            JSON.stringify({
              data: [
                {
                  attributes: {
                    identifier: "abc12345",
                    uuid: "abc12345-0000-0000-0000-000000000000",
                    name: "Survival",
                    description: "",
                    node: "Nodo 1",
                    is_suspended: false,
                    limits: { memory: 4096, disk: 20000, cpu: 200 },
                    relationships: { allocations: { data: [{ attributes: { ip_alias: "play.mexicanland.net", ip: "1.2.3.4", port: 25565, is_default: true } }] } },
                  },
                },
              ],
            }),
          );
        } else if (req.url === "/api/client/servers/abc12345/power") {
          res.statusCode = 204;
          res.end();
        } else {
          res.statusCode = 404;
          res.end("{}");
        }
      });
    });
    await new Promise<void>((r) => panel!.listen(0, "127.0.0.1", () => r()));
    const puerto = (panel.address() as { port: number }).port;

    ctx = await createTestContext({
      config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, PTERO_URL: `http://127.0.0.1:${puerto}`, PTERO_CLIENT_KEY: "ptlc_prueba" }),
    });
    const h = await maestra(ctx);
    const lista = await ctx.app.inject({ method: "GET", url: "/api/ptero/servidores", headers: h });
    expect(lista.json()).toEqual([
      expect.objectContaining({ id: "abc12345", nombre: "Survival", direccion: "play.mexicanland.net:25565", limites: { memoriaMb: 4096, discoMb: 20000, cpu: 200 } }),
    ]);
    const energia = await ctx.app.inject({ method: "POST", url: "/api/ptero/servidores/abc12345/energia", headers: h, payload: { senal: "restart" } });
    expect(energia.statusCode).toBe(200);
    expect(recibido.at(-1)).toMatchObject({ ruta: "/api/client/servers/abc12345/power", auth: "Bearer ptlc_prueba", cuerpo: '{"signal":"restart"}' });
  });

  it("sin llave responde 'Falta configurar' sin romperse", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const res = await ctx.app.inject({ method: "GET", url: "/api/ptero/servidores", headers: h });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: "Falta configurar: PTERO_CLIENT_KEY" });
  });
});

describe("clientes, cobros y finanzas", () => {
  it("al pagar registra el ingreso, avanza la fecha y el resumen lo suma", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const { id: clienteId } = (await ctx.app.inject({ method: "POST", url: "/api/clientes", headers: h, payload: { nombre: "Clan Azteca" } })).json<{ id: string }>();
    const { id: cobroId } = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/cobros",
        headers: h,
        payload: { clienteId, concepto: "Servidor Survival", monto: 350, frecuencia: "mensual", proximo: "2026-03-02T00:00:00Z" },
      })
    ).json<{ id: string }>();

    // Vence en menos de 3 días: se avisa una sola vez al día.
    expect(await recordarCobros(ctx.deps)).toBe(1);
    expect(await recordarCobros(ctx.deps)).toBe(0);
    expect(ctx.notifier.sent[0]?.title).toBe("Mi Setup: cobrar a Clan Azteca");

    const pagado = await ctx.app.inject({ method: "POST", url: `/api/cobros/${cobroId}/pagado`, headers: h });
    expect(pagado.json()).toMatchObject({ proximo: "2026-04-02T00:00:00.000Z", estado: "activo" });

    await ctx.app.inject({ method: "POST", url: "/api/finanzas/movimientos", headers: h, payload: { tipo: "gasto", monto: 120.5, categoria: "VPS", fecha: "2026-03-01T10:00:00Z" } });
    const resumen = (await ctx.app.inject({ method: "GET", url: "/api/finanzas/resumen?meses=3", headers: h })).json<{
      totales: { ingresos: number; gastos: number; neto: number };
      porMes: { mes: string }[];
      gastosPorCategoria: { nombre: string; valor: number }[];
    }>();
    expect(resumen.totales).toEqual({ ingresos: 350, gastos: 120.5, neto: 229.5 });
    expect(resumen.porMes.map((m) => m.mes)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(resumen.gastosPorCategoria).toEqual([{ nombre: "VPS", valor: 120.5 }]);
  });

  it("calcula el siguiente cobro respetando fin de mes", () => {
    expect(siguienteCobro(new Date("2026-01-31T00:00:00Z"), "mensual")?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(siguienteCobro(new Date("2026-01-15T00:00:00Z"), "trimestral")?.toISOString()).toBe("2026-04-15T00:00:00.000Z");
    expect(siguienteCobro(new Date("2026-01-15T00:00:00Z"), "unico")).toBeNull();
  });
});

describe("vencimientos", () => {
  it("lee la fecha de RDAP y avisa con anticipación una vez al día", async () => {
    expect(vencimientoRdap({ events: [{ eventAction: "registration", eventDate: "2020-01-01T00:00:00Z" }, { eventAction: "expiration", eventDate: "2026-03-11T00:00:00Z" }] })?.toISOString()).toBe(
      "2026-03-11T00:00:00.000Z",
    );
    ctx = await createTestContext();
    const [e] = await ctx.db.insert(expirations).values({ kind: "dominio", name: "mexicanland.net", target: "mexicanland.net", notifyDays: 14 }).returning();
    const consultas = { dominio: async () => new Date("2026-03-11T12:00:00Z"), ssl: async () => new Date() };
    await revisarVencimiento(ctx.deps, e!, consultas);
    expect(ctx.notifier.sent.map((m) => m.title)).toEqual(["Mi Setup: mexicanland.net vence en 10 días"]);
    const [actualizado] = await ctx.db.select().from(expirations);
    await revisarVencimiento(ctx.deps, actualizado!, consultas);
    expect(ctx.notifier.sent).toHaveLength(1);
  });
});
