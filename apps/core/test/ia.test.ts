import { afterEach, describe, expect, it } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { loadConfig } from "../src/config.js";
import { aiUsage, notes, reminders } from "../src/db/schema.js";
import { calcularCosto, type ClienteIa, type PeticionIa, type RespuestaIa } from "../src/modules/ia/servicio.js";
import { auditRows, bearer, createTestContext, seedUser, TEST_SECRETS } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

const USO = { input_tokens: 1000, output_tokens: 200 };

/** IA falsa: la primera vuelta pide una herramienta, la segunda responde con texto. */
function iaFalsa(herramienta: string, input: unknown, uso = USO): ClienteIa & { peticiones: PeticionIa[] } {
  const peticiones: PeticionIa[] = [];
  return {
    peticiones,
    async mensajes(p): Promise<RespuestaIa> {
      peticiones.push(p);
      const ultimo = p.mensajes.at(-1);
      const yaPropuso = ultimo?.content.some((b) => b.type === "tool_result");
      if (yaPropuso) return { model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Listo, quedó propuesto." }], usage: uso };
      return {
        model: "claude-sonnet-5-5",
        stop_reason: "tool_use",
        content: [{ type: "text", text: "Te propongo esto:" }, { type: "tool_use", id: `tu_${peticiones.length}`, name: herramienta, input }],
        usage: uso,
      };
    },
  };
}

async function maestra(c: Ctx) {
  const secret = generateTotpSecret();
  await seedUser(c.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secret });
  const res = await c.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secret, c.clock.now) } });
  return bearer(res.json<{ accessToken: string }>().accessToken);
}

interface Propuesta {
  id: string;
  estado: string;
  peligrosa: boolean;
}

