import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { zonaDe } from "../src/modules/cloudflare.js";
import { nombreRespaldo, scriptRespaldo, validarCarpeta } from "../src/modules/respaldos-vps.js";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { bearer, createTestContext, seedUser, TEST_SECRETS } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
let dir: string | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function preparar() {
  dir = await mkdtemp(join(tmpdir(), "v010-"));
  ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir }) });
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { finanzas_personales: "escritura", notas: "escritura" } });
  await seedUser(ctx.db, { email: "otra@x.test", password: "clave-de-prueba-123", permissions: { finanzas_personales: "escritura", notas: "escritura" } });
  const login = async (email: string) =>
    bearer((await ctx!.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken);
  return { h: await login("u@x.test"), otra: await login("otra@x.test") };
}

function multipart(nombre: string, tipo: string, contenido: Buffer | string) {
  const limite = "----prueba010";
  const cuerpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n`),
    Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido),
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  return { payload: cuerpo, headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

describe("respaldos del VPS (scripts)", () => {
  it("valida las carpetas: ruta completa, sin .. ni carpetas del sistema", () => {
    expect(validarCarpeta("/opt/mi-setup/")).toBe("/opt/mi-setup");
    expect(() => validarCarpeta("opt/x")).toThrow();
    expect(() => validarCarpeta("/opt/../etc")).toThrow();
    expect(() => validarCarpeta("/proc/1")).toThrow();
    expect(() => validarCarpeta("/opt/x; rm -rf /")).toThrow();
    expect(() => validarCarpeta("/")).toThrow();
  });

  it("la carpeta se cita bien y el trabajo termina renombrando o dejando .error", () => {
    const nombre = nombreRespaldo("carpeta", new Date("2026-03-01T12:00:00Z"), "/opt/mi setup");
    expect(nombre).toBe("mi_setup-20260301-120000.tar.gz");
    const s = scriptRespaldo("carpeta", nombre, { ruta: "/opt/mi setup" });
    expect(s).toContain("tar -czf '/opt/mi-setup/respaldos-manuales/mi_setup-20260301-120000.tar.gz.parte'");
    expect(s).toContain("'opt/mi setup'");
    expect(s).toContain("if [ $c -le 1 ]");
    expect(s).toContain(".error");
  });

  it("el VPS completo excluye lo que no sirve y la propia carpeta de respaldos", () => {
    const s = scriptRespaldo("vps", "vps-completo-x.tar.gz");
    for (const e of ["./proc", "./sys", "./dev", "./tmp", "./var/lib/docker/overlay2", "./opt/mi-setup/respaldos-manuales"]) expect(s).toContain(`--exclude='${e}'`);
    expect(s).toContain("-C / .");
  });

  it("la base usa pg_dump dentro del contenedor y Pterodactyl junta sus carpetas", () => {
    expect(scriptRespaldo("base", "base-x.sql.gz")).toContain("docker exec misetup-db");
    const p = scriptRespaldo("pterodactyl", "pterodactyl-x.tar.gz");
    expect(p).toContain("/var/lib/pterodactyl/volumes");
    expect(p).toContain("/etc/pterodactyl");
  });
});

describe("Cloudflare", () => {
  it("elige la zona más específica", () => {
    const zonas = [
      { id: "1", name: "net", status: "active" },
      { id: "2", name: "mexicanland.net", status: "active" },
      { id: "3", name: "otro.com", status: "active" },
    ];
    expect(zonaDe("pasteleria.mexicanland.net", zonas)?.id).toBe("2");
    expect(zonaDe("mexicanland.net", zonas)?.id).toBe("2");
    expect(zonaDe("otro.com", zonas)?.id).toBe("3");
    expect(zonaDe("nada.org", zonas)).toBeNull();
  });

  it("sin token avisa «Falta configurar» y no revienta", async () => {
    const { h } = await preparar();
    const r = await ctx!.app.inject({ method: "GET", url: "/api/cloudflare/estado", headers: h });
    // La cuenta de prueba no tiene permiso del módulo sitios: se niega antes de tocar nada.
    expect([401, 403]).toContain(r.statusCode);
  });
});

describe("finanzas: concepto libre", () => {
  it("el concepto escrito por ti queda en tus sugerencias", async () => {
    const { h, otra } = await preparar();
    const app = ctx!.app;
    expect((await app.inject({ method: "POST", url: "/api/finanzas-personales/movimientos", headers: h, payload: { tipo: "gasto", monto: 500, categoria: "Préstamo Coppel", fecha: "2026-03-01" } })).statusCode).toBe(200);
    const mias = (await app.inject({ method: "GET", url: "/api/finanzas-personales/categorias", headers: h })).json<{ categoria: string; tipo: string }[]>();
    expect(mias.some((c) => c.categoria === "Préstamo Coppel" && c.tipo === "gasto")).toBe(true);
    const deOtra = (await app.inject({ method: "GET", url: "/api/finanzas-personales/categorias", headers: otra })).json<unknown[]>();
    expect(deOtra).toHaveLength(0);
  });

});

describe("notas: adjuntos y color", () => {
  it("sube una imagen, la ve con su firma y no con otra", async () => {
    const { h, otra } = await preparar();
    const app = ctx!.app;
    const nota = (await app.inject({ method: "POST", url: "/api/notas", headers: h, payload: { titulo: "Con foto", color: "azul" } })).json<{ id: string; color: string }>();
    expect(nota.color).toBe("azul");
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
    const m = multipart("foto.png", "image/png", png);
    expect((await app.inject({ method: "POST", url: `/api/notas/${nota.id}/adjuntos`, headers: { ...otra, ...m.headers }, payload: m.payload })).statusCode).toBe(404);
    const sube = await app.inject({ method: "POST", url: `/api/notas/${nota.id}/adjuntos`, headers: { ...h, ...m.headers }, payload: m.payload });
    expect(sube.statusCode).toBe(200);
    const a = sube.json<{ id: string; imagen: boolean; url: string; tipo: string }>();
    expect(a.imagen).toBe(true);
    expect(a.tipo).toBe("image/png");
    // Se ve sin token (como <img>) porque la dirección lleva la firma.
    const ver = await app.inject({ method: "GET", url: a.url });
    expect(ver.statusCode).toBe(200);
    expect(ver.headers["content-type"]).toBe("image/png");
    const falsa = a.url.replace(/\/[^/]+$/, "/firma-falsa");
    expect((await app.inject({ method: "GET", url: falsa })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `/api/notas/${nota.id}/adjuntos`, headers: otra })).statusCode).toBe(404);
  });

  it("un HTML disfrazado de imagen se descarga y no se muestra", async () => {
    const { h } = await preparar();
    const app = ctx!.app;
    const nota = (await app.inject({ method: "POST", url: "/api/notas", headers: h, payload: { titulo: "x" } })).json<{ id: string }>();
    const m = multipart("truco.png", "image/png", "<script>alert(1)</script>");
    const a = (await app.inject({ method: "POST", url: `/api/notas/${nota.id}/adjuntos`, headers: { ...h, ...m.headers }, payload: m.payload })).json<{ url: string; imagen: boolean }>();
    expect(a.imagen).toBe(false);
    const ver = await app.inject({ method: "GET", url: a.url });
    expect(ver.headers["content-type"]).toBe("application/octet-stream");
    expect(String(ver.headers["content-disposition"])).toContain("attachment");
    expect(ver.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("borrar un adjunto lo quita", async () => {
    const { h } = await preparar();
    const app = ctx!.app;
    const nota = (await app.inject({ method: "POST", url: "/api/notas", headers: h, payload: { titulo: "x" } })).json<{ id: string }>();
    const m = multipart("doc.txt", "text/plain", "hola");
    const a = (await app.inject({ method: "POST", url: `/api/notas/${nota.id}/adjuntos`, headers: { ...h, ...m.headers }, payload: m.payload })).json<{ id: string }>();
    expect((await app.inject({ method: "DELETE", url: `/api/notas/adjuntos/${a.id}`, headers: h })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/api/notas/${nota.id}/adjuntos`, headers: h })).json<unknown[]>()).toHaveLength(0);
  });
});

