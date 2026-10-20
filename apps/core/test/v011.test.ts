import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { armarCorreo, clasificarCorreo, enlacesDe, revisarEnvio } from "../src/modules/correo-google.js";
import { estadoCobro, fechasPendientes, siguienteFecha } from "../src/modules/finanzas-extra.js";
import type { ClienteIa } from "../src/modules/ia/servicio.js";
import { carpetaPara, planOrganizar, razonBasura } from "../src/modules/vps/archivos-extra.js";
import { enZona, scriptRestaurar, sePuedeEnSuLugar, tocaRespaldo } from "../src/modules/respaldos-vps.js";
import { comandosDeAccion, interpretarAuditoria, patronPropio, scriptAvisoEntrada } from "../src/modules/vps/seguridad.js";
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

describe("archivos del VPS: organizar y limpiar", () => {
  it("agrupa por tipo y nunca mueve configuración ni ocultos", () => {
    expect(carpetaPara("instalar.sh")).toBe("scripts");
    expect(carpetaPara("tema.blueprint")).toBe("blueprints");
    expect(carpetaPara("docker-compose.yml")).toBeNull();
    expect(carpetaPara(".env")).toBeNull();
    expect(carpetaPara("app.conf")).toBeNull();
    expect(carpetaPara("sin-extension")).toBeNull();
    const plan = planOrganizar([
      { nombre: "a.sh", tipo: "archivo" },
      { nombre: "b.SH", tipo: "archivo" },
      { nombre: "Scripts", tipo: "carpeta" },
      { nombre: "x.blueprint", tipo: "archivo" },
      { nombre: "carpeta.sh", tipo: "carpeta" },
      { nombre: "compose.yaml", tipo: "archivo" },
    ]);
    expect(plan).toEqual([
      { archivo: "a.sh", carpeta: "Scripts", existe: true },
      { archivo: "b.SH", carpeta: "Scripts", existe: true },
      { archivo: "x.blueprint", carpeta: "blueprints", existe: false },
    ]);
  });

  it("solo marca como basura lo que se puede borrar", () => {
    expect(razonBasura("notas.txt~", "f", 1)).not.toBeNull();
    expect(razonBasura("hs_err_pid123.log", "f", 0)).not.toBeNull();
    expect(razonBasura("latest.log", "f", 3)).toBeNull();
    expect(razonBasura("latest.log", "f", 30)).not.toBeNull();
    expect(razonBasura("2026-01-01-1.log.gz", "f", 40)).not.toBeNull();
    expect(razonBasura("__pycache__", "d", 0)).not.toBeNull();
    expect(razonBasura("world", "d", 400)).toBeNull();
    expect(razonBasura("server.jar", "f", 400)).toBeNull();
    expect(razonBasura("respaldo.tar.gz", "f", 400)).toBeNull();
  });
});

