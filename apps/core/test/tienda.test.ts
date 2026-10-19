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

const PASS = "clave-de-prueba-123";

async function preparar(permisos: Record<string, string>) {
  dir = await mkdtemp(join(tmpdir(), "tienda-"));
  ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir }) });
  await seedUser(ctx.db, { email: "u@x.test", password: PASS, permissions: permisos as never });
  const t = (await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: PASS } })).json<{ accessToken: string }>().accessToken;
  return bearer(t);
}

const plantilla = {
  html: "<div data-ms-tabla=\"planes\"><div data-ms-plantilla data-ms-producto><h3 data-campo=\"nombre\"></h3></div></div>",
  css: "",
  tablas: [{ nombre: "planes", columnas: [{ nombre: "nombre", tipo: "texto" }, { nombre: "precio", tipo: "numero" }], filas: [{ nombre: "Pro", precio: 199 }] }],
};

describe("tienda de hosting en Sitios", () => {
  it("la plantilla crea el sitio con su tabla de planes y el pedido se vuelve cliente con cobro", async () => {
    const h = await preparar({ sitios: "escritura", clientes: "escritura" });
    const app = ctx!.app;
    const s = (await app.inject({ method: "POST", url: "/api/sitios", headers: h, payload: { nombre: "Mi hosting", slug: "mihosting", plantilla } })).json<{ id: string }>();
    const tablas = (await app.inject({ method: "GET", url: `/api/sitios/${s.id}/tablas`, headers: h })).json<{ nombre: string; filas: { nombre: string }[] }[]>();
    expect(tablas[0]?.nombre).toBe("planes");
    expect(tablas[0]?.filas[0]?.nombre).toBe("Pro");

    await app.inject({ method: "PUT", url: `/api/sitios/${s.id}/ajustes`, headers: h, payload: { ajustes: { pago: "Transferencia a la CLABE 000", moneda: "MXN" } } });
    await app.inject({ method: "POST", url: `/api/sitios/${s.id}/publicar`, headers: h, payload: { paginas: [{ ruta: "/", html: "<p>x</p>", css: "" }] } });
    const pagina = await app.inject({ method: "GET", url: "/", headers: { host: "mihosting.mexicanland.net" } });
    expect(pagina.body).toContain("Transferencia a la CLABE 000");

    const pedido = await app.inject({
      method: "POST",
      url: "/_ms/pedido",
      headers: { host: "mihosting.mexicanland.net" },
      payload: { items: [{ nombre: "Pro", precio: 199, cantidad: 1 }], cliente: { nombre: "Pedro", telefono: "5512345678" } },
    });
    expect(pedido.statusCode).toBe(200);
    const entrada = (await app.inject({ method: "GET", url: `/api/sitios/${s.id}/entradas`, headers: h })).json<{ id: string; tipo: string }[]>().find((e) => e.tipo === "pedido")!;

    const cobro = { concepto: "Plan Pro", monto: 199, frecuencia: "mensual", proximoCobro: "2026-04-01" };
    const ok = await app.inject({ method: "POST", url: `/api/sitios/${s.id}/entradas/${entrada.id}/cobro`, headers: h, payload: cobro });
    expect(ok.statusCode).toBe(200);
    // Ya está en Clientes y cobros
    const cobros = (await app.inject({ method: "GET", url: "/api/cobros", headers: h })).json<{ concepto: string; cliente: string; monto: number }[]>();
    expect(cobros.find((c) => c.concepto === "Plan Pro")?.cliente).toBe("Pedro");
    // Y no se duplica
    expect((await app.inject({ method: "POST", url: `/api/sitios/${s.id}/entradas/${entrada.id}/cobro`, headers: h, payload: cobro })).statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: `/api/sitios/${s.id}/entradas`, headers: h })).json<{ datos: { cobro?: string } }[]>().find((e) => e.datos.cobro)).toBeTruthy();
  });

  it("sin permiso en Clientes y cobros no se puede crear el cobro", async () => {
    const h = await preparar({ sitios: "escritura" });
    const app = ctx!.app;
    const s = (await app.inject({ method: "POST", url: "/api/sitios", headers: h, payload: { nombre: "Otro", slug: "otro" } })).json<{ id: string }>();
    await app.inject({ method: "POST", url: `/api/sitios/${s.id}/publicar`, headers: h, payload: { paginas: [{ ruta: "/", html: "<p>x</p>", css: "" }] } });
    await app.inject({ method: "POST", url: "/_ms/pedido", headers: { host: "otro.mexicanland.net" }, payload: { items: [{ nombre: "A", precio: 10, cantidad: 1 }], cliente: { nombre: "Ana" } } });
    const e = (await app.inject({ method: "GET", url: `/api/sitios/${s.id}/entradas`, headers: h })).json<{ id: string }[]>()[0]!;
    const r = await app.inject({ method: "POST", url: `/api/sitios/${s.id}/entradas/${e.id}/cobro`, headers: h, payload: { concepto: "A", monto: 10, frecuencia: "unico", proximoCobro: "2026-04-01" } });
    expect(r.statusCode).toBe(403);
  });
});
