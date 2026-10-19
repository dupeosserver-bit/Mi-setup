import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import type { ClienteIa } from "../src/modules/ia/servicio.js";
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

const iaFalsa: ClienteIa = {
  async mensajes() {
    return {
      model: "claude-sonnet-5-5",
      stop_reason: "end_turn",
      content: [{ type: "text", text: '```html\n<h1>Pastelería Dulce</h1><button onclick="x()">Pedir</button><script>alert(1)</script>\n```\n```css\nh1{color:pink}\n```' }],
      usage: { input_tokens: 10, output_tokens: 20 },
    };
  },
};

async function preparar() {
  dir = await mkdtemp(join(tmpdir(), "sitios-"));
  ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir }), clienteIa: iaFalsa });
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { sitios: "escritura" } as never });
  await seedUser(ctx.db, { email: "primo@x.test", password: "clave-de-prueba-123", permissions: { sitios: "escritura" } as never });
  const login = async (email: string) =>
    bearer((await ctx!.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken);
  return { h: await login("u@x.test"), primo: await login("primo@x.test") };
}
const host = (h: string) => ({ host: h });

describe("sitios", () => {
  it("crear, publicar y verlo en su dominio", async () => {
    const { h } = await preparar();
    const app = ctx!.app;
    expect((await app.inject({ method: "POST", url: "/api/sitios", headers: h, payload: { nombre: "X", slug: "setup" } })).statusCode).toBe(400);
    const s = (await app.inject({ method: "POST", url: "/api/sitios", headers: h, payload: { nombre: "Pastelería", slug: "pasteleria" } })).json<{ id: string; url: string }>();
    expect((await app.inject({ method: "GET", url: "/", headers: host("pasteleria.mexicanland.net") })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/sitios/tls?domain=pasteleria.mexicanland.net" })).statusCode).toBe(404);
    const pub = await app.inject({
      method: "POST",
      url: `/api/sitios/${s.id}/publicar`,
      headers: h,
      payload: { paginas: [{ ruta: "/", titulo: "Inicio", html: "<h1>Hola</h1>", css: "h1{color:red}" }, { ruta: "/socios", titulo: "Socios", html: "<p>secreto</p>", css: "", privada: true }] },
    });
    expect(pub.statusCode).toBe(200);
    const inicio = await app.inject({ method: "GET", url: "/", headers: host("pasteleria.mexicanland.net") });
    expect(inicio.statusCode).toBe(200);
    expect(inicio.body).toContain("<h1>Hola</h1>");
    expect(inicio.body).toContain("h1{color:red}");
    expect(inicio.headers["content-security-policy"]).toContain("frame-ancestors *");
    expect((await app.inject({ method: "GET", url: "/api/sitios/tls?domain=pasteleria.mexicanland.net" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/__sitio/", headers: host("setup.mexicanland.net") })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/_ms/runtime.js", headers: host("pasteleria.mexicanland.net") })).body).toContain("__MS");
    expect((await app.inject({ method: "GET", url: "/sitemap.xml", headers: host("pasteleria.mexicanland.net") })).body).not.toContain("/socios");

    expect((await app.inject({ method: "GET", url: "/socios", headers: host("pasteleria.mexicanland.net") })).statusCode).toBe(401);
    await app.inject({ method: "POST", url: `/api/sitios/${s.id}/cuentas`, headers: h, payload: { correo: "cliente@x.test", nombre: "Ana", clave: "clave-larga-1" } });
    const entrar = await app.inject({ method: "POST", url: "/_ms/entrar", headers: host("pasteleria.mexicanland.net"), payload: { correo: "cliente@x.test", clave: "clave-larga-1" } });
    expect(entrar.statusCode).toBe(200);
    const cookie = String(entrar.headers["set-cookie"]).split(";")[0]!;
    const privada = await app.inject({ method: "GET", url: "/socios", headers: { ...host("pasteleria.mexicanland.net"), cookie } });
    expect(privada.body).toContain("secreto");
    expect((await app.inject({ method: "POST", url: "/_ms/entrar", headers: host("pasteleria.mexicanland.net"), payload: { correo: "cliente@x.test", clave: "mala" } })).statusCode).toBe(401);
  });

  it("formularios, pedidos, tablas, estadísticas y exportar", async () => {
    const { h } = await preparar();
    const app = ctx!.app;
    const s = (await app.inject({ method: "POST", url: "/api/sitios", headers: h, payload: { nombre: "Tienda", slug: "tienda" } })).json<{ id: string }>();
    await app.inject({ method: "POST", url: `/api/sitios/${s.id}/publicar`, headers: h, payload: { paginas: [{ ruta: "/", html: "<p>x</p>", css: "" }] } });
    const H = host("tienda.mexicanland.net");
    expect((await app.inject({ method: "POST", url: "/_ms/formulario", headers: H, payload: { formulario: "contacto", datos: { nombre: "Luis", mensaje: "Hola" } } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/_ms/pedido", headers: H, payload: { items: [{ nombre: "Pastel", precio: 350, cantidad: 2 }], cliente: { nombre: "Eva" } } })).statusCode).toBe(200);
    const entradas = (await app.inject({ method: "GET", url: `/api/sitios/${s.id}/entradas`, headers: h })).json<{ tipo: string; datos: { total?: number } }[]>();
    expect(entradas.map((e) => e.tipo).sort()).toEqual(["formulario", "pedido"]);
    expect(entradas.find((e) => e.tipo === "pedido")?.datos.total).toBe(700);
    await app.inject({
      method: "PUT",
      url: `/api/sitios/${s.id}/tablas/productos`,
      headers: h,
      payload: { columnas: [{ nombre: "nombre", tipo: "texto" }, { nombre: "precio", tipo: "numero" }], filas: [{ nombre: "Pastel", precio: 350 }] },
    });
    expect((await app.inject({ method: "GET", url: "/_ms/datos/productos", headers: H })).json()).toEqual({ filas: [{ nombre: "Pastel", precio: 350 }] });
    await app.inject({ method: "POST", url: "/_ms/evento", headers: H, payload: { tipo: "visita", clave: "/", ref: "google.com" } });
    await app.inject({ method: "POST", url: "/_ms/evento", headers: H, payload: { tipo: "visita", clave: "/" } });
    await app.inject({ method: "POST", url: "/_ms/evento", headers: H, payload: { tipo: "clic", clave: "Pedir por WhatsApp" } });
    const est = (await app.inject({ method: "GET", url: `/api/sitios/${s.id}/estadisticas?dias=7`, headers: h })).json<{ total: number; clics: { clave: string }[]; origenes: { clave: string }[] }>();
    expect(est.total).toBe(2);
    expect(est.clics[0]?.clave).toBe("Pedir por WhatsApp");
    expect(est.origenes[0]?.clave).toBe("google.com");
    const zip = await app.inject({ method: "GET", url: `/api/sitios/${s.id}/exportar`, headers: h });
    const archivos = Object.keys(unzipSync(new Uint8Array(zip.rawPayload)));
    expect(archivos).toContain("index.html");
    expect(archivos).toContain("_ms/runtime.js");
  });

  it("compartir edición, IA y dominio propio", async () => {
    const { h, primo } = await preparar();
    const app = ctx!.app;
    const s = (await app.inject({ method: "POST", url: "/api/sitios", headers: h, payload: { nombre: "Mi sitio", slug: "misitio" } })).json<{ id: string }>();
    expect((await app.inject({ method: "GET", url: `/api/sitios/${s.id}`, headers: primo })).statusCode).toBe(403);
    await app.inject({ method: "POST", url: `/api/sitios/${s.id}/editores`, headers: h, payload: { correo: "primo@x.test" } });
    expect((await app.inject({ method: "GET", url: `/api/sitios/${s.id}`, headers: primo })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/sitios/${s.id}/editores`, headers: primo, payload: { correo: "u@x.test" } })).statusCode).toBe(403);
    const ia = (await app.inject({ method: "POST", url: "/api/sitios/ia", headers: h, payload: { descripcion: "pastelería rosa" } })).json<{ html: string; css: string }>();
    expect(ia.html).toContain("Pastelería Dulce");
    expect(ia.html).not.toContain("<script");
    expect(ia.html).not.toContain("onclick");
    expect(ia.css).toContain("pink");
    expect((await app.inject({ method: "PUT", url: `/api/sitios/${s.id}/ajustes`, headers: h, payload: { dominio: "otro.mexicanland.net" } })).statusCode).toBe(400);
    await app.inject({ method: "PUT", url: `/api/sitios/${s.id}/ajustes`, headers: h, payload: { dominio: "pasteleriadulce.com" } });
    await app.inject({ method: "POST", url: `/api/sitios/${s.id}/publicar`, headers: h, payload: { paginas: [{ ruta: "/", html: "<p>Dominio propio</p>", css: "" }] } });
    expect((await app.inject({ method: "GET", url: "/", headers: host("pasteleriadulce.com") })).body).toContain("Dominio propio");
    expect((await app.inject({ method: "GET", url: "/api/sitios/tls?domain=pasteleriadulce.com" })).statusCode).toBe(200);
  });
});