describe("respaldos: restaurar y automáticos", () => {
  it("el VPS completo solo se restaura aparte; la base hace respaldo de seguridad antes", () => {
    expect(sePuedeEnSuLugar("vps-completo-20260301-120000.tar.gz")).toBe(false);
    expect(sePuedeEnSuLugar("auto-vps-completo-20260301-120000.tar.gz")).toBe(false);
    expect(sePuedeEnSuLugar("pterodactyl-20260301-120000.tar.gz")).toBe(true);
    expect(() => scriptRestaurar("vps-completo-20260301-120000.tar.gz", "lugar", new Date())).toThrow();
    expect(() => scriptRestaurar("../etc/passwd", "aparte", new Date())).toThrow();
    const base = scriptRestaurar("base-mi-setup-20260301-120000.sql.gz", "lugar", new Date("2026-03-02T00:00:00Z"));
    expect(base.indexOf("antes-de-restaurar-")).toBeGreaterThan(-1);
    expect(base.indexOf("antes-de-restaurar-")).toBeLessThan(base.indexOf("DROP SCHEMA"));
    expect(scriptRestaurar("web-20260301-120000.tar.gz", "aparte", new Date())).toContain("/opt/mi-setup/restaurados/web-20260301-120000");
  });

  it("toca una vez al día a partir de la hora, en la zona de quien lo programó", () => {
    const p = { frecuencia: "diario" as const, dia: 0, hora: 3, zona: "America/Mexico_City", activo: true, ultimo: null as string | null };
    // 08:00 UTC = 02:00 en CDMX (UTC-6): todavía no.
    expect(tocaRespaldo(p, new Date("2026-03-02T08:00:00Z"))).toBe(false);
    expect(tocaRespaldo(p, new Date("2026-03-02T09:30:00Z"))).toBe(true);
    expect(tocaRespaldo({ ...p, ultimo: "2026-03-02T09:30:00Z" }, new Date("2026-03-02T20:00:00Z"))).toBe(false);
    expect(tocaRespaldo({ ...p, ultimo: "2026-03-02T09:30:00Z" }, new Date("2026-03-03T10:00:00Z"))).toBe(true);
    expect(tocaRespaldo({ ...p, activo: false }, new Date("2026-03-03T10:00:00Z"))).toBe(false);
    // Semanal: solo el día elegido (2026-03-01 es domingo).
    expect(enZona(new Date("2026-03-01T18:00:00Z"), "America/Mexico_City").semana).toBe(0);
    expect(tocaRespaldo({ ...p, frecuencia: "semanal", dia: 1 }, new Date("2026-03-01T18:00:00Z"))).toBe(false);
    expect(tocaRespaldo({ ...p, frecuencia: "semanal", dia: 0 }, new Date("2026-03-01T18:00:00Z"))).toBe(true);
  });
});

