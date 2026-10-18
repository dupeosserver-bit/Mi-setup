import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
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
  dir = await mkdtemp(join(tmpdir(), "archivos-"));
  ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir }) });
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { enlaces: "escritura", compartir: "escritura", portapapeles: "escritura" } as never });
  const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } });
  return bearer(r.json<{ accessToken: string }>().accessToken);
}

/** Cuerpo multipart con un archivo (sin dependencias extra). */
function multipart(nombre: string, contenido: string) {
  const limite = "----limite123";
  const cuerpo = `--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: text/plain\r\n\r\n${contenido}\r\n--${limite}--\r\n`;
  return { payload: cuerpo, headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

describe("enlaces cortos", () => {
  it("crea, redirige contando clics y se puede desactivar", async () => {
    const h = await preparar();
    const app = ctx!.app;
    const nuevo = await app.inject({ method: "POST", url: "/api/enlaces", headers: h, payload: { destino: "https://instagram.com/pasteleria", codigo: "pasteles" } });
    expect(nuevo.statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/enlaces", headers: h, payload: { destino: "https://x.com", codigo: "pasteles" } })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: "/api/enlaces", headers: h, payload: { destino: "javascript:alert(1)" } })).statusCode).toBe(400);

    const ir = await app.inject({ method: "GET", url: "/l/pasteles" });
    expect(ir.statusCode).toBe(302);
    expect(ir.headers.location).toBe("https://instagram.com/pasteleria");
    const lista = (await app.inject({ method: "GET", url: "/api/enlaces", headers: h })).json<{ id: string; clics: number }[]>();
    expect(lista[0]?.clics).toBe(1);

    await app.inject({ method: "PATCH", url: `/api/enlaces/${lista[0]!.id}`, headers: h, payload: { activo: false } });
    expect((await app.inject({ method: "GET", url: "/l/pasteles" })).statusCode).toBe(404);
  });
});

describe("compartir archivos", () => {
  it("con contraseña y límite de descargas", async () => {
    const h = await preparar();
    const app = ctx!.app;
    const m = multipart("receta.txt", "harina y azúcar");
    const subida = await app.inject({ method: "POST", url: "/api/compartir?clave=secreta&limite=1", headers: { ...h, ...m.headers }, payload: m.payload });
    expect(subida.statusCode).toBe(200);
    const { codigo } = subida.json<{ codigo: string }>();

    const pagina = await app.inject({ method: "GET", url: `/s/${codigo}` });
    expect(pagina.body).toContain("receta.txt");
    expect(pagina.body).toContain("Contraseña");
    // Con contraseña no se puede bajar directo.
    expect((await app.inject({ method: "GET", url: `/s/${codigo}/archivo` })).statusCode).toBe(404);

    const mala = await app.inject({ method: "POST", url: `/s/${codigo}`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "clave=otra" });
    expect(mala.statusCode).toBe(401);
    const buena = await app.inject({ method: "POST", url: `/s/${codigo}`, headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "clave=secreta" });
    expect(buena.statusCode).toBe(200);
    expect(buena.body).toBe("harina y azúcar");
    expect(buena.headers["content-disposition"]).toContain("receta.txt");
    // Límite de 1 descarga: ya no está disponible.
    expect((await app.inject({ method: "GET", url: `/s/${codigo}` })).statusCode).toBe(404);
  });
});

describe("portapapeles", () => {
  it("guarda y lista lo que envías", async () => {
    const h = await preparar();
    const app = ctx!.app;
    await app.inject({ method: "POST", url: "/api/portapapeles", headers: h, payload: { contenido: "hola desde la PC", equipo: "PC" } });
    const lista = (await app.inject({ method: "GET", url: "/api/portapapeles", headers: h })).json<{ contenido: string }[]>();
    expect(lista[0]?.contenido).toBe("hola desde la PC");
  });
});

describe("vista previa HTML", () => {
  it("es una página aislada que se puede incrustar", async () => {
    ctx = await createTestContext();
    const r = await ctx.app.inject({ method: "GET", url: "/vista-previa" });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-security-policy"]).toContain("script-src 'unsafe-inline'");
    expect(r.headers["x-frame-options"]).toBeUndefined();
  });
});
