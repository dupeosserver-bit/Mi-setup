import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { buscarFragmentos, partirTexto } from "../src/modules/ia/contexto.js";
import { unirPasos } from "../src/modules/ia/deudas.js";
import type { ClienteIa, PeticionIa, RespuestaIa } from "../src/modules/ia/servicio.js";
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

const USO = { input_tokens: 100, output_tokens: 50 };

function iaFalsa(): ClienteIa & { peticiones: PeticionIa[] } {
  const peticiones: PeticionIa[] = [];
  return {
    peticiones,
    async mensajes(p): Promise<RespuestaIa> {
      peticiones.push(p);
      const texto = p.sistema.includes("Responde SOLO un JSON")
        ? JSON.stringify({ respuesta: "Pide el saldo por escrito.", mensaje: "Hola, ¿me compartes el saldo actualizado?", pasos: ["Pedir el saldo por escrito", "Revisar el contrato"], probabilidad: 70 })
        : "Listo.";
      return { model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: texto }], usage: USO };
    },
  };
}

async function preparar(extra: Record<string, string> = {}) {
  dir = await mkdtemp(join(tmpdir(), "ia-"));
  const ia = iaFalsa();
  ctx = await createTestContext({ clienteIa: ia, config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir, ...extra }) });
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { ia: "escritura" } as never });
  await seedUser(ctx.db, { email: "otro@x.test", password: "clave-de-prueba-123", permissions: { ia: "escritura" } as never });
  const entrar = async (email: string) => bearer((await ctx!.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken);
  return { h: await entrar("u@x.test"), otro: await entrar("otro@x.test"), ia };
}

