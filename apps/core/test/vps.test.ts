import { createServer, type Server } from "node:net";
import { eq } from "drizzle-orm";
import { Server as SshServer, utils } from "ssh2";
import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { vpsServers } from "../src/db/schema.js";
import { cpuEntreLecturas, probarTcp, revisarAlertas } from "../src/modules/vps/alertas.js";
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

    const siguiente = SALIDA.replace("cpu  1000 0 500 8000 500", "cpu  1600 0 900 8500 500").replace("eth0: 1000000", "eth0: 1300000");
    const segunda = parsearMetricas(siguiente, 4_000, primera.muestra);
    // Δtotal = 1500, Δocioso = 500 → 66.7 % de uso.
    expect(segunda.metricas.cpu).toBeCloseTo(66.67, 1);
    // 300 000 bytes en 3 s; "lo" no cuenta.
    expect(segunda.metricas.red?.rxBps).toBeCloseTo(100_000);
  });
});

describe("alertas de CPU", () => {
  it("calcula el uso de CPU entre dos lecturas de /proc/stat", () => {
    // 100 unidades de tiempo: 25 ociosas → 75 % de uso.
    expect(cpuEntreLecturas("cpu  100 0 100 700 100 0 0 0", "cpu  140 0 135 720 105 0 0 0")).toBeCloseTo(75);
    expect(cpuEntreLecturas("cpu 1 2", "basura")).toBeNull();
    expect(cpuEntreLecturas("cpu  1 1 1 1 1 0 0 0", "cpu  1 1 1 1 1 0 0 0")).toBeNull();
  });
});

