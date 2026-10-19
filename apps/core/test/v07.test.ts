import { afterEach, describe, expect, it } from "vitest";
import { enlaceTienda } from "../src/modules/compras.js";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

async function preparar() {
  ctx = await createTestContext();
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { novedades: "lectura", ia_creativa: "escritura", ejercicios: "lectura" } as never });
  const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } });
  return bearer(r.json<{ accessToken: string }>().accessToken);
}

describe("compras", () => {
  it("sin claves de Mercado Libre da los enlaces de todas las tiendas", async () => {
    const h = await preparar();
    const r = await ctx!.app.inject({ method: "GET", url: "/api/compras/buscar?q=memoria%20ram", headers: h });
    expect(r.statusCode).toBe(200);
    const d = r.json<{ tiendas: { id: string; url: string }[]; mercadoLibre: { configurado: boolean } }>();
    expect(d.mercadoLibre.configurado).toBe(false);
    expect(d.tiendas.find((t) => t.id === "amazon")?.url).toBe("https://www.amazon.com.mx/s?k=memoria%20ram");
    expect(enlaceTienda("mercadolibre", "memoria ram")).toBe("https://listado.mercadolibre.com.mx/memoria-ram");
  });
});

describe("Nano Banana", () => {
  it("sin GEMINI_API_KEY avisa qué falta", async () => {
    const h = await preparar();
    const r = await ctx!.app.inject({ method: "POST", url: "/api/ia-creativa/imagen", headers: h, payload: { prompt: "un pastel" } });
    expect(r.json<{ error: string }>().error).toContain("GEMINI_API_KEY");
  });
});

describe("ejercicios", () => {
  it("guarda el código y cuenta los resueltos", async () => {
    const h = await preparar();
    const app = ctx!.app;
    await app.inject({ method: "PUT", url: "/api/ejercicios/progreso/js-suma", headers: h, payload: { codigo: "function suma(a,b){return a+b}", resuelto: true } });
    await app.inject({ method: "PUT", url: "/api/ejercicios/progreso/js-par", headers: h, payload: { codigo: "x", resuelto: false } });
    const p = (await app.inject({ method: "GET", url: "/api/ejercicios/progreso", headers: h })).json<{ resueltos: Record<string, string>; codigos: Record<string, string> }>();
    expect(Object.keys(p.resueltos)).toEqual(["js-suma"]);
    expect(p.codigos["js-par"]).toBe("x");
    expect((await app.inject({ method: "PUT", url: "/api/ejercicios/progreso/../x", headers: h, payload: { codigo: "" } })).statusCode).toBeGreaterThanOrEqual(400);
  });
});