function multipart(archivos: { nombre: string; tipo: string; contenido: string | Buffer }[], campos: Record<string, string> = {}) {
  const limite = "----limiteIa";
  const trozos: Buffer[] = [];
  for (const [k, v] of Object.entries(campos)) trozos.push(Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  for (const a of archivos) {
    trozos.push(Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${a.nombre}"\r\nContent-Type: ${a.tipo}\r\n\r\n`));
    trozos.push(Buffer.isBuffer(a.contenido) ? a.contenido : Buffer.from(a.contenido));
    trozos.push(Buffer.from("\r\n"));
  }
  trozos.push(Buffer.from(`--${limite}--\r\n`));
  return { payload: Buffer.concat(trozos), headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

async function proyecto(h: Record<string, string>, datos: Record<string, unknown>) {
  const r = await ctx!.app.inject({ method: "POST", url: "/api/ia/proyectos", headers: h, payload: { nombre: "Servidor", ...datos } });
  expect(r.statusCode).toBe(200);
  return r.json<{ id: string }>().id;
}

async function subir(h: Record<string, string>, id: string, nombre: string, contenido: string | Buffer, tipo = "text/markdown", campos: Record<string, string> = {}) {
  const m = multipart([{ nombre, tipo, contenido }], campos);
  return ctx!.app.inject({ method: "POST", url: `/api/ia/proyectos/${id}/archivos`, headers: { ...h, ...m.headers }, payload: m.payload });
}

describe("0.11.4b IA: fragmentos sin red", () => {
  it("parte el texto y encuentra la parte que importa", () => {
    const largo = Array.from({ length: 30 }, (_, i) => `Párrafo ${i} sobre cosas generales del día.`).join("\n\n");
    const partes = partirTexto(`${largo}\n\nLa memoria del servidor Survival es de 4 GB y se traba con diez personas.`, 300);
    expect(partes.length).toBeGreaterThan(3);
    expect(partes.every((p) => p.length <= 300)).toBe(true);
    const fragmentos = partes.map((texto, posicion) => ({ texto, posicion, archivo: "plan.md" }));
    const encontrados = buscarFragmentos(fragmentos, "¿Cuánta memoria tiene el servidor survival?");
    expect(encontrados[0]!.texto).toContain("4 GB");
    expect(buscarFragmentos(fragmentos, "de la el")).toEqual([]);
  });

  it("une los pasos sin perder los que ya hiciste", () => {
    const pasos = unirPasos([{ texto: "Pedir el saldo", hecho: true }, { texto: "Llamar", hecho: false }], ["pedir el saldo", "Mandar carta"]);
    expect(pasos).toEqual([
      { texto: "Pedir el saldo", hecho: true },
      { texto: "Mandar carta", hecho: false },
    ]);
  });
});

describe("0.11.4b IA: contexto del proyecto", () => {
  it("respeta el límite de archivos y de espacio", async () => {
    const { h, otro } = await preparar({ IA_CONTEXTO_MAX_ARCHIVOS: "2", IA_CONTEXTO_MAX_MB: "1" });
    const id = await proyecto(h, {});
    expect((await subir(h, id, "a.md", "# Uno\nhola")).statusCode).toBe(200);
    const grande = await subir(h, id, "b.txt", "x ".repeat(600_000), "text/plain");
    expect(grande.statusCode).toBe(400);
    expect(grande.json<{ codigo: string }>().codigo).toBe("limite_contexto");
    expect((await subir(h, id, "b.md", "# Dos\nadios")).statusCode).toBe(200);
    const tercero = await subir(h, id, "c.md", "# Tres");
    expect(tercero.statusCode).toBe(400);
    expect(tercero.json<{ codigo: string }>().codigo).toBe("limite_contexto");
    const lista = await ctx!.app.inject({ method: "GET", url: `/api/ia/proyectos/${id}/archivos`, headers: h });
    expect(lista.json<{ uso: { archivos: number; maxArchivos: number } }>().uso).toMatchObject({ archivos: 2, maxArchivos: 2 });
    expect((await ctx!.app.inject({ method: "GET", url: `/api/ia/proyectos/${id}/archivos`, headers: otro })).statusCode).toBe(404);
    expect((await subir(h, id, "x.exe", Buffer.from([0x4d, 0x5a, 0, 1]), "application/octet-stream")).statusCode).toBe(400);
  });

  it("solo manda a la IA los fragmentos que sirven, con las instrucciones del proyecto", async () => {
    const { h, ia } = await preparar();
    const id = await proyecto(h, { instrucciones: "Responde como parte del staff de MexicanLand." });
    const relleno = Array.from({ length: 40 }, (_, i) => `Nota ${i}: horarios de la tienda y del soporte.`).join("\n\n");
    expect((await subir(h, id, "plan.md", `${relleno}\n\nEl Survival tiene 4 GB de memoria y se traba con diez jugadores.`)).statusCode).toBe(200);
    const pdf = await subir(h, id, "reglas.pdf", Buffer.from("%PDF-1.4 binario"), "application/pdf", { texto: "Regla uno: no se permite el grifeo." });
    expect(pdf.statusCode).toBe(200);
    const buscar = await ctx!.app.inject({ method: "GET", url: `/api/ia/proyectos/${id}/buscar?q=grifeo`, headers: h });
    expect(buscar.json<{ archivo: string }[]>()[0]!.archivo).toBe("reglas.pdf");
    const chat = await ctx!.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "¿Por qué se traba el survival con jugadores?", proyectoId: id } });
    expect(chat.statusCode).toBe(200);
    const sistema = ia.peticiones.at(-1)!.sistema;
    expect(sistema).toContain("Responde como parte del staff de MexicanLand.");
    expect(sistema).toContain("segundo nivel");
    expect(sistema).toContain("4 GB de memoria");
    expect(sistema).not.toContain("Nota 3:");
  });

  it("la memoria de la cuenta se comparte con el proyecto solo si está encendida", async () => {
    const { h, ia } = await preparar();
    await ctx!.app.inject({ method: "POST", url: "/api/ia/memoria", headers: h, payload: { texto: "Me gusta que me hablen de tú" } });
    const id = await proyecto(h, { memoriaCompartida: false });
    const soloProyecto = await ctx!.app.inject({ method: "POST", url: "/api/ia/memoria", headers: h, payload: { texto: "El servidor usa Paper 1.21", proyectoId: id } });
    expect(soloProyecto.json<{ proyectoId: string | null }>().proyectoId).toBe(id);

    await ctx!.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "hola", proyectoId: id } });
    let sistema = ia.peticiones.at(-1)!.sistema;
    expect(sistema).toContain("Paper 1.21");
    expect(sistema).not.toContain("hablen de tú");

    expect((await ctx!.app.inject({ method: "PATCH", url: `/api/ia/proyectos/${id}`, headers: h, payload: { memoriaCompartida: true } })).statusCode).toBe(200);
    await ctx!.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "hola otra vez", proyectoId: id } });
    sistema = ia.peticiones.at(-1)!.sistema;
    expect(sistema).toContain("Paper 1.21");
    expect(sistema).toContain("hablen de tú");

    await ctx!.app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "chat suelto" } });
    sistema = ia.peticiones.at(-1)!.sistema;
    expect(sistema).toContain("hablen de tú");
    expect(sistema).not.toContain("Paper 1.21");
  });
});

