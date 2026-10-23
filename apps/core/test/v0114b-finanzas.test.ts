import { afterEach, describe, expect, it } from "vitest";
import { bearer, createTestContext, seedUser } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

async function preparar() {
  ctx = await createTestContext();
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-usuario-123", permissions: { finanzas_personales: "escritura" } });
  const c = ctx;
  const entrar = async () => bearer((await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-usuario-123" } })).json<{ accessToken: string }>().accessToken);
  return { c, h: await entrar(), entrar };
}

interface Mes {
  mes: string;
  cobros: { id: string; pago: string; persona: string; fecha: string; monto: number; pagado: boolean; vieneDe: string | null }[];
  total: number;
  falta: number;
  deAntes: number;
  totalPagos: number;
  totalPagosMes: number;
}

describe("0.11.4b · Mis finanzas", () => {
  it("pagos divididos: total de todos los pagos y lo no pagado pasa al mes siguiente sin duplicarse", async () => {
    const { c, h: h0, entrar } = await preparar();
    let h = h0;
    const crear = (payload: Record<string, unknown>) => c.app.inject({ method: "POST", url: "/api/finanzas-personales/divididos", headers: h, payload });
    expect((await crear({ nombre: "Internet", total: 590, ciclo: "mensual", primerCobro: "2026-02-15", incluirme: true, personas: [{ nombre: "Ana" }, { nombre: "Beto" }] })).statusCode).toBe(200);
    expect((await crear({ nombre: "Dominio", total: 240, ciclo: "anual", primerCobro: "2026-12-01", incluirme: false, personas: [{ nombre: "Ana" }] })).statusCode).toBe(200);

    const leer = async (mes: string) => (await c.app.inject({ method: "GET", url: `/api/finanzas-personales/divididos/mes?mes=${mes}`, headers: h })).json<Mes>();
    const marzo = await leer("2026-03");
    expect(marzo.totalPagos).toBe(830);
    expect(marzo.totalPagosMes).toBe(610);
    const deFebrero = marzo.cobros.filter((x) => x.vieneDe === "2026-02");
    const deMarzo = marzo.cobros.filter((x) => !x.vieneDe);
    expect(deFebrero).toHaveLength(2);
    expect(deMarzo).toHaveLength(2);
    expect(marzo.deAntes).toBeCloseTo(deFebrero.reduce((t, x) => t + x.monto, 0), 2);

    const otra = await leer("2026-03");
    expect(otra.cobros).toHaveLength(4);

    const ana = deFebrero.find((x) => x.persona === "Ana")!;
    expect((await c.app.inject({ method: "POST", url: `/api/finanzas-personales/divididos/cobros/${ana.id}`, headers: h, payload: { pagado: true } })).statusCode).toBe(200);
    c.advance(40 * 86_400_000);
    h = await entrar();
    const abril = await leer("2026-04");
    const arrastrados = abril.cobros.filter((x) => x.vieneDe);
    expect(arrastrados.map((x) => `${x.vieneDe}:${x.persona}`).sort()).toEqual(["2026-02:Beto", "2026-03:Ana", "2026-03:Beto"]);
    expect(abril.cobros.some((x) => x.id === ana.id)).toBe(false);

    const lista = (await c.app.inject({ method: "GET", url: "/api/finanzas-personales/divididos", headers: h })).json<{ totalPagos: number; totalPagosMes: number }>();
    expect(lista.totalPagos).toBe(830);
    expect(lista.totalPagosMes).toBe(610);
  });

  it("las suscripciones se pueden editar, pausar y borrar", async () => {
    const { c, h } = await preparar();
    const nueva = await c.app.inject({ method: "POST", url: "/api/finanzas-personales/suscripciones", headers: h, payload: { nombre: "Música", monto: 129, ciclo: "mensual", proximoCobro: "2026-03-12" } });
    const id = nueva.json<{ id: string }>().id;
    const editada = await c.app.inject({
      method: "PATCH",
      url: `/api/finanzas-personales/suscripciones/${id}`,
      headers: h,
      payload: { nombre: "Música familiar", monto: 199, ciclo: "anual", proximoCobro: "2026-04-01", activa: false },
    });
    expect(editada.statusCode).toBe(200);
    expect(editada.json()).toMatchObject({ nombre: "Música familiar", monto: 199, ciclo: "anual", proximoCobro: "2026-04-01", activa: false });
    const totales = (await c.app.inject({ method: "GET", url: "/api/finanzas-personales/suscripciones", headers: h })).json<{ totalMensual: number }>();
    expect(totales.totalMensual).toBe(0);
    expect((await c.app.inject({ method: "DELETE", url: `/api/finanzas-personales/suscripciones/${id}`, headers: h })).statusCode).toBe(200);
    expect((await c.app.inject({ method: "GET", url: "/api/finanzas-personales/suscripciones", headers: h })).json<{ suscripciones: unknown[] }>().suscripciones).toHaveLength(0);
  });
});
