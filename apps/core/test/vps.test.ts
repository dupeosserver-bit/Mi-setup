import { createServer, type Server } from "node:net";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { vpsServers } from "../src/db/schema.js";
import { probarTcp, revisarAlertas } from "../src/modules/vps/alertas.js";
import { comandoEstado, comandoReinicio, interpretarEstado } from "../src/modules/vps/bots.js";
import { parsearMetricas } from "../src/modules/vps/parse.js";
import { Servidores } from "../src/modules/vps/servidores.js";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
let servidorTcp: Server | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
  servidorTcp?.close();
  servidorTcp = undefined;
});

const SALIDA = `cpu  1000 0 500 8000 500 0 0 0 0 0
---
MemTotal:        8000000 kB
MemFree:         1000000 kB
MemAvailable:    2000000 kB
SwapTotal:       1000000 kB
SwapFree:         750000 kB
---
Filesystem     1-blocks        Used   Available Capacity Mounted on
/dev/sda1   100000000000 60000000000 40000000000      60% /
---
Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 999999 10 0 0 0 0 0 0 999999 10 0 0 0 0 0 0
  eth0: 1000000 100 0 0 0 0 0 0 500000 80 0 0 0 0 0 0
---
0.50 0.40 0.30 1/200 12345
---
86400.25 170000.00`;

async function maestra(c: Ctx) {
  const secret = generateTotpSecret();
  await seedUser(c.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secret });
  const res = await c.app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secret, c.clock.now) },
  });
  return bearer(res.json<{ accessToken: string }>().accessToken);
}

describe("lectura de métricas del VPS", () => {
  it("interpreta /proc, df y calcula CPU y red por diferencia", () => {
    const primera = parsearMetricas(SALIDA, 1_000, null);
    expect(primera.metricas.ram).toEqual({ usado: 6_000_000 * 1024, total: 8_000_000 * 1024 });
    expect(primera.metricas.swap.usado).toBe(250_000 * 1024);
    expect(primera.metricas.discos).toEqual([{ nombre: "/", usado: 60_000_000_000, total: 100_000_000_000 }]);
    expect(primera.metricas.carga).toEqual([0.5, 0.4, 0.3]);
    expect(primera.metricas.uptime).toBeCloseTo(86400.25);
    expect(primera.metricas.cpu).toBeUndefined();

    const siguiente = SALIDA.replace("cpu  1000 0 500 8000 500", "cpu  1600 0 900 8500 500").replace(
      "eth0: 1000000",
      "eth0: 1300000",
    );
    const segunda = parsearMetricas(siguiente, 4_000, primera.muestra);
    // Δtotal = 1500, Δocioso = 500 → 66.7 % de uso.
    expect(segunda.metricas.cpu).toBeCloseTo(66.67, 1);
    // 300 000 bytes en 3 s; "lo" no cuenta.
    expect(segunda.metricas.red?.rxBps).toBeCloseTo(100_000);
  });
});

describe("servidores VPS", () => {
  it("guarda credenciales cifradas y nunca las devuelve", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const llave = "-----BEGIN OPENSSH PRIVATE KEY-----\nsecreto-de-prueba\n-----END OPENSSH PRIVATE KEY-----";
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/vps/servidores",
      headers: h,
      payload: { nombre: "Contabo", host: "203.0.113.10", usuario: "root", tipo: "llave", secreto: llave },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain("secreto-de-prueba");
    expect(res.json()).toMatchObject({ nombre: "Contabo", esRoot: true, huella: null });

    const lista = await ctx.app.inject({ method: "GET", url: "/api/vps/servidores", headers: h });
    expect(lista.body).not.toContain("secreto-de-prueba");
    const [fila] = await ctx.db.select().from(vpsServers);
    expect(fila?.secretEnc).not.toContain("secreto-de-prueba");
  });

  it("un comando peligroso exige reautenticación fuerte y doble confirmación", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const srv = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/vps/servidores",
        headers: h,
        payload: { nombre: "Local", host: "127.0.0.1", puerto: 1, usuario: "deploy", tipo: "password", secreto: "x" },
      })
    ).json<{ id: string }>();
    const cmd = (
      await ctx.app.inject({ method: "POST", url: "/api/vps/comandos", headers: h, payload: { nombre: "Reiniciar VPS", comando: "sudo reboot" } })
    ).json<{ id: string; peligroso: boolean }>();
    expect(cmd.peligroso).toBe(true);

    const ejecutar = (payload: Record<string, unknown>) =>
      ctx!.app.inject({ method: "POST", url: `/api/vps/comandos/${cmd.id}/ejecutar`, headers: h, payload: { servidorId: srv.id, ...payload } });

    expect((await ejecutar({})).json()).toMatchObject({ codigo: "doble_confirmacion" });
    expect((await ejecutar({ confirmacion: "otra cosa" })).statusCode).toBe(400);
    // Con la confirmación correcta pasa las salvaguardas y llega a SSH (que aquí no existe).
    expect((await ejecutar({ confirmacion: "Reiniciar VPS" })).json()).toMatchObject({ codigo: "ssh_error" });

    ctx.advance(6 * 60_000);
    expect((await ejecutar({ confirmacion: "Reiniciar VPS" })).json()).toMatchObject({ codigo: "reauth_requerida" });
  });
});

describe("alertas de caída", () => {
  it("detecta caída y regreso por TCP y avisa por push solo en los cambios", async () => {
    servidorTcp = createServer((s) => s.end());
    await new Promise<void>((r) => servidorTcp!.listen(0, "127.0.0.1", () => r()));
    const puerto = (servidorTcp.address() as { port: number }).port;
    expect((await probarTcp("127.0.0.1", puerto)).arriba).toBe(true);

    ctx = await createTestContext();
    await ctx.db.insert(vpsServers).values({ name: "VPS", host: "127.0.0.1", port: puerto, username: "u", authType: "password", secretEnc: "x" });
    const servidores = new Servidores(ctx.deps);

    await revisarAlertas(ctx.deps, servidores);
    expect((await ctx.db.select().from(vpsServers))[0]?.status).toBe("arriba");
    expect(ctx.notifier.sent).toHaveLength(0);

    await new Promise<void>((r) => servidorTcp!.close(() => r()));
    await revisarAlertas(ctx.deps, servidores);
    expect(ctx.notifier.sent.map((m) => m.title)).toEqual(["Mi Setup: VPS no responde"]);

    await revisarAlertas(ctx.deps, servidores);
    expect(ctx.notifier.sent).toHaveLength(1);
    await ctx.db.update(vpsServers).set({ alerts: false }).where(eq(vpsServers.name, "VPS"));
  });
});

describe("bots de Discord", () => {
  it("arma comandos seguros y entiende el estado", () => {
    expect(comandoReinicio("systemd", "mi-bot", false)).toBe("sudo -n systemctl restart 'mi-bot'");
    expect(comandoReinicio("pm2", "bot.js", true)).toBe("pm2 restart 'bot.js'");
    expect(comandoEstado("docker", "bot", true)).toBe("docker inspect -f '{{.State.Status}}' 'bot'");
    expect(interpretarEstado("pm2", "bot", JSON.stringify([{ name: "bot", pm2_env: { status: "online" } }]))).toBe("online");
    expect(interpretarEstado("systemd", "bot", "inactive\n")).toBe("inactive");
  });
});