describe("servidores VPS", () => {
  it("guarda credenciales cifradas y nunca las devuelve", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const llave = utils.generateKeyPairSync("ed25519").private;
    const cuerpoLlave = llave.split("\n")[2]!;
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/vps/servidores",
      headers: h,
      payload: { nombre: "Contabo", host: "203.0.113.10", usuario: "root", tipo: "llave", secreto: llave },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain(cuerpoLlave);
    expect(res.json()).toMatchObject({ nombre: "Contabo", esRoot: true, huella: null, tipo: "llave", conFrase: false });

    const lista = await ctx.app.inject({ method: "GET", url: "/api/vps/servidores", headers: h });
    expect(lista.body).not.toContain(cuerpoLlave);
    const [fila] = await ctx.db.select().from(vpsServers);
    expect(fila?.secretEnc).not.toContain(cuerpoLlave);
  });

  it("valida la llave privada antes de guardarla", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const crear = (secreto: string, frase?: string) =>
      ctx!.app.inject({
        method: "POST",
        url: "/api/vps/servidores",
        headers: h,
        payload: { nombre: "VPS", host: "203.0.113.10", usuario: "root", tipo: "llave", secreto, ...(frase !== undefined ? { frase } : {}) },
      });
    const par = utils.generateKeyPairSync("ed25519");
    const basura = await crear("-----BEGIN OPENSSH PRIVATE KEY-----\nno-es-una-llave\n-----END OPENSSH PRIVATE KEY-----");
    expect(basura.json()).toMatchObject({ codigo: "llave_invalida" });
    expect(basura.body).not.toContain("no-es-una-llave");
    expect((await crear(par.public)).json()).toMatchObject({ codigo: "llave_invalida", error: expect.stringContaining("pública") });
    expect((await crear("hola")).json()).toMatchObject({ codigo: "llave_invalida" });

    // Llave con frase: sin frase o con frase mala se rechaza; con la correcta se guarda.
    const cifrada = utils.generateKeyPairSync("ed25519", { passphrase: "frase-correcta", cipher: "aes256-ctr", rounds: 2 }).private;
    expect((await crear(cifrada)).json()).toMatchObject({ codigo: "llave_frase" });
    const mala = await crear(cifrada, "otra-frase");
    expect(mala.json()).toMatchObject({ codigo: "llave_frase" });
    expect(mala.body).not.toContain("otra-frase");
    const ok = await crear(cifrada.replace(/\n/g, "\r\n"), "frase-correcta");
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ conFrase: true });
    expect(ok.body).not.toContain("frase-correcta");
  });

  it("al editar conserva la llave si el campo va vacío y exige una nueva al cambiar de método", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const srv = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/vps/servidores",
        headers: h,
        payload: { nombre: "VPS", host: "203.0.113.10", usuario: "root", tipo: "password", secreto: "clave-vieja" },
      })
    ).json<{ id: string }>();
    const editar = (payload: Record<string, unknown>) => ctx!.app.inject({ method: "PATCH", url: `/api/vps/servidores/${srv.id}`, headers: h, payload });
    const [antes] = await ctx.db.select().from(vpsServers);

    expect((await editar({ tipo: "llave" })).statusCode).toBe(400);
    expect((await editar({ tipo: "llave", secreto: "no es llave" })).json()).toMatchObject({ codigo: "llave_invalida" });
    expect((await editar({ nombre: "VPS 2" })).statusCode).toBe(200);
    const [igual] = await ctx.db.select().from(vpsServers);
    expect(igual?.secretEnc).toBe(antes?.secretEnc);

    const llave = utils.generateKeyPairSync("ed25519").private;
    const cambio = await editar({ tipo: "llave", secreto: llave });
    expect(cambio.json()).toMatchObject({ tipo: "llave", conFrase: false });
    const [despues] = await ctx.db.select().from(vpsServers);
    expect(despues?.secretEnc).not.toBe(antes?.secretEnc);
  });

  it("Probar se conecta con la llave y explica si la rechazan", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const permitida = utils.generateKeyPairSync("ed25519");
    const publica = utils.parseKey(permitida.public);
    if (publica instanceof Error) throw publica;
    const ssh = new SshServer({ hostKeys: [utils.generateKeyPairSync("ed25519").private] }, (cliente) => {
      cliente.on("authentication", (a) => {
        if (a.method !== "publickey" || a.key.algo !== publica.type || !a.key.data.equals(publica.getPublicSSH())) return a.reject(["publickey"]);
        if (a.signature && publica.verify(a.blob!, a.signature, a.hashAlgo) !== true) return a.reject(["publickey"]);
        a.accept();
      });
      cliente.on("error", () => undefined);
    });
    await new Promise<void>((r) => ssh.listen(0, "127.0.0.1", r));
    try {
      const puerto = (ssh.address() as { port: number }).port;
      const crear = async (tipo: "llave" | "password", secreto: string) =>
        (
          await ctx!.app.inject({
            method: "POST",
            url: "/api/vps/servidores",
            headers: h,
            payload: { nombre: `VPS ${tipo} ${Math.random()}`, host: "127.0.0.1", puerto, usuario: "root", tipo, secreto },
          })
        ).json<{ id: string }>();
      const probar = async (id: string) => ctx!.app.inject({ method: "POST", url: `/api/vps/servidores/${id}/probar`, headers: h });

      const buena = await crear("llave", permitida.private);
      expect((await probar(buena.id)).json()).toMatchObject({ ok: true, huella: expect.stringMatching(/^SHA256:/) });

      const otra = await crear("llave", utils.generateKeyPairSync("ed25519").private);
      expect((await probar(otra.id)).json()).toMatchObject({ codigo: "ssh_rechazado", error: expect.stringContaining("rechazó la llave") });

      const conPassword = await crear("password", "una-clave");
      const r = await probar(conPassword.id);
      expect(r.json()).toMatchObject({ codigo: "ssh_rechazado", error: expect.stringContaining("Llave privada") });
      expect(r.body).not.toContain("una-clave");
    } finally {
      ssh.close();
    }
  });

  it("Probar dice claramente si no pudo conectar", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const srv = (
      await ctx.app.inject({
        method: "POST",
        url: "/api/vps/servidores",
        headers: h,
        payload: { nombre: "Apagado", host: "127.0.0.1", puerto: 1, usuario: "root", tipo: "llave", secreto: utils.generateKeyPairSync("ed25519").private },
      })
    ).json<{ id: string }>();
    const r = await ctx.app.inject({ method: "POST", url: `/api/vps/servidores/${srv.id}/probar`, headers: h });
    expect(r.json()).toMatchObject({ codigo: "ssh_error", error: expect.stringContaining("No se pudo conectar a Apagado") });
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
    const cmd = (await ctx.app.inject({ method: "POST", url: "/api/vps/comandos", headers: h, payload: { nombre: "Reiniciar VPS", comando: "sudo reboot" } })).json<{
      id: string;
      peligroso: boolean;
    }>();
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

  it("archivos: nunca borra ni mueve carpetas del sistema", async () => {
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
    const base = `/api/vps/servidores/${srv.id}/archivos`;
    for (const ruta of ["/", "/root", "/etc/", "/opt/mi-setup", "/var/lib/../lib"]) {
      const r = await ctx.app.inject({ method: "DELETE", url: `${base}?ruta=${encodeURIComponent(ruta)}`, headers: h, payload: {} });
      expect(r.statusCode, ruta).toBe(400);
    }
    const mover = await ctx.app.inject({ method: "POST", url: `${base}/renombrar`, headers: h, payload: { de: "/etc", a: "/etc2" } });
    expect(mover.statusCode).toBe(400);
    // Una ruta normal pasa las salvaguardas y llega a SSH (que aquí no existe).
    const normal = await ctx.app.inject({ method: "DELETE", url: `${base}?ruta=/root/viejo.log`, headers: h, payload: {} });
    expect(normal.json()).toMatchObject({ codigo: "ssh_error" });
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
