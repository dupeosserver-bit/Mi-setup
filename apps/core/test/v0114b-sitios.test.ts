import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { paginaEstado } from "../src/modules/sitios/publico.js";
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

const host = { host: "panaderia.mexicanland.net" };

async function preparar() {
  dir = await mkdtemp(join(tmpdir(), "sitios-estado-"));
  ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir }) });
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { sitios: "escritura" } as never });
  const login = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } });
  const h = bearer(login.json<{ accessToken: string }>().accessToken);
  const s = (await ctx.app.inject({ method: "POST", url: "/api/sitios", headers: h, payload: { nombre: "Panadería", slug: "panaderia" } })).json<{ id: string }>();
  await ctx.app.inject({ method: "POST", url: `/api/sitios/${s.id}/publicar`, headers: h, payload: { paginas: [{ ruta: "/", titulo: "Inicio", html: "<h1>Pan</h1>", css: "" }] } });
  return { h, id: s.id, app: ctx.app };
}

describe("0.11.4b sitios: mantenimiento, cerrado e ícono", () => {
  it("en mantenimiento muestra «Volvemos pronto» y no recibe formularios; cerrado no se borra y se puede volver a abrir", async () => {
    const { h, id, app } = await preparar();
    expect((await app.inject({ method: "GET", url: "/", headers: host })).body).toContain("<h1>Pan</h1>");

    const m = await app.inject({ method: "PUT", url: `/api/sitios/${id}/ajustes`, headers: h, payload: { ajustes: { estado: "mantenimiento", mantenimiento: { mensaje: "Horneando mejoras", regreso: "lunes 9 a. m." } } } });
    expect(m.statusCode).toBe(200);
    const pagina = await app.inject({ method: "GET", url: "/", headers: host });
    expect(pagina.statusCode).toBe(503);
    expect(pagina.headers["retry-after"]).toBe("3600");
    expect(pagina.body).toContain("Volvemos pronto");
    expect(pagina.body).toContain("Horneando mejoras");
    expect(pagina.body).toContain("lunes 9 a. m.");
    expect(pagina.body).not.toContain("<h1>Pan</h1>");
    expect((await app.inject({ method: "POST", url: "/_ms/formulario", headers: host, payload: { datos: { nombre: "Ana" } } })).statusCode).toBe(503);

    await app.inject({ method: "PUT", url: `/api/sitios/${id}/ajustes`, headers: h, payload: { ajustes: { estado: "cerrado" } } });
    const cerrado = await app.inject({ method: "GET", url: "/", headers: host });
    expect(cerrado.statusCode).toBe(410);
    expect(cerrado.body).toContain("cerrado");
    const lista = (await app.inject({ method: "GET", url: "/api/sitios", headers: h })).json<{ id: string }[]>();
    expect(lista.some((s) => s.id === id)).toBe(true);

    await app.inject({ method: "PUT", url: `/api/sitios/${id}/ajustes`, headers: h, payload: { ajustes: { estado: "abierto" } } });
    const abierto = await app.inject({ method: "GET", url: "/", headers: host });
    expect(abierto.statusCode).toBe(200);
    expect(abierto.body).toContain("<h1>Pan</h1>");
    expect((await app.inject({ method: "POST", url: "/_ms/formulario", headers: host, payload: { datos: { nombre: "Ana" } } })).statusCode).toBe(200);

    expect((await app.inject({ method: "PUT", url: `/api/sitios/${id}/ajustes`, headers: h, payload: { ajustes: { estado: "borrado" } } })).statusCode).toBe(400);
  });

  it("el texto del aviso se escapa y el ícono con IA pide la clave de Gemini", async () => {
    const aviso = paginaEstado({ name: "X", settings: { estado: "mantenimiento", mantenimiento: { mensaje: "<script>alert(1)</script>" } } });
    expect(aviso?.codigo).toBe(503);
    expect(aviso?.html).not.toContain("<script>alert(1)</script>");
    expect(paginaEstado({ name: "X", settings: {} })).toBeNull();

    const { h, id, app } = await preparar();
    const r = await app.inject({ method: "POST", url: `/api/sitios/${id}/icono-ia`, headers: h, payload: { idea: "un pan" } });
    expect(r.statusCode).toBeGreaterThanOrEqual(400);
    expect(r.body).toContain("GEMINI_API_KEY");
  });
});
