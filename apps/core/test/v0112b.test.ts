import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { calcularMontos } from "../src/modules/finanzas-extra.js";
import { comandoMoverSinPisar, partirNombre } from "../src/modules/vps/archivos-extra.js";
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

async function preparar(permisos: Record<string, string> = { finanzas_personales: "escritura" }) {
  dir = await mkdtemp(join(tmpdir(), "v0112b-"));
  ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir }) });
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: permisos as never });
  await seedUser(ctx.db, { email: "otra@x.test", password: "clave-de-prueba-123", permissions: permisos as never });
  const login = async (email: string) =>
    bearer((await ctx!.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken);
  return { h: await login("u@x.test"), otra: await login("otra@x.test"), login };
}

type Lista = {
  pagos: { id: string; nombre: string; total: number; miembros: { personaId: string; nombre: string; monto: number }[] }[];
  personas: { id: string; nombre: string; contacto: string; cobros: { id: string; monto: number; estado: string }[] }[];
};

describe("0.11.2b · pagos divididos: quitar y editar personas", () => {
  it("edita el pago, cambia montos, quita a una persona y borra personas", async () => {
    const { h, otra } = await preparar();
    const app = ctx!.app;
    await app.inject({
      method: "POST",
      url: "/api/finanzas-personales/divididos",
      headers: h,
      payload: { nombre: "Internet", total: 590, ciclo: "mensual", primerCobro: "2026-02-10", incluirme: true, personas: [{ nombre: "Hermana mayor" }, { nombre: "Hermana chica" }] },
    });
    const ver = async () => (await app.inject({ method: "GET", url: "/api/finanzas-personales/divididos", headers: h })).json<Lista>();
    let lista = await ver();
    const pago = lista.pagos[0]!;
    expect(pago.miembros.map((m) => m.monto)).toEqual([196.67, 196.66]);

    // Otra cuenta no puede editar.
    expect((await app.inject({ method: "PUT", url: `/api/finanzas-personales/divididos/${pago.id}`, headers: otra, payload: { nombre: "x", total: 1, personas: [{ nombre: "a" }] } })).statusCode).toBe(404);

    // La mayor paga 300, la chica sale del pago.
    const editado = await app.inject({
      method: "PUT",
      url: `/api/finanzas-personales/divididos/${pago.id}`,
      headers: h,
      payload: { nombre: "Internet Telmex", total: 590, incluirme: true, personas: [{ nombre: "Hermana mayor", monto: 300 }] },
    });
    expect(editado.statusCode).toBe(200);
    lista = await ver();
    expect(lista.pagos[0]!.nombre).toBe("Internet Telmex");
    expect(lista.pagos[0]!.miembros).toHaveLength(1);
    expect(lista.pagos[0]!.miembros[0]!.monto).toBe(300);
    const chica = lista.personas.find((p) => p.nombre === "Hermana chica")!;
    expect(chica.cobros).toHaveLength(0);

    // Editar y quitar una persona por completo.
    const mayor = lista.personas.find((p) => p.nombre === "Hermana mayor")!;
    expect((await app.inject({ method: "PATCH", url: `/api/finanzas-personales/divididos/personas/${mayor.id}`, headers: h, payload: { nombre: "Ale", contacto: "5512345678" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "DELETE", url: `/api/finanzas-personales/divididos/personas/${chica.id}`, headers: h })).statusCode).toBe(200);
    lista = await ver();
    expect(lista.personas.map((p) => p.nombre)).toEqual(["Ale"]);
    expect(lista.personas[0]!.contacto).toBe("5512345678");
    expect((await app.inject({ method: "DELETE", url: `/api/finanzas-personales/divididos/personas/${mayor.id}`, headers: otra })).statusCode).toBe(404);
  });
});

describe("0.11.2b · organizar archivos sin pisar", () => {
  it("separa nombre y extensión, también .tar.gz", () => {
    expect(partirNombre("archivo.zip")).toEqual(["archivo", ".zip"]);
    expect(partirNombre("respaldo.tar.gz")).toEqual(["respaldo", ".tar.gz"]);
    expect(partirNombre("Makefile")).toEqual(["Makefile", ""]);
    expect(partirNombre(".bashrc")).toEqual([".bashrc", ""]);
  });

  it("el comando busca el siguiente número libre y nunca usa mv sin -n", () => {
    const c = comandoMoverSinPisar("/root/archivo.zip", "/root/Comprimidos", "archivo.zip");
    expect(c).toContain(`b='archivo'`);
    expect(c).toContain(`e='.zip'`);
    expect(c).toContain('d="$c/$b-$n$e"');
    expect(c).toContain('mv -n --');
  });
});

describe("0.11.2b · pagos divididos por porcentaje y enlace para cobrar", () => {
  it("reparte igual, por monto o por porcentaje", () => {
    expect(calcularMontos(590, "igual", true, [{}, {}])).toEqual([196.67, 196.66]);
    expect(calcularMontos(590, "monto", true, [{ monto: 250 }, {}])).toEqual([250, 196.66]);
    // 40 % y 30 %: el 30 % restante es mío.
    expect(calcularMontos(590, "porcentaje", true, [{ porcentaje: 40 }, { porcentaje: 30 }])).toEqual([236, 177]);
    expect(calcularMontos(590, "porcentaje", false, [{ porcentaje: 60 }, { porcentaje: 40 }])).toEqual([354, 236]);
    expect(() => calcularMontos(590, "porcentaje", false, [{ porcentaje: 60 }, { porcentaje: 30 }])).toThrow(/100/);
    expect(() => calcularMontos(590, "porcentaje", true, [{ porcentaje: 80 }, { porcentaje: 30 }])).toThrow(/100/);
    expect(() => calcularMontos(590, "porcentaje", true, [{ porcentaje: 80 }, {}])).toThrow(/porcentaje/);
  });

  it("guarda el modo y el porcentaje; el enlace muestra solo la lista de esa persona", async () => {
    const { h, otra } = await preparar();
    const app = ctx!.app;
    const r = await app.inject({
      method: "POST",
      url: "/api/finanzas-personales/divididos",
      headers: h,
      payload: { nombre: "Internet", total: 590, ciclo: "mensual", primerCobro: "2026-02-10", incluirme: true, modo: "porcentaje", personas: [{ nombre: "Mayor", porcentaje: 40 }, { nombre: "Chica", porcentaje: 30 }] },
    });
    expect(r.statusCode).toBe(200);
    type L = {
      pagos: { modo: string; miembros: { porcentaje: number | null }[] }[];
      personas: { id: string; nombre: string; comparte: { pago: string; monto: number; porcentaje: number | null }[] }[];
    };
    const lista = (await app.inject({ method: "GET", url: "/api/finanzas-personales/divididos", headers: h })).json<L>();
    expect(lista.pagos[0]!.modo).toBe("porcentaje");
    expect(lista.pagos[0]!.miembros.map((m) => m.porcentaje)).toEqual([40, 30]);
    const mayor = lista.personas.find((p) => p.nombre === "Mayor")!;
    expect(mayor.comparte).toEqual([expect.objectContaining({ pago: "Internet", monto: 236, porcentaje: 40 })]);

    expect((await app.inject({ method: "POST", url: `/api/finanzas-personales/divididos/personas/${mayor.id}/enlace`, headers: otra })).statusCode).toBe(404);
    const enlace = (await app.inject({ method: "POST", url: `/api/finanzas-personales/divididos/personas/${mayor.id}/enlace`, headers: h })).json<{ url: string }>();
    const token = enlace.url.split("/cobro/")[1]!;
    expect(token.length).toBeGreaterThan(20);
    // El mismo enlace se reutiliza.
    expect((await app.inject({ method: "POST", url: `/api/finanzas-personales/divididos/personas/${mayor.id}/enlace`, headers: h })).json<{ url: string }>().url).toBe(enlace.url);
    const publico = await app.inject({ method: "GET", url: `/api/cobros-publicos/${token}` });
    expect(publico.statusCode).toBe(200);
    const datos = publico.json<{ nombre: string; cobros: { pago: string; monto: number }[] }>();
    expect(datos.nombre).toBe("Mayor");
    expect(datos.cobros.every((c) => c.monto === 236)).toBe(true);
    expect(JSON.stringify(datos)).not.toContain("Chica");
    // Desactivar: deja de servir.
    await app.inject({ method: "DELETE", url: `/api/finanzas-personales/divididos/personas/${mayor.id}/enlace`, headers: h });
    expect((await app.inject({ method: "GET", url: `/api/cobros-publicos/${token}` })).statusCode).toBe(404);
  });
});

describe("0.11.2b · rendimientos", () => {
  it("lee el SIE de Banxico y elige la tasa más nueva", async () => {
    const { interpretarSie, tasasVigentes } = await import("../src/modules/rendimientos.js");
    const datos = interpretarSie({ bmx: { series: [{ idSerie: "SF43936", datos: [{ fecha: "20/10/2026", dato: "6.05" }] }, { idSerie: "SF43939" }] } });
    expect(datos.get("SF43936")).toEqual({ tasa: 6.05, fecha: "2026-10-20" });
    expect(datos.has("SF43939")).toBe(false);
    const guardado = { actualizado: "2026-10-21T10:00:00Z", leidas: { "cetes-28": { tasa: 6.05, fecha: "2026-10-20", fuente: "Banxico (SIE)" } }, errores: { "nu-247": "No se pudo leer su página oficial" } };
    const tasas = tasasVigentes(guardado, { klar: 3 }, "2026-10-21");
    expect(tasas.find((t) => t.id === "cetes-28")).toMatchObject({ tasa: 6.05, estado: "actualizada" });
    expect(tasas.find((t) => t.id === "klar")).toMatchObject({ tasa: 3, estado: "manual" });
    const nu = tasas.find((t) => t.id === "nu-247")!;
    expect(nu.estado).toBe("referencia");
    expect(nu.aviso).toMatch(/No se pudo actualizar/);
  });

  it("la ruta pide permiso de finanzas y sin token avisa que falta", async () => {
    const { h } = await preparar();
    const r = await ctx!.app.inject({ method: "GET", url: "/api/rendimientos", headers: h });
    expect(r.statusCode).toBe(200);
    const d = r.json<{ banxico: boolean; productos: unknown[]; tasas: { id: string; tasa: number | null }[] }>();
    expect(d.banxico).toBe(false);
    expect(d.productos.length).toBe(d.tasas.length);
    expect((await ctx!.app.inject({ method: "PUT", url: "/api/rendimientos/manual/klar", headers: h, payload: { tasa: 3.5 } })).statusCode).toBe(200);
    const despues = (await ctx!.app.inject({ method: "GET", url: "/api/rendimientos", headers: h })).json<{ tasas: { id: string; tasa: number | null }[] }>();
    expect(despues.tasas.find((t) => t.id === "klar")!.tasa).toBe(3.5);
  });
});

describe("0.11.2b · ficha de acciones y cripto", () => {
  it("lee estadísticas, dividendos y estados financieros de Yahoo", async () => {
    const { interpretarResumenYahoo, interpretarFinanzas, serieDeChart, interpretarCripto } = await import("../src/modules/mercados-detalle.js");
    const r = interpretarResumenYahoo(
      {
        quoteSummary: {
          error: null,
          result: [
            {
              price: { longName: "Apple Inc.", currency: "USD", regularMarketPrice: { raw: 230.1 } },
              assetProfile: { sector: "Technology", fullTimeEmployees: 160000 },
              summaryDetail: { marketCap: { raw: 3.4e12 }, trailingPE: { raw: 35.2 }, dividendRate: { raw: 1.04 }, dividendYield: { raw: 0.0045 }, fiftyTwoWeekHigh: { raw: 260 }, fiftyTwoWeekLow: { raw: 170 } },
              defaultKeyStatistics: { trailingEps: { raw: 6.5 } },
              financialData: { profitMargins: { raw: 0.25 }, recommendationKey: "buy" },
            },
          ],
        },
      },
      "AAPL",
    );
    expect(r.nombre).toBe("Apple Inc.");
    expect(r.estadisticas.pagaDividendos).toBe(true);
    expect(r.estadisticas.rendimientoDividendo).toBeCloseTo(0.45);
    expect(r.estadisticas.margenBeneficio).toBe(25);
    expect(r.estadisticas.pe).toBe(35.2);
    expect(() => interpretarResumenYahoo({ quoteSummary: { result: null, error: { description: "No data" } } }, "XX")).toThrow();

    const f = interpretarFinanzas(
      {
        timeseries: {
          result: [
            { meta: { type: ["annualTotalRevenue"] }, annualTotalRevenue: [{ asOfDate: "2025-09-30", reportedValue: { raw: 400 } }, { asOfDate: "2024-09-30", reportedValue: { raw: 380 } }] },
            { meta: { type: ["annualTotalAssets"] }, annualTotalAssets: [{ asOfDate: "2025-09-30", reportedValue: { raw: 350 } }, null] },
          ],
        },
      },
      "annual",
    );
    expect(f).toEqual([
      { fecha: "2024-09-30", ingresos: 380 },
      { fecha: "2025-09-30", ingresos: 400, activos: 350 },
    ]);
    expect(serieDeChart({ chart: { result: [{ timestamp: [1, 2, 3], indicators: { quote: [{ close: [10, null, 12] }] } }] } })).toEqual([
      { t: 1000, v: 10 },
      { t: 3000, v: 12 },
    ]);
    const c = interpretarCripto(
      { id: "bitcoin", symbol: "btc", name: "Bitcoin", description: { es: "<p>Moneda</p>" }, market_data: { current_price: { mxn: 2e6 }, ath: { mxn: 2.3e6 }, ath_date: { mxn: "2026-03-01T00:00:00Z" }, max_supply: 21e6 } },
      "mxn",
    );
    expect(c.simbolo).toBe("BTC");
    expect(c.descripcion).toBe("Moneda");
    expect(c.estadisticas).toMatchObject({ precio: 2e6, maximoHistorico: 2.3e6, fechaMaximo: "2026-03-01", maximo: 21e6, minimoHistorico: null });
  });
});
