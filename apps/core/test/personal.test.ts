import { afterEach, describe, expect, it } from "vitest";
import { revisarSuscripciones, sumarCiclo } from "../src/modules/personal.js";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

async function sesion(c: Ctx) {
  await seedUser(c.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { finanzas_personales: "escritura", calendario: "escritura" } as never });
  const r = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } });
  return bearer(r.json<{ accessToken: string }>().accessToken);
}

describe("mis finanzas", () => {
  it("suma ciclos sin pasarse de fin de mes", () => {
    expect(sumarCiclo("2026-01-31", "mensual")).toBe("2026-02-28");
    expect(sumarCiclo("2026-03-15", "trimestral")).toBe("2026-06-15");
    expect(sumarCiclo("2026-12-30", "semanal")).toBe("2027-01-06");
    expect(sumarCiclo("2028-02-29", "anual")).toBe("2029-02-28");
  });

  it("importa movimientos, resume el mes contra el presupuesto", async () => {
    ctx = await createTestContext();
    const h = await sesion(ctx);
    const app = ctx.app;
    const imp = await app.inject({
      method: "POST",
      url: "/api/finanzas-personales/importar",
      headers: h,
      payload: {
        filas: [
          { tipo: "ingreso", monto: 10000, categoria: "Sueldo", fecha: "2026-03-01" },
          { tipo: "gasto", monto: 1500, categoria: "Comida", fecha: "2026-03-02" },
          { tipo: "gasto", monto: 500, categoria: "Comida", fecha: "2026-03-10" },
          { tipo: "gasto", monto: 300, categoria: "Transporte", fecha: "2026-02-20" },
        ],
      },
    });
    expect(imp.json()).toMatchObject({ importados: 4 });
    await app.inject({ method: "PUT", url: "/api/finanzas-personales/presupuestos", headers: h, payload: { categoria: "Comida", limite: 2500 } });
    const r = (await app.inject({ method: "GET", url: "/api/finanzas-personales/resumen?mes=2026-03", headers: h })).json<{
      ingresos: number;
      gastos: number;
      balance: number;
      porCategoria: { categoria: string; gastado: number; presupuesto: number | null }[];
    }>();
    expect(r).toMatchObject({ ingresos: 10000, gastos: 2000, balance: 8000 });
    expect(r.porCategoria.find((c) => c.categoria === "Comida")).toEqual({ categoria: "Comida", gastado: 2000, presupuesto: 2500 });
  });

  it("una suscripción avisa antes, se anota como gasto al cobrarse y aparece en el calendario", async () => {
    ctx = await createTestContext();
    const h = await sesion(ctx);
    const app = ctx.app;
    // El reloj de pruebas está en 2026-03-01.
    await app.inject({ method: "POST", url: "/api/finanzas-personales/suscripciones", headers: h, payload: { nombre: "Netflix", monto: 199, proximoCobro: "2026-03-02", avisarDias: 2 } });
    await revisarSuscripciones(ctx.deps);
    let subs = (await app.inject({ method: "GET", url: "/api/finanzas-personales/suscripciones", headers: h })).json<{ suscripciones: { proximoCobro: string }[]; totalMensual: number }>();
    expect(subs.suscripciones[0]?.proximoCobro).toBe("2026-03-02");
    expect(subs.totalMensual).toBe(199);

    const cal = (await app.inject({ method: "GET", url: "/api/calendario?desde=2026-03-01&hasta=2026-03-31", headers: h })).json<{ tipo: string; titulo: string }[]>();
    expect(cal.some((e) => e.tipo === "suscripcion" && e.titulo.startsWith("Netflix"))).toBe(true);

    ctx.advance(2 * 86_400_000);
    await revisarSuscripciones(ctx.deps);
    // Pasaron dos días: la sesión de prueba ya venció, se vuelve a entrar.
    const h2 = bearer(
      (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken,
    );
    subs = (await app.inject({ method: "GET", url: "/api/finanzas-personales/suscripciones", headers: h2 })).json();
    expect(subs.suscripciones[0]?.proximoCobro).toBe("2026-04-02");
    const movs = (await app.inject({ method: "GET", url: "/api/finanzas-personales/movimientos?mes=2026-03", headers: h2 })).json<{ descripcion: string; monto: number }[]>();
    expect(movs).toEqual([expect.objectContaining({ descripcion: "Suscripción: Netflix", monto: 199 })]);
  });
});