describe("IA: solo propone, el usuario aprueba", () => {
  it("una propuesta no crea nada hasta que se aprueba, y se ejecuta una sola vez", async () => {
    const ia = iaFalsa("crear_nota", { titulo: "Compras", contenido: "Leche" });
    ctx = await createTestContext({ clienteIa: ia });
    const h = await maestra(ctx);

    const chat = await ctx.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "anota leche", modulo: "notas" } });
    expect(chat.statusCode).toBe(200);
    const cuerpo = chat.json<{ propuestas: Propuesta[]; respuesta: string }>();
    expect(cuerpo.propuestas).toHaveLength(1);
    expect(cuerpo.propuestas[0]!.estado).toBe("pendiente");
    expect(await ctx.db.select().from(notes)).toHaveLength(0);
    // El resultado que recibe la IA dice que NO se ejecutó.
    const resultado = ia.peticiones[1]!.mensajes.at(-1)!.content[0]!;
    expect(String(resultado.content)).toContain("PENDIENTE");

    const id = cuerpo.propuestas[0]!.id;
    const ok = await ctx.app.inject({ method: "POST", url: `/api/ia/propuestas/${id}/aprobar`, headers: h, payload: {} });
    expect(ok.json<Propuesta>().estado).toBe("ejecutada");
    expect(await ctx.db.select().from(notes)).toHaveLength(1);

    const otra = await ctx.app.inject({ method: "POST", url: `/api/ia/propuestas/${id}/aprobar`, headers: h, payload: {} });
    expect(otra.statusCode).toBe(409);
    expect(await ctx.db.select().from(notes)).toHaveLength(1);

    const acciones = (await auditRows(ctx.db)).map((r) => `${r.actorType}:${r.action}`);
    expect(acciones).toEqual(expect.arrayContaining(["ia:ia_propuesta", "usuario:ia_aprobada", "ia:ia_ejecutada"]));
  });

  it("rechazar no ejecuta y no se puede aprobar después", async () => {
    ctx = await createTestContext({ clienteIa: iaFalsa("crear_recordatorio", { titulo: "Pagar luz", fecha: "2026-03-02T09:00:00-06:00" }) });
    const h = await maestra(ctx);
    const { propuestas } = (await ctx.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "recuérdame pagar la luz" } })).json<{ propuestas: Propuesta[] }>();
    const id = propuestas[0]!.id;
    expect((await ctx.app.inject({ method: "POST", url: `/api/ia/propuestas/${id}/rechazar`, headers: h })).json<Propuesta>().estado).toBe("rechazada");
    expect((await ctx.app.inject({ method: "POST", url: `/api/ia/propuestas/${id}/aprobar`, headers: h, payload: {} })).statusCode).toBe(409);
    expect(await ctx.db.select().from(reminders)).toHaveLength(0);
    expect((await auditRows(ctx.db)).some((r) => r.action === "ia_rechazada")).toBe(true);
  });

  it("una acción peligrosa exige reautenticación fuerte y escribir EJECUTAR", async () => {
    ctx = await createTestContext({ clienteIa: iaFalsa("energia_servidor_juego", { servidorId: "abcd1234", senal: "kill" }) });
    const h = await maestra(ctx);
    const { propuestas } = (await ctx.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "mata el server" } })).json<{ propuestas: Propuesta[] }>();
    const id = propuestas[0]!.id;
    expect(propuestas[0]!.peligrosa).toBe(true);

    ctx.advance(6 * 60_000);
    const sinReauth = await ctx.app.inject({ method: "POST", url: `/api/ia/propuestas/${id}/aprobar`, headers: h, payload: { confirmacion: "EJECUTAR" } });
    expect(sinReauth.json()).toMatchObject({ codigo: "reauth_requerida" });

    await ctx.app.inject({ method: "POST", url: "/api/auth/reauth", headers: h, payload: { metodo: "password", password: "clave-maestra-123" } });
    const sinTexto = await ctx.app.inject({ method: "POST", url: `/api/ia/propuestas/${id}/aprobar`, headers: h, payload: {} });
    expect(sinTexto.json()).toMatchObject({ codigo: "doble_confirmacion" });

    // Sigue pendiente tras los intentos fallidos; con todo en regla pasa la compuerta
    // (aquí falla al ejecutar porque Pterodactyl no está configurado en pruebas).
    const final = await ctx.app.inject({ method: "POST", url: `/api/ia/propuestas/${id}/aprobar`, headers: h, payload: { confirmacion: "EJECUTAR" } });
    expect(final.json<Propuesta>().estado).toBe("fallida");
  });

  it("el tope mensual bloquea sin llamar a la API", async () => {
    const ia = iaFalsa("crear_nota", { contenido: "x" }, { input_tokens: 1_000_000, output_tokens: 1_000_000 });
    const config = loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, AI_MONTHLY_BUDGET_USD: "5" });
    ctx = await createTestContext({ config, clienteIa: ia });
    const h = await maestra(ctx);
    await ctx.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "hola" } });
    const llamadas = ia.peticiones.length;
    expect(llamadas).toBe(1); // la primera vuelta ya rebasó el tope: no hay segunda
    const bloqueada = await ctx.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "otra" } });
    expect(bloqueada.statusCode).toBe(402);
    expect(ia.peticiones.length).toBe(llamadas);
    expect((await ctx.app.inject({ method: "GET", url: "/api/ia/uso", headers: h })).json()).toMatchObject({ bloqueada: true });
    expect(await ctx.db.select().from(aiUsage)).toHaveLength(1);
  });

  it("al llegar al tope responde la IA local gratis, sin herramientas ni costo", async () => {
    const ia = iaFalsa("crear_nota", { contenido: "x" }, { input_tokens: 1_000_000, output_tokens: 1_000_000 });
    const peticionesLocal: PeticionIa[] = [];
    const local: ClienteIa = {
      async mensajes(p) {
        peticionesLocal.push(p);
        return { model: "ollama:llama3.2:3b", stop_reason: "end_turn", content: [{ type: "text", text: "Hola desde Llama" }], usage: { input_tokens: 50, output_tokens: 10 } };
      },
    };
    const config = loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, AI_MONTHLY_BUDGET_USD: "5" });
    ctx = await createTestContext({ config, clienteIa: ia, clienteIaLocal: local });
    const h = await maestra(ctx);
    await ctx.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "hola" } });
    const llamadasClaude = ia.peticiones.length;

    const res = await ctx.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "otra" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ respuesta: "Hola desde Llama", local: true, costoUsd: 0, propuestas: [] });
    expect(res.json<{ aviso: string }>().aviso).toContain("tope");
    expect(ia.peticiones.length).toBe(llamadasClaude);
    expect(peticionesLocal[0]?.herramientas).toEqual([]);
    expect((await ctx.app.inject({ method: "GET", url: "/api/ia/uso", headers: h })).json()).toMatchObject({ bloqueada: false, topeAlcanzado: true, local: true });
  });

  it("no ofrece herramientas de módulos sin permiso de escritura", async () => {
    const ia = iaFalsa("ejecutar_comando_vps", { servidorId: "00000000-0000-4000-8000-000000000000", comando: "ls" });
    ctx = await createTestContext({ clienteIa: ia });
    await seedUser(ctx.db, { email: "u@x.test", password: "clave-usuario-123", permissions: { ia: "escritura", notas: "escritura" } });
    const res = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-usuario-123" } });
    const h = bearer(res.json<{ accessToken: string }>().accessToken);
    const chat = (await ctx.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "ls" } })).json<{ propuestas: Propuesta[] }>();
    expect(ia.peticiones[0]!.herramientas.map((t) => t.name)).toEqual(["crear_nota"]);
    expect(chat.propuestas).toHaveLength(0);
  });

  it("sin ANTHROPIC_API_KEY avisa qué falta configurar", async () => {
    ctx = await createTestContext();
    const h = await maestra(ctx);
    const res = await ctx.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "hola" } });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ variable: "ANTHROPIC_API_KEY" });
  });

  it("calcula el costo con la tarifa del modelo que respondió (desconocido = la más alta)", () => {
    expect(calcularCosto("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(2);
    expect(calcularCosto("modelo-raro", { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(10);
  });
});