describe("0.11.4b IA: casos de deudas", () => {
  it("sigue la conversación con adjuntos y guarda los pasos", async () => {
    const { h, otro, ia } = await preparar();
    const nuevo = await ctx!.app.inject({
      method: "POST",
      url: "/api/ia/deudas",
      headers: h,
      payload: { titulo: "Tarjeta de tienda", con: "Tienda Aurora", monto: "$8,400", situacion: "Me llaman diario para cobrarme una tarjeta vieja." },
    });
    expect(nuevo.statusCode).toBe(200);
    const caso = nuevo.json<{ caso: { id: string; pasos: { texto: string; hecho: boolean }[]; probabilidad: number }; mensajes: { rol: string; listo: string | null }[]; aviso: string }>();
    expect(caso.caso.pasos.map((p) => p.texto)).toEqual(["Pedir el saldo por escrito", "Revisar el contrato"]);
    expect(caso.caso.probabilidad).toBe(70);
    expect(caso.mensajes.at(-1)).toMatchObject({ rol: "assistant", listo: "Hola, ¿me compartes el saldo actualizado?" });
    expect(caso.aviso).toContain("no asesoría legal");

    const marcado = await ctx!.app.inject({
      method: "PATCH",
      url: `/api/ia/deudas/${caso.caso.id}`,
      headers: h,
      payload: { pasos: [{ texto: "Pedir el saldo por escrito", hecho: true }, { texto: "Revisar el contrato", hecho: false }] },
    });
    expect(marcado.json<{ caso: { pasos: { hecho: boolean }[] } }>().caso.pasos[0]!.hecho).toBe(true);

    const m = multipart([{ nombre: "respuesta.txt", tipo: "text/plain", contenido: "Nos dijeron que el saldo es $8,400." }], { texto: "Ya me contestaron" });
    const seguir = await ctx!.app.inject({ method: "POST", url: `/api/ia/deudas/${caso.caso.id}/mensajes`, headers: { ...h, ...m.headers }, payload: m.payload });
    expect(seguir.statusCode).toBe(200);
    const despues = seguir.json<{ caso: { pasos: { texto: string; hecho: boolean }[] }; mensajes: { rol: string; adjuntos: { nombre: string; url: string }[] }[] }>();
    expect(despues.caso.pasos.find((p) => p.texto === "Pedir el saldo por escrito")!.hecho).toBe(true);
    const conAdjunto = despues.mensajes.find((x) => x.adjuntos.length)!;
    expect(conAdjunto.adjuntos[0]!.nombre).toBe("respuesta.txt");
    expect(ia.peticiones.at(-1)!.mensajes[0]!.content.some((b) => b.type === "text" && (b.text ?? "").includes("saldo es $8,400"))).toBe(true);
    const descarga = await ctx!.app.inject({ method: "GET", url: conAdjunto.adjuntos[0]!.url });
    expect(descarga.statusCode).toBe(200);

    expect((await ctx!.app.inject({ method: "GET", url: `/api/ia/deudas/${caso.caso.id}`, headers: otro })).statusCode).toBe(404);
    expect((await ctx!.app.inject({ method: "GET", url: "/api/ia/deudas", headers: otro })).json<unknown[]>()).toEqual([]);
  });
});
