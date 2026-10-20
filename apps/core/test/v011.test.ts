import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { estadoCobro, fechasPendientes, siguienteFecha } from "../src/modules/finanzas-extra.js";
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

/** IA de prueba: responde siempre el mismo texto y recuerda lo que se le pidió. */
function iaFija(texto: string) {
  const vistos: { sistema: string; tipos: string[] }[] = [];
  const cliente: ClienteIa = {
    async mensajes(p) {
      vistos.push({ sistema: p.sistema, tipos: p.mensajes[0]?.content.map((b) => b.type) ?? [] });
      return { model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: texto }], usage: { input_tokens: 10, output_tokens: 10 } };
    },
  };
  return { cliente, vistos };
}

async function preparar(clienteIa?: ClienteIa, permisos: Record<string, string> = { finanzas_personales: "escritura" }) {
  dir = await mkdtemp(join(tmpdir(), "v011-"));
  ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir }), ...(clienteIa ? { clienteIa } : {}) });
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: permisos as never });
  await seedUser(ctx.db, { email: "otra@x.test", password: "clave-de-prueba-123", permissions: permisos as never });
  const login = async (email: string) =>
    bearer((await ctx!.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken);
  return { h: await login("u@x.test"), otra: await login("otra@x.test"), login };
}

function multipart(nombre: string, tipo: string, contenido: Buffer | string) {
  const limite = "----prueba011";
  const cuerpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n`),
    Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido),
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  return { payload: cuerpo, headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);

describe("finanzas: fechas de cobros", () => {
  it("mensual se queda en el último día de los meses cortos", () => {
    expect(siguienteFecha("2026-01-31", "mensual", 31)).toBe("2026-02-28");
    expect(siguienteFecha("2026-02-28", "mensual", 31)).toBe("2026-03-31");
    expect(siguienteFecha("2026-12-15", "mensual")).toBe("2027-01-15");
    expect(siguienteFecha("2026-03-01", "semanal")).toBe("2026-03-08");
    expect(siguienteFecha("2026-03-01", "unico")).toBe("9999-12-31");
  });

  it("genera las fechas pendientes hasta el límite", () => {
    expect(fechasPendientes("2026-01-05", "mensual", "2026-03-10")).toEqual({ fechas: ["2026-01-05", "2026-02-05", "2026-03-05"], nuevaProxima: "2026-04-05" });
    expect(estadoCobro({ dueOn: "2026-02-01", paidAt: null }, "2026-03-01")).toBe("debe");
    expect(estadoCobro({ dueOn: "2026-03-05", paidAt: null }, "2026-03-01")).toBe("pendiente");
    expect(estadoCobro({ dueOn: "2026-02-01", paidAt: new Date() }, "2026-03-01")).toBe("pagado");
  });
});

describe("finanzas: ticket con foto", () => {
  it("la IA lee el ticket y se guarda como gasto con su IVA y su foto", async () => {
    const ia = iaFija('Listo: {"tienda":"OXXO","fecha":"2026-02-27","total":116,"iva":16,"moneda":"MXN","categoria":"Comida","conceptos":[{"nombre":"Refresco","monto":116}]}');
    const { h, otra } = await preparar(ia.cliente);
    const app = ctx!.app;
    const foto = multipart("ticket.jpg", "image/jpeg", JPG);
    const leido = await app.inject({ method: "POST", url: "/api/finanzas-personales/ticket/leer", headers: { ...h, ...foto.headers }, payload: foto.payload });
    expect(leido.statusCode).toBe(200);
    const r = leido.json<{ archivo: string; propuesta: { tienda: string; total: number; iva: number } }>();
    expect(r.propuesta).toMatchObject({ tienda: "OXXO", total: 116, iva: 16 });
    expect(ia.vistos[0]?.tipos).toEqual(["image", "text"]);
    // Un archivo que no es imagen no se manda a la IA.
    const html = multipart("x.html", "image/jpeg", "<html>");
    expect((await app.inject({ method: "POST", url: "/api/finanzas-personales/ticket/leer", headers: { ...h, ...html.headers }, payload: html.payload })).statusCode).toBe(400);
    // Otra persona no puede usar la foto ajena.
    expect((await app.inject({ method: "POST", url: "/api/finanzas-personales/ticket/guardar", headers: otra, payload: { archivo: r.archivo, monto: 116, fecha: "2026-02-27" } })).statusCode).toBe(404);
    const g = await app.inject({ method: "POST", url: "/api/finanzas-personales/ticket/guardar", headers: h, payload: { archivo: r.archivo, monto: 116, categoria: "Comida", descripcion: "OXXO", fecha: "2026-02-27", iva: 16 } });
    expect(g.statusCode).toBe(200);
    const movs = (await app.inject({ method: "GET", url: "/api/finanzas-personales/movimientos?mes=2026-02", headers: h })).json<{ iva: number; ticket: string }[]>();
    expect(movs[0]?.iva).toBe(16);
    expect((await app.inject({ method: "GET", url: movs[0]!.ticket })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: movs[0]!.ticket.replace(/[^/]+$/, "firma-falsa-firma-falsa1") })).statusCode).toBe(404);
    const imp = (await app.inject({ method: "GET", url: "/api/finanzas-personales/impuestos?mes=2026-02", headers: h })).json<{ ivaPagado: number; conTicket: number }>();
    expect(imp).toMatchObject({ ivaPagado: 16, conTicket: 1 });
  });

  it("sin IA configurada avisa qué falta", async () => {
    const { h } = await preparar();
    const foto = multipart("t.jpg", "image/jpeg", JPG);
    const res = await ctx!.app.inject({ method: "POST", url: "/api/finanzas-personales/ticket/leer", headers: { ...h, ...foto.headers }, payload: foto.payload });
    expect(res.statusCode).toBe(503);
    expect(res.body).toContain("ANTHROPIC_API_KEY");
  });
});

describe("finanzas: pagos divididos", () => {
  it("Netflix entre 4: cada quien su cobro, se marca pagado y lo vencido queda «debe»", async () => {
    const { h: h0, otra, login } = await preparar();
    let h = h0;
    const app = ctx!.app;
    const nuevo = await app.inject({
      method: "POST",
      url: "/api/finanzas-personales/divididos",
      headers: h,
      payload: { nombre: "Netflix", total: 269, ciclo: "mensual", primerCobro: "2026-02-10", incluirme: true, personas: [{ nombre: "Ana" }, { nombre: "Beto" }, { nombre: "Caro" }] },
    });
    expect(nuevo.statusCode).toBe(200);
    type Lista = { pagos: { miembros: { monto: number }[]; proximo: string }[]; personas: { id: string; nombre: string; debe: number; pendiente: number; cobros: { id: string; estado: string; fecha: string }[] }[] };
    let lista = (await app.inject({ method: "GET", url: "/api/finanzas-personales/divididos", headers: h })).json<Lista>();
    expect(lista.pagos[0]?.miembros.map((m) => m.monto)).toEqual([67.25, 67.25, 67.25]);
    expect(lista.pagos[0]?.proximo).toBe("2026-03-10");
    const ana = lista.personas.find((p) => p.nombre === "Ana")!;
    expect(ana.debe).toBe(67.25);
    expect(ana.cobros).toHaveLength(1);
    // Otra cuenta no ve ni toca nada.
    expect((await app.inject({ method: "GET", url: "/api/finanzas-personales/divididos", headers: otra })).json<Lista>().personas).toHaveLength(0);
    expect((await app.inject({ method: "POST", url: `/api/finanzas-personales/divididos/cobros/${ana.cobros[0]!.id}`, headers: otra, payload: { pagado: true } })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/finanzas-personales/divididos/cobros/${ana.cobros[0]!.id}`, headers: h, payload: { pagado: true } })).statusCode).toBe(200);
    // Pasan 5 días: se genera el cobro de marzo como pendiente.
    ctx!.advance(5 * 86_400_000);
    h = await login("u@x.test");
    lista = (await app.inject({ method: "GET", url: "/api/finanzas-personales/divididos", headers: h })).json<Lista>();
    const ana2 = lista.personas.find((p) => p.nombre === "Ana")!;
    expect(ana2.debe).toBe(0);
    expect(ana2.pendiente).toBe(67.25);
    const beto = lista.personas.find((p) => p.nombre === "Beto")!;
    expect((await app.inject({ method: "POST", url: `/api/finanzas-personales/divididos/personas/${beto.id}/saldar`, headers: h })).json<{ marcados: number }>().marcados).toBe(1);
    // Persona repetida
    expect(
      (await app.inject({ method: "POST", url: "/api/finanzas-personales/divididos", headers: h, payload: { nombre: "Renta", total: 100, primerCobro: "2026-03-01", personas: [{ nombre: "Ana" }, { nombre: "ana" }] } })).statusCode,
    ).toBe(400);
  });
});