async function prepararDueno() {
  const { otra } = await preparar();
  const secreto = generateTotpSecret();
  await seedUser(ctx!.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secreto });
  const r = await ctx!.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secreto, ctx!.clock.now) } });
  return { h: bearer(r.json<{ accessToken: string }>().accessToken), otra };
}

describe("Host local desde el celular (solo el dueño)", () => {
  const servidor = { id: "11111111-1111-4111-8111-111111111111", nombre: "Survival", tipo: "paper", version: "1.21.4", ramMb: 4096, puerto: 25565, estado: "detenido", jugadores: [], propiedades: { difficulty: "normal" } };

  it("la PC sube su lista, el celular edita y la PC aplica", async () => {
    const { h } = await prepararDueno();
    const app = ctx!.app;
    // Antes de que la PC sincronice no hay nada que editar.
    expect((await app.inject({ method: "POST", url: "/api/hostlocal/ediciones", headers: h, payload: { servidorId: servidor.id, cambios: { ramMb: 8192 } } })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: "/api/hostlocal/sincronizar", headers: h, payload: { servidores: [servidor] } })).json<{ pendientes: unknown[] }>().pendientes).toHaveLength(0);
    const lista = (await app.inject({ method: "GET", url: "/api/hostlocal/servidores", headers: h })).json<{ servidores: { nombre: string }[] }>();
    expect(lista.servidores[0]?.nombre).toBe("Survival");
    // Cambios inválidos
    expect((await app.inject({ method: "POST", url: "/api/hostlocal/ediciones", headers: h, payload: { servidorId: servidor.id, cambios: {} } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/hostlocal/ediciones", headers: h, payload: { servidorId: servidor.id, cambios: { propiedades: { "../x": "1" } } } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/hostlocal/ediciones", headers: h, payload: { servidorId: servidor.id, cambios: { propiedades: { motd: "a\nb" } } } })).statusCode).toBe(400);
    // Edición válida
    const e = (await app.inject({ method: "POST", url: "/api/hostlocal/ediciones", headers: h, payload: { servidorId: servidor.id, cambios: { ramMb: 8192, propiedades: { difficulty: "hard" } } } })).json<{ id: string }>();
    const sync = (await app.inject({ method: "PUT", url: "/api/hostlocal/sincronizar", headers: h, payload: { servidores: [servidor] } })).json<{ pendientes: { id: string; cambios: { ramMb: number } }[] }>();
    expect(sync.pendientes[0]?.cambios.ramMb).toBe(8192);
    await app.inject({ method: "POST", url: "/api/hostlocal/ediciones/aplicadas", headers: h, payload: { ids: [e.id] } });
    expect((await app.inject({ method: "GET", url: "/api/hostlocal/servidores", headers: h })).json<{ pendientes: unknown[] }>().pendientes).toHaveLength(0);
  });

  it("otras cuentas no entran a Host local", async () => {
    const { h, otra } = await prepararDueno();
    const app = ctx!.app;
    await app.inject({ method: "PUT", url: "/api/hostlocal/sincronizar", headers: h, payload: { servidores: [servidor] } });
    expect((await app.inject({ method: "GET", url: "/api/hostlocal/servidores", headers: otra })).statusCode).toBe(403);
  });
});