function multipartConCampos(campos: Record<string, string>, nombre: string, tipo: string, contenido: Buffer | string) {
  const limite = "----prueba011c";
  const partes = Object.entries(campos).map(([k, v]) => Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  const cuerpo = Buffer.concat([
    ...partes,
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n`),
    Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido),
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  return { payload: cuerpo, headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

describe("chat: fotos, archivos, voz y código", () => {
  it("manda una foto, una nota de voz, un archivo y código; solo quien está en el canal", async () => {
    const { h, otra } = await preparar(undefined, { chat: "escritura", notas: "escritura" });
    const app = ctx!.app;
    const canales = (await app.inject({ method: "GET", url: "/api/chat/canales", headers: h })).json<{ id: string; tipo: string }[]>();
    const canal = canales.find((c) => c.tipo === "personal")!.id;
    const url = `/api/chat/canales/${canal}/archivo`;
    const foto = multipartConCampos({ texto: "mira" }, "f.jpg", "image/jpeg", JPG);
    const f = await app.inject({ method: "POST", url, headers: { ...h, ...foto.headers }, payload: foto.payload });
    expect(f.statusCode).toBe(200);
    const fm = f.json<{ tipo: string; texto: string; archivoUrl: string }>();
    expect(fm).toMatchObject({ tipo: "foto", texto: "mira" });
    const img = await app.inject({ method: "GET", url: fm.archivoUrl });
    expect(img.headers["content-type"]).toBe("image/jpeg");
    const voz = multipartConCampos({ voz: "1", duracion: "4" }, "voz.webm", "audio/webm", Buffer.alloc(200, 2));
    const v = (await app.inject({ method: "POST", url, headers: { ...h, ...voz.headers }, payload: voz.payload })).json<{ tipo: string; meta: { duracion: number }; archivoUrl: string }>();
    expect(v).toMatchObject({ tipo: "voz", meta: { duracion: 4 } });
    expect((await app.inject({ method: "GET", url: v.archivoUrl })).headers["content-type"]).toBe("audio/webm");
    // Un HTML se manda como archivo y se baja (nunca se abre como página).
    const html = multipartConCampos({}, "x.html", "text/html", "<script>alert(1)</script>");
    const a = (await app.inject({ method: "POST", url, headers: { ...h, ...html.headers }, payload: html.payload })).json<{ tipo: string; archivoUrl: string }>();
    expect(a.tipo).toBe("archivo");
    const bajada = await app.inject({ method: "GET", url: a.archivoUrl });
    expect(bajada.headers["content-type"]).toBe("application/octet-stream");
    expect(String(bajada.headers["content-disposition"])).toContain("attachment");
    // Firma falsa
    expect((await app.inject({ method: "GET", url: a.archivoUrl.replace(/[^/]+$/, "xxxxxxxxxxxxxxxxxxxxxxxx") })).statusCode).toBe(404);
    // Otra cuenta no puede mandar archivos a mi canal
    expect((await app.inject({ method: "POST", url, headers: { ...otra, ...foto.headers }, payload: foto.payload })).statusCode).toBe(403);
    // Código largo sí; texto largo no.
    const largo = "x".repeat(6000);
    expect((await app.inject({ method: "POST", url: `/api/chat/canales/${canal}/mensajes`, headers: h, payload: { texto: largo, codigo: { lenguaje: "ts" } } })).json<{ tipo: string }>().tipo).toBe("codigo");
    expect((await app.inject({ method: "POST", url: `/api/chat/canales/${canal}/mensajes`, headers: h, payload: { texto: largo } })).statusCode).toBe(400);
    // Borrar mi mensaje con archivo
    expect((await app.inject({ method: "DELETE", url: `/api/chat/mensajes/${(f.json() as { id: string }).id}`, headers: otra })).statusCode).toBe(404);
    expect((await app.inject({ method: "DELETE", url: `/api/chat/mensajes/${(f.json() as { id: string }).id}`, headers: h })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: fm.archivoUrl })).statusCode).toBe(404);
  });
});

describe("notas: compartir con enlace", () => {
  it("crea el enlace, se ve sin cuenta, otro lo reemplaza y al quitarlo deja de servir", async () => {
    const { h, otra } = await preparar(undefined, { notas: "escritura", chat: "escritura" });
    const app = ctx!.app;
    const nota = (await app.inject({ method: "POST", url: "/api/notas", headers: h, payload: { titulo: "Lista", contenido: "**hola**" } })).json<{ id: string }>();
    expect((await app.inject({ method: "POST", url: `/api/notas/${nota.id}/compartir`, headers: otra, payload: {} })).statusCode).toBe(404);
    const c1 = (await app.inject({ method: "POST", url: `/api/notas/${nota.id}/compartir`, headers: h, payload: { dias: 7 } })).json<{ url: string }>();
    const token1 = c1.url.split("/n/")[1]!;
    const pub = await app.inject({ method: "GET", url: `/api/notas-publicas/${token1}` });
    expect(pub.json()).toMatchObject({ titulo: "Lista", contenido: "**hola**" });
    expect((await app.inject({ method: "GET", url: `/api/notas/${nota.id}/compartir`, headers: h })).json<{ url: string }>().url).toBe(c1.url);
    const c2 = (await app.inject({ method: "POST", url: `/api/notas/${nota.id}/compartir`, headers: h, payload: {} })).json<{ url: string }>();
    expect((await app.inject({ method: "GET", url: `/api/notas-publicas/${token1}` })).statusCode).toBe(404);
    const token2 = c2.url.split("/n/")[1]!;
    expect((await app.inject({ method: "GET", url: `/api/notas-publicas/${token2}` })).statusCode).toBe(200);
    // Mandarla por el chat: solo enlaces de notas de este Mi Setup.
    const canal = (await app.inject({ method: "GET", url: "/api/chat/canales", headers: h })).json<{ id: string; tipo: string }[]>().find((x) => x.tipo === "personal")!.id;
    expect((await app.inject({ method: "POST", url: `/api/chat/canales/${canal}/mensajes`, headers: h, payload: { texto: "Lista", nota: { enlace: "https://malo.test/n/x", titulo: "x" } } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: `/api/chat/canales/${canal}/mensajes`, headers: h, payload: { texto: "Lista", nota: { enlace: c2.url, titulo: "Lista" } } })).json<{ tipo: string }>().tipo).toBe("nota");
    await app.inject({ method: "DELETE", url: `/api/notas/${nota.id}/compartir`, headers: h });
    expect((await app.inject({ method: "GET", url: `/api/notas-publicas/${token2}` })).statusCode).toBe(404);
  });
});

describe("seguridad: VPS más protegido", () => {
  it("las conexiones del propio Mi Setup no avisan; en red privada se ignora el rango", () => {
    expect(patronPropio("172.18.0.5")).toBe('case "$PAM_RHOST" in 172.18.*) exit 0;; esac');
    expect(patronPropio("203.0.113.9")).toBe("[ \"$PAM_RHOST\" = '203.0.113.9' ] && exit 0");
    const s = scriptAvisoEntrada("https://x.test/api/alertas/entrada/1", "tok", "10.0.0.2");
    expect(s).toContain('case "$PAM_RHOST" in 10.0.*) exit 0;; esac');
    expect(s.startsWith("#!/bin/sh")).toBe(true);
    expect(s).toContain("x-mi-setup-alerta: tok");
  });

  it("SSH solo con llave únicamente si Mi Setup entra con llave", () => {
    expect(() => comandosDeAccion({ accion: "ssh_solo_llave", confirmacion: "x" }, true, 22, { conLlave: false })).toThrow();
    expect(comandosDeAccion({ accion: "ssh_solo_llave", confirmacion: "x" }, true, 22, { conLlave: true }).join(" ")).toContain("01-mi-setup.conf");
  });

  it("revisa swap, disco, earlyoom, logs y alertas", () => {
    const salida = ["##memoria", "4000000000", "0", "##disco", "92", "##earlyoom", "inactive", "##journald", "no", "##dockerlogs", "no", "##alertas", "no", "##fallidos", "120", "##fail2ban", "inactive"].join("\n");
    const a = interpretarAuditoria(salida, 22);
    const p = (id: string) => a.puntos.find((x) => x.id === id);
    expect(p("swap")?.accion).toBe("swap_crear");
    expect(p("disco")?.estado).toBe("mal");
    expect(p("earlyoom")?.accion).toBe("earlyoom_instalar");
    expect(p("dockerlogs")?.accion).toBe("docker_logs");
    expect(p("alertas")?.accion).toBe("alertas_ssh");
    expect(p("fallidos")?.estado).toBe("aviso");
  });

  it("la alerta de entrada sin token válido no hace nada", async () => {
    await preparar();
    const r = await ctx!.app.inject({ method: "POST", url: "/api/alertas/entrada/11111111-1111-4111-8111-111111111111", headers: { "x-mi-setup-alerta": "falso" }, payload: { usuario: "root", ip: "1.2.3.4" } });
    expect(r.statusCode).toBe(404);
  });
});

describe("seguridad: tu cuenta", () => {
  it("lista tus sesiones, cierra las otras y avisa de un inicio desde un lugar nuevo", async () => {
    const { h, login } = await preparar(undefined, { ciberseguridad: "lectura" });
    const app = ctx!.app;
    // Segunda sesión desde otra IP y otro dispositivo
    const otra = await app.inject({ method: "POST", url: "/api/auth/login", remoteAddress: "203.0.113.7", payload: { email: "u@x.test", password: "clave-de-prueba-123", dispositivo: "Celular raro" } });
    expect(otra.statusCode).toBe(200);
    const sesiones = (await app.inject({ method: "GET", url: "/api/seguridad/sesiones", headers: h })).json<{ id: string; actual: boolean; dispositivo: string }[]>();
    expect(sesiones.length).toBeGreaterThanOrEqual(2);
    expect(sesiones.filter((x) => x.actual)).toHaveLength(1);
    const inicios = (await app.inject({ method: "GET", url: "/api/seguridad/inicios", headers: h })).json<{ tipo: string }[]>();
    expect(inicios.some((i) => i.tipo === "login_nuevo_lugar")).toBe(true);
    const actual = sesiones.find((x) => x.actual)!;
    expect((await app.inject({ method: "DELETE", url: `/api/seguridad/sesiones/${actual.id}`, headers: h })).statusCode).toBe(400);
    const cerradas = await app.inject({ method: "POST", url: "/api/seguridad/sesiones/cerrar-otras", headers: h });
    expect(cerradas.json<{ cerradas: number }>().cerradas).toBeGreaterThanOrEqual(1);
    // El token de la otra sesión deja de servir al momento.
    const tokenOtra = bearer(otra.json<{ accessToken: string }>().accessToken);
    expect((await app.inject({ method: "GET", url: "/api/seguridad/sesiones", headers: tokenOtra })).statusCode).toBe(401);
    void login;
  });
});

describe("ciberseguridad: correos", () => {
  const base = { de: "Ana <ana@ejemplo.mx>", asunto: "Hola", fragmento: "Nos vemos mañana", autenticacion: "spf=pass dkim=pass dmarc=pass", enlaces: [], adjuntos: [] };

  it("un correo normal es seguro", () => {
    expect(clasificarCorreo(base).riesgo).toBe("seguro");
  });

  it("detecta suplantación, enlaces engañosos y adjuntos peligrosos", () => {
    const falso = { ...base, de: "BBVA Seguridad <alerta@bbva-soporte.xyz>", asunto: "Tu cuenta será bloqueada", autenticacion: "spf=fail dmarc=fail" };
    const r = clasificarCorreo(falso);
    expect(r.riesgo).toBe("peligroso");
    expect(r.razones.join(" ")).toContain("bbva");
    const enlace = clasificarCorreo({ ...base, enlaces: [{ texto: "https://www.mercadolibre.com.mx", url: "https://mercadolibre-pagos.ru/login" }] });
    expect(enlace.riesgo).toBe("peligroso");
    expect(clasificarCorreo({ ...base, adjuntos: ["factura.pdf.exe"] }).riesgo).toBe("peligroso");
    expect(clasificarCorreo({ ...base, adjuntos: ["fotos.zip"] }).riesgo).toBe("cuidado");
  });

  it("saca los enlaces con su texto visible", () => {
    const e = enlacesDe('<p><a href="https://evil.test/x">https://banco.mx</a></p>', "ver https://otro.test/y");
    expect(e).toEqual([
      { url: "https://evil.test/x", texto: "https://banco.mx" },
      { url: "https://otro.test/y", texto: "" },
    ]);
  });

  it("antes de enviar avisa de datos delicados y correos mal escritos", () => {
    const r = revisarEnvio("ana@gmial.com", "Datos", "mi tarjeta 4111 1111 1111 1111 y contraseña: hola123");
    expect(r.avisos.some((a) => a.includes("tarjeta"))).toBe(true);
    expect(r.avisos.some((a) => a.includes("contraseña"))).toBe(true);
    expect(r.avisos.some((a) => a.includes("gmail.com"))).toBe(true);
    expect(revisarEnvio("ana@gmail.com", "Hola", "nos vemos").avisos).toHaveLength(0);
  });

  it("el correo armado no permite meter encabezados", () => {
    const raw = Buffer.from(armarCorreo("yo@gmail.com", "ana@x.test\r\nBcc: espia@x.test", "Asunto\r\nBcc: otro@x.test", "Hola"), "base64url").toString();
    expect(raw.split("\r\n").filter((l) => l.startsWith("Bcc:"))).toHaveLength(0);
  });
});
