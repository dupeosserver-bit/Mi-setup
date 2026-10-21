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

describe("0.11.2b · Blueprint", () => {
  const ZIP = Buffer.from("UEsDBBQAAAAIAPSZVV1ysWZHiAAAAL8AAAAIAAAAY29uZi55bWxFjjEOgzAMRXdOEWUnhagTW9l7CIeYYqk4yDFwfZK2Usf/3pNs4jkNjTEMKw7GPlMUYl3MKOnMKLYoishKM6GUYP0F4e8j5kloU0pcgnHPE5iS5eoOlPzlvfOuq0hBXqiFBFRofefvbe+rgF2XVG88GGwDcSWunx2EZ4GffavDhTdEdNuy2eYCUEsDBBQAAAAIAPSZVV29L0lZEwAAACYCAAAUAAAAYWRtaW4vdmlldy5ibGFkZS5waHCzKbDLyM9JtNEvsLMZZY4ysTMBUEsBAhQDFAAAAAgA9JlVXXKxZkeIAAAAvwAAAAgAAAAAAAAAAAAAAIABAAAAAGNvbmYueW1sUEsBAhQDFAAAAAgA9JlVXb0vSVkTAAAAJgIAABQAAAAAAAAAAAAAAIABrgAAAGFkbWluL3ZpZXcuYmxhZGUucGhwUEsFBgAAAAACAAIAeAAAAPMAAAAAAA==", "base64");

  it("detecta un .blueprint y lee su conf.yml", async () => {
    const { revisarBlueprint, compatibilidad, interpretarTiendaOficial, interpretarGithub, descargaPermitida } = await import("../src/modules/blueprint-tienda.js");
    const info = revisarBlueprint(ZIP);
    expect(info).toMatchObject({ identificador: "modrinthbrowser", nombre: "Modrinth Browser", version: "1.2.0", objetivo: "beta-2024-12", autor: "Ana" });
    expect(() => revisarBlueprint(Buffer.from("no es zip"))).toThrow(/blueprint/);
    expect(compatibilidad("beta-2024-12", "beta-2026-06")).toBe("si");
    expect(compatibilidad("beta-2026-09", "beta-2025-01")).toBe("no");
    expect(compatibilidad("", "beta-2025-01")).toBe("quizas");
    const oficial = interpretarTiendaOficial([
      { identifier: "gratis", name: "Gratis", summary: "x", platforms: { GITHUB: { url: "https://github.com/a/b", price: 0, downloads: 5 } } },
      { identifier: "pago", name: "De pago", platforms: { BUILTBYBIT: { url: "https://builtbybit.com/x", price: 5 } } },
    ]);
    expect(oficial.map((e) => e.nombre)).toEqual(["Gratis"]);
    expect(interpretarGithub({ items: [{ full_name: "a/b", name: "b", description: null, html_url: "https://github.com/a/b", stargazers_count: 3, pushed_at: "2026-01-01", owner: { login: "a" } }] })[0]).toMatchObject({ id: "gh:a/b", popularidad: 3 });
    expect(descargaPermitida("https://github.com/a/b/releases/download/v1/x.blueprint")).toBe(true);
    expect(descargaPermitida("https://evil.example/x.blueprint")).toBe(false);
    expect(descargaPermitida("http://github.com/x")).toBe(false);
  });

  it("el script del panel lee extensiones y versiones", async () => {
    const { SCRIPT_EXTENSIONES, leerExtensiones } = await import("../src/modules/ptero-admin.js");
    const { execFileSync } = await import("node:child_process");
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const base = mkdtempSync(join(tmpdir(), "panel-"));
    mkdirSync(join(base, "config"));
    writeFileSync(join(base, "config/app.php"), "<?php return [\n    'version' => '1.11.10',\n];");
    mkdirSync(join(base, ".blueprint/extensions/blueprint/private/db"), { recursive: true });
    writeFileSync(join(base, ".blueprint/extensions/blueprint/private/db/version"), "beta-2026-06\n");
    mkdirSync(join(base, ".blueprint/extensions/modrinthbrowser"), { recursive: true });
    writeFileSync(join(base, ".blueprint/extensions/modrinthbrowser/conf.yml"), 'info:\n  name: "Modrinth Browser"\n  version: "1.2.0"\n  author: "Ana"\n');
    const salida = execFileSync("bash", ["-c", SCRIPT_EXTENSIONES.replace("/var/www/pterodactyl", base)]).toString();
    const r = leerExtensiones(salida);
    expect(r.versionPanel).toBe("1.11.10");
    expect(r.versionBlueprint).toBe("beta-2026-06");
    expect(r.extensiones).toEqual([{ id: "modrinthbrowser", nombre: "Modrinth Browser", version: "1.2.0", autor: "Ana" }]);
    await rm(base, { recursive: true, force: true });
  });
});

describe("0.11.2b · encendido y servicios del VPS", () => {
  it("lee servicios y contenedores, y protege SSH y Mi Setup", async () => {
    const { interpretarServicios, comandoEnergia, textoConfirmacion } = await import("../src/modules/vps/energia.js");
    const r = interpretarServicios(
      "==SERVICIOS\nssh.service|running| OpenBSD Secure Shell server\nnginx.service|exited| A web server\n==DOCKER\nmisetup-core|running|Up 2 hours (healthy)|mi-setup-core\nweb|exited|Exited (0)|nginx\n==FIN\n",
    );
    expect(r.servicios.map((s) => s.nombre)).toEqual(["ssh.service", "nginx.service"]);
    expect(r.contenedores).toEqual([
      { nombre: "misetup-core", estado: "Up 2 hours (healthy)", imagen: "mi-setup-core", activo: true },
      { nombre: "web", estado: "Exited (0)", imagen: "nginx", activo: false },
    ]);
    expect(r.docker).toBe("si");
    expect(interpretarServicios("==SERVICIOS\n==DOCKER\nSIN_DOCKER\n==FIN").docker).toBe("no");

    expect(() => comandoEnergia({ tipo: "servicio", nombre: "ssh.service", operacion: "detener", confirmacion: "" }, true)).toThrow(/sin acceso/);
    expect(comandoEnergia({ tipo: "servicio", nombre: "ssh.service", operacion: "reiniciar", confirmacion: "" }, true)).toContain("systemctl restart 'ssh.service'");
    expect(() => comandoEnergia({ tipo: "contenedor", nombre: "misetup-db", operacion: "detener", confirmacion: "" }, true)).toThrow(/solo se reinician/);
    expect(comandoEnergia({ tipo: "contenedor", nombre: "misetup-core", operacion: "reiniciar", confirmacion: "" }, true)).toContain("nohup");
    expect(comandoEnergia({ tipo: "vps", confirmacion: "" }, false)).toContain("sudo -n systemctl reboot");
    expect(comandoEnergia({ tipo: "contenedor", nombre: "web", operacion: "iniciar", confirmacion: "" }, true)).toBe("docker start 'web'");
    expect(textoConfirmacion({ tipo: "vps", confirmacion: "" }, "Contabo")).toBe("Contabo");
    expect(textoConfirmacion({ tipo: "misetup", confirmacion: "" }, "Contabo")).toBe("MI SETUP");
  });
});

describe("0.11.2b · IA estilo Claude", () => {
  it("lee skills de Claude y de otras IA", async () => {
    const { leerSkill } = await import("../src/modules/ia/organizar.js");
    expect(leerSkill("---\nname: tono-amable\ndescription: cuando escribas a clientes\n---\n# Tono\nSé amable.")).toMatchObject({ nombre: "tono-amable", descripcion: "cuando escribas a clientes", contenido: "# Tono\nSé amable.", origen: "claude" });
    expect(leerSkill("# Revisor de código\nRevisa todo.", "rev.md")).toMatchObject({ nombre: "Revisor de código", origen: "otra" });
  });

  it("importa chats de Mi Setup y de Claude.ai sin traer herramientas", async () => {
    const { interpretarImportacion, limpiarBloques } = await import("../src/modules/ia/organizar.js");
    expect(limpiarBloques([{ type: "text", text: "hola" }, { type: "tool_use", name: "crear_nota", id: "x", input: {} }, { type: "image", source: { type: "url", url: "http://x" } }])).toEqual([
      { type: "text", text: "hola" },
      { type: "text", text: "[Propuesta de la IA: crear_nota]" },
    ]);
    const claude = interpretarImportacion([{ name: "Plan", chat_messages: [{ sender: "human", text: "hola" }, { sender: "assistant", text: "qué tal" }] }]);
    expect(claude[0]).toEqual({ titulo: "Plan", mensajes: [{ rol: "user", contenido: [{ type: "text", text: "hola" }] }, { rol: "assistant", contenido: [{ type: "text", text: "qué tal" }] }] });
    expect(() => interpretarImportacion({ algo: 1 })).toThrow();
  });

  it("proyectos, memoria y skills llegan a la IA; mover, exportar e importar chats", async () => {
    const vistos: string[] = [];
    dir = await mkdtemp(join(tmpdir(), "v0112b-ia-"));
    ctx = await createTestContext({
      config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir, ANTHROPIC_API_KEY: "sk-prueba" }),
      clienteIa: {
        async mensajes(p) {
          vistos.push(p.sistema);
          return { model: "claude-sonnet-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Listo" }], usage: { input_tokens: 5, output_tokens: 5 } };
        },
      },
    });
    await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { ia: "escritura" } as never });
    await seedUser(ctx.db, { email: "otra@x.test", password: "clave-de-prueba-123", permissions: { ia: "escritura" } as never });
    const entrar = async (email: string) => bearer((await ctx!.app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken);
    const h = await entrar("u@x.test");
    const otra = await entrar("otra@x.test");
    const app = ctx.app;
    const proyecto = (await app.inject({ method: "POST", url: "/api/ia/proyectos", headers: h, payload: { nombre: "MexicanLand", instrucciones: "Habla de servidores de Minecraft." } })).json<{ id: string }>();
    expect((await app.inject({ method: "POST", url: "/api/ia/memoria", headers: h, payload: { texto: "Me llamo Yahir y vivo en México" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/api/ia/skills", headers: h, payload: { nombre: "Breve", contenido: "Responde en 3 líneas." } })).statusCode).toBe(200);
    const chat = await app.inject({ method: "POST", url: "/api/ia/chat", headers: h, payload: { mensaje: "Hola", proyectoId: proyecto.id } });
    expect(chat.statusCode).toBe(200);
    const sistema = vistos.at(-1)!;
    expect(sistema).toContain("Me llamo Yahir");
    expect(sistema).toContain("Habla de servidores de Minecraft.");
    expect(sistema).toContain("Responde en 3 líneas.");
    expect(sistema).toContain("Solo PROPONES");
    const id = chat.json<{ conversacionId: string }>().conversacionId;
    const lista = (await app.inject({ method: "GET", url: `/api/ia/conversaciones?proyectoId=${proyecto.id}`, headers: h })).json<{ id: string }[]>();
    expect(lista.map((c) => c.id)).toEqual([id]);
    // La otra cuenta no ve ni mueve nada.
    expect((await app.inject({ method: "PATCH", url: `/api/ia/conversaciones/${id}`, headers: otra, payload: { proyectoId: null } })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/api/ia/memoria", headers: otra })).json<unknown[]>()).toHaveLength(0);
    // Mover a «sin proyecto».
    expect((await app.inject({ method: "PATCH", url: `/api/ia/conversaciones/${id}`, headers: h, payload: { proyectoId: null, titulo: "Saludo" } })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/ia/conversaciones-sueltas", headers: h })).json<{ titulo: string }[]>()[0]!.titulo).toBe("Saludo");
    // Exportar e importar en otra cuenta.
    const exportado = (await app.inject({ method: "GET", url: `/api/ia/conversaciones/${id}/exportar`, headers: h })).json<{ formato: string; mensajes: unknown[] }>();
    expect(exportado.formato).toBe("mi-setup-chat");
    expect(exportado.mensajes).toHaveLength(2);
    const imp = await app.inject({ method: "POST", url: "/api/ia/importar", headers: otra, payload: { datos: exportado } });
    expect(imp.json()).toEqual({ chats: 1, mensajes: 2 });
    // Borrar el proyecto deja los chats.
    expect((await app.inject({ method: "DELETE", url: `/api/ia/proyectos/${proyecto.id}`, headers: h })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/ia/conversaciones", headers: h })).json<unknown[]>()).toHaveLength(1);
  });

  it("solo modelos gratis de Ollama", async () => {
    const { modeloPermitido } = await import("../src/modules/ia/modelos-locales.js");
    expect(modeloPermitido("llama3.2:3b")).toBe(true);
    expect(modeloPermitido("hf.co/bartowski/model:Q4")).toBe(false);
    expect(modeloPermitido("gpt-oss:120b-cloud")).toBe(false);
    expect(modeloPermitido("rm -rf /")).toBe(false);
  });
});

function multipartSitio(nombre: string, tipo: string, contenido: Buffer | string) {
  const limite = "----prueba0112b";
  const cuerpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n`),
    Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido),
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  return { payload: cuerpo, headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

describe("0.11.2b · sitios: exportar e importar", () => {
  it("resuelve rutas y cambia ids", async () => {
    const { resolverRuta, cambiarIds, ponerArchivos } = await import("../src/modules/sitios/paquete.js");
    expect(resolverRuta("blog/post.html", "../img/a.png?v=2")).toBe("img/a.png");
    expect(resolverRuta("index.html", "./css/x.css")).toBe("css/x.css");
    expect(resolverRuta("index.html", "https://x.com/a.png")).toBeNull();
    expect(cambiarIds({ a: ["viejo-1", { b: "url/viejo-1" }] }, new Map([["viejo-1", "nuevo"]]))).toEqual({ a: ["nuevo", { b: "url/nuevo" }] });
    expect(ponerArchivos('<img src="{{archivo:img/a.png}}">', new Map([["img/a.png", "/api/x"]]))).toBe('<img src="/api/x">');
  });

  it("importa un sitio hecho en .zip sin scripts y con sus imágenes", async () => {
    const { leerImportacion } = await import("../src/modules/sitios/paquete.js");
    const { zipSync, strToU8 } = await import("fflate");
    const zip = zipSync({
      "mi-web/index.html": strToU8('<html><head><style>h1{color:red}</style><script>alert(1)</script></head><body><h1 onclick="x()">Hola</h1><img src="img/logo.png"><a href="contacto.html">C</a></body></html>'),
      "mi-web/contacto.html": strToU8("<body><p>Escríbenos</p></body>"),
      "mi-web/img/logo.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
    });
    const imp = leerImportacion("mi-web.zip", zip);
    expect(imp.tipo).toBe("html");
    if (imp.tipo !== "html") return;
    expect(imp.paginas).toHaveLength(2);
    const todo = imp.paginas.map((p) => p.html).join("");
    expect(todo).not.toContain("<script");
    expect(todo).not.toContain("onclick");
    expect(todo).toContain("{{archivo:img/logo.png}}");
    expect(imp.css).toContain("color:red");
    expect([...imp.archivos.keys()]).toEqual(["img/logo.png"]);
    expect(() => leerImportacion("x.exe", new Uint8Array([1, 2, 3]))).toThrow();
  });

  it("exporta todo y lo vuelve a importar con imágenes y tablas", async () => {
    const { h, otra } = await preparar({ sitios: "escritura" });
    const app = ctx!.app;
    const s = (await app.inject({ method: "POST", url: "/api/sitios", headers: h, payload: { nombre: "Pastelería", slug: "pasteleria" } })).json<{ id: string }>();
    const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 2)]);
    const sub = await app.inject({ method: "POST", url: `/api/sitios/${s.id}/archivos`, ...multipartSitio("logo.png", "image/png", PNG), headers: { ...h, ...multipartSitio("logo.png", "image/png", PNG).headers } });
    expect(sub.statusCode).toBe(200);
    const url = sub.json<{ url: string }>().url;
    await app.inject({ method: "PUT", url: `/api/sitios/${s.id}/borrador`, headers: h, payload: { borrador: { pages: [{ id: "p1", frames: [{ component: { components: [{ type: "image", src: url }] } }] }] } } });
    const paquete = await app.inject({ method: "GET", url: `/api/sitios/${s.id}/paquete`, headers: h });
    expect(paquete.statusCode).toBe(200);
    expect(paquete.headers["content-type"]).toContain("zip");
    // Otra cuenta lo importa: se crea con otra dirección y la imagen apunta al sitio nuevo.
    const m = multipartSitio("pasteleria-mi-setup.zip", "application/zip", paquete.rawPayload);
    const imp = await app.inject({ method: "POST", url: "/api/sitios/importar", payload: m.payload, headers: { ...otra, ...m.headers } });
    expect(imp.statusCode).toBe(200);
    const nuevo = imp.json<{ id: string; slug: string; publicado: string | null }>();
    expect(nuevo.slug).toBe("pasteleria-2");
    expect(nuevo.publicado).toBe(false);
    const detalle = (await app.inject({ method: "GET", url: `/api/sitios/${nuevo.id}`, headers: otra })).json<{ borrador: unknown }>();
    const texto = JSON.stringify(detalle.borrador);
    expect(texto).toContain(`/api/sitios/${nuevo.id}/archivos/`);
    expect(texto).not.toContain(s.id);
    const archivos = (await app.inject({ method: "GET", url: `/api/sitios/${nuevo.id}/archivos`, headers: otra })).json<unknown[]>();
    expect(archivos).toHaveLength(1);
    // Un .html suelto también se importa.
    const html = multipartSitio("landing.html", "text/html", "<body><h1>Mi landing</h1><script>x</script></body>");
    const r = await app.inject({ method: "POST", url: "/api/sitios/importar", payload: html.payload, headers: { ...h, ...html.headers } });
    expect(r.statusCode).toBe(200);
    const d = (await app.inject({ method: "GET", url: `/api/sitios/${r.json<{ id: string }>().id}`, headers: h })).json<{ borrador: { importado: { paginas: { html: string }[] } } }>();
    expect(d.borrador.importado.paginas[0]!.html).toContain("Mi landing");
    expect(d.borrador.importado.paginas[0]!.html).not.toContain("<script");
  });
});

describe("0.11.2b · edición pública", () => {
  it("no trae Pterodactyl, Redes, Host local, Casa ni Control remoto", async () => {
    const { can, fijarEdicion, sanitizePermissionMap } = await import("@mi-setup/shared");
    dir = await mkdtemp(join(tmpdir(), "v0112b-"));
    try {
      ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir, EDICION: "publica" }) });
      await seedUser(ctx.db, { email: "m@x.test", password: "clave-de-prueba-123", permissions: { notas: "lectura", pterodactyl: "lectura", casa: "lectura" } });
      const h = bearer((await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken);
      for (const url of ["/api/ptero/servidores", "/api/casa", "/api/hostlocal/servidores", "/api/redes/cuentas", "/api/control-remoto"]) {
        expect((await ctx.app.inject({ method: "GET", url, headers: h })).statusCode, url).toBe(404);
      }
      expect(ctx.gestorBots).toBeNull();
      // Ni la maestra los tiene, y no se pueden asignar.
      expect(can({ role: "maestra", isActive: true, permissions: {} }, "pterodactyl", "lectura")).toBe(false);
      expect(can({ role: "maestra", isActive: true, permissions: {} }, "notas", "administrar")).toBe(true);
      expect(sanitizePermissionMap({ casa: "lectura", notas: "lectura" })).toEqual({ notas: "lectura" });
      // Lo demás sigue funcionando.
      expect((await ctx.app.inject({ method: "GET", url: "/api/notas", headers: h })).statusCode).toBe(200);
    } finally {
      fijarEdicion("personal");
    }
  });
});

describe("0.11.2b · demo pública", () => {
  it("sirve la demo en /demo y deja mostrarla dentro de otro sitio", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    dir = await mkdtemp(join(tmpdir(), "v0112b-"));
    await mkdir(join(dir, "demo", "assets"), { recursive: true });
    await writeFile(join(dir, "demo", "index.html"), "<!doctype html><title>Demo</title>");
    await writeFile(join(dir, "demo", "assets", "a.js"), "console.log(1)");
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir, DEMO_DIR: join(dir, "demo") }) });
    for (const url of ["/demo", "/demo/", "/demo/notas"]) {
      const r = await ctx.app.inject({ method: "GET", url });
      expect(r.statusCode, url).toBe(200);
      expect(r.body).toContain("<title>Demo</title>");
      expect(r.headers["x-frame-options"]).toBeUndefined();
      expect(String(r.headers["content-security-policy"])).toContain("frame-ancestors 'self' https:");
    }
    expect((await ctx.app.inject({ method: "GET", url: "/demo/assets/a.js" })).statusCode).toBe(200);
    // La app normal sigue sin dejarse meter en marcos.
    expect(String((await ctx.app.inject({ method: "GET", url: "/api/health" })).headers["content-security-policy"])).toContain("frame-ancestors 'none'");
  });
});

describe("0.11.2b · comunidad del sitio oficial", () => {
  it("bloquea groserías (aunque las disfracen) sin confundir palabras normales", async () => {
    const { contieneGroseria, nombreReservado } = await import("../src/modules/sitios/comunidad.js");
    for (const t of ["eres un pendejo", "P3nd3j0", "p u t o", "hijodeputa", "fuuuck you", "puuto", "pinche app", "son unos cabrones", "what a b1tch"]) expect(contieneGroseria(t), t).toBe(true);
    for (const t of ["Hola, qué buena app", "computadora nueva", "una disputa", "Niger y Nigeria", "tarea pendiente", "buena reputación", "nightmare mode", "Escribo en español"]) expect(contieneGroseria(t), t).toBe(false);
    for (const n of ["JokeerYT", "Jokeer YT", "j0keeryt", "JokeerYT_Oficial", "JOKEERYT"]) expect(nombreReservado(n), n).toBe(true);
    expect(nombreReservado("Joker")).toBe(false);
    expect(nombreReservado("Ana")).toBe(false);
  });

  it("habla con ClamAV (INSTREAM) y entiende OK y FOUND", async () => {
    const { createServer } = await import("node:net");
    const { escanearConClamav } = await import("../src/modules/sitios/comunidad.js");
    const servidor = createServer((s) => {
      let datos = Buffer.alloc(0);
      s.on("data", (d) => {
        datos = Buffer.concat([datos, d]);
        // Fin del flujo: un trozo de largo 0.
        if (datos.length >= 14 && datos.subarray(-4).equals(Buffer.alloc(4))) s.end(datos.includes("VIRUS") ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
      });
    });
    await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", ok));
    const puerto = (servidor.address() as { port: number }).port;
    const flujo = async function* (t: string) {
      yield Buffer.from(t);
    };
    expect(await escanearConClamav("127.0.0.1", puerto, flujo("archivo normal"))).toEqual({ estado: "limpio", detalle: "Sin virus" });
    expect(await escanearConClamav("127.0.0.1", puerto, flujo("esto trae VIRUS"))).toEqual({ estado: "infectado", detalle: "Eicar-Test-Signature" });
    servidor.close();
    expect((await escanearConClamav("127.0.0.1", 1, flujo("x"), 2000)).estado).toBe("error");
  });

  it("proyectos con antivirus y aprobación, comentarios y nombre oficial", async () => {
    dir = await mkdtemp(join(tmpdir(), "v0112b-"));
    const escanear = async (datos: AsyncIterable<Uint8Array>) => {
      let todo = "";
      for await (const t of datos) todo += Buffer.from(t).toString("latin1");
      return todo.includes("VIRUS") ? { estado: "infectado" as const, detalle: "Prueba.Virus" } : { estado: "limpio" as const, detalle: "Sin virus" };
    };
    const pedidosGithub: string[] = [];
    const descargarGithub = async function* (usuario: string, repo: string) {
      pedidosGithub.push(`${usuario}/${repo}`);
      yield Buffer.from("PK\u0003\u0004 repo limpio");
    };
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir }), comunidad: { escanear, descargarGithub } });
    await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { sitios: "escritura" } });
    const h = bearer((await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken);
    const app = ctx.app;
    const s = (await app.inject({ method: "POST", url: "/api/sitios", headers: h, payload: { nombre: "Mi Setup", slug: "misetup" } })).json<{ id: string }>();
    await app.inject({ method: "POST", url: `/api/sitios/${s.id}/publicar`, headers: h, payload: { paginas: [{ ruta: "/", html: "<div data-ms-comunidad></div>", css: "" }] } });
    const H = { host: "misetup.mexicanland.net" };
    let ip = 0;
    const otraIp = () => ({ ...H, "x-forwarded-for": `10.1.0.${++ip}` });
    // Sin activarla, no hay comunidad.
    expect((await app.inject({ method: "GET", url: "/_ms/comunidad", headers: H })).statusCode).toBe(404);
    expect((await app.inject({ method: "PUT", url: `/api/sitios/${s.id}/ajustes`, headers: h, payload: { ajustes: { comunidad: { activa: true, oficial: "JokeerYT" } } } })).statusCode).toBe(200);

    // Comentarios: groserías y el nombre oficial se rechazan; lo demás aparece al momento.
    const comentar = (payload: object) => app.inject({ method: "POST", url: "/_ms/comunidad/comentario", headers: { ...H, "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 200)}` }, payload });
    expect((await comentar({ nombre: "Luis", texto: "eres un pendejo" })).statusCode).toBe(400);
    expect((await comentar({ nombre: "Jokeer YT", texto: "Soy el autor" })).statusCode).toBe(400);
    expect((await comentar({ nombre: "", texto: "¡Qué buena app!" })).statusCode).toBe(200);

    // Proyecto con enlace de GitHub: se revisa el .zip del repositorio y espera aprobación.
    const proyecto = await app.inject({ method: "POST", url: "/_ms/comunidad/proyecto", headers: otraIp(), payload: { nombre: "Sofía", titulo: "Mi Setup con tema morado", descripcion: "Cambié los colores", enlace: "https://github.com/sofia/mi-setup-morado" } });
    expect(proyecto.statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/_ms/comunidad/proyecto", headers: otraIp(), payload: { titulo: "Malo", enlace: "https://gitlab.com/x/y" } })).statusCode).toBe(400);
    const lista = async () => (await app.inject({ method: "GET", url: "/_ms/comunidad", headers: H })).json<{ oficial: string; proyectos: { id: string; titulo: string; archivo: { url: string } | null; comentarios: { autor: string; oficial: boolean }[] }[]; comentarios: { autor: string }[] }>();
    expect((await lista()).proyectos).toHaveLength(0);
    expect((await lista()).comentarios.map((c) => c.autor)).toEqual(["Anónimo"]);

    // .zip con virus: se marca y se borra; no se puede aprobar.
    const zipMalo = multipartSitio("version.zip", "application/zip", Buffer.from("PK\u0003\u0004 VIRUS"));
    const conCampos = (m: ReturnType<typeof multipartSitio>, titulo: string) => ({
      ...m,
      payload: Buffer.concat([Buffer.from(`------prueba0112b\r\nContent-Disposition: form-data; name="titulo"\r\n\r\n${titulo}\r\n`), m.payload]),
    });
    const malo = conCampos(zipMalo, "Versión rara");
    expect((await app.inject({ method: "POST", url: "/_ms/comunidad/proyecto", headers: { ...otraIp(), ...malo.headers }, payload: malo.payload })).statusCode).toBe(200);
    const bueno = conCampos(multipartSitio("bueno.zip", "application/zip", Buffer.from("PK\u0003\u0004 todo bien")), "Versión buena");
    expect((await app.inject({ method: "POST", url: "/_ms/comunidad/proyecto", headers: { ...otraIp(), ...bueno.headers }, payload: bueno.payload })).statusCode).toBe(200);
    const noZip = conCampos(multipartSitio("x.zip", "application/zip", Buffer.from("MZ ejecutable")), "Disfrazado");
    expect((await app.inject({ method: "POST", url: "/_ms/comunidad/proyecto", headers: { ...otraIp(), ...noZip.headers }, payload: noZip.payload })).statusCode).toBe(415);

    type Elemento = { id: string; titulo: string; tipo: string; estado: string; revision: string };
    let elementos: Elemento[] = [];
    for (let i = 0; i < 50; i++) {
      elementos = (await app.inject({ method: "GET", url: `/api/sitios/${s.id}/comunidad`, headers: h })).json<{ elementos: Elemento[] }>().elementos;
      if (elementos.filter((e) => e.tipo === "proyecto").every((e) => e.revision !== "pendiente")) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    const de = (t: string) => elementos.find((e) => e.titulo === t)!;
    expect(pedidosGithub).toEqual(["sofia/mi-setup-morado"]);
    expect(de("Mi Setup con tema morado").revision).toBe("limpio");
    expect(de("Versión rara").revision).toBe("infectado");
    expect(de("Versión buena").revision).toBe("limpio");
    const estado = (id: string, e: string) => app.inject({ method: "POST", url: `/api/sitios/${s.id}/comunidad/${id}/estado`, headers: h, payload: { estado: e } });
    expect((await estado(de("Versión rara").id, "aprobado")).statusCode).toBe(409);
    expect((await estado(de("Versión buena").id, "aprobado")).statusCode).toBe(200);
    expect((await estado(de("Mi Setup con tema morado").id, "aprobado")).statusCode).toBe(200);

    // Ya aprobados: se ven, el .zip se baja y el autor oficial responde.
    const vista = await lista();
    expect(vista.oficial).toBe("JokeerYT");
    expect(vista.proyectos.map((p) => p.titulo).sort()).toEqual(["Mi Setup con tema morado", "Versión buena"]);
    const conZip = vista.proyectos.find((p) => p.archivo)!;
    const baja = await app.inject({ method: "GET", url: conZip.archivo!.url, headers: H });
    expect(baja.statusCode).toBe(200);
    expect(baja.headers["content-disposition"]).toContain("attachment");
    const resp = await app.inject({ method: "POST", url: `/api/sitios/${s.id}/comunidad/responder`, headers: h, payload: { texto: "¡Gracias por compartir!", proyecto: conZip.id } });
    expect(resp.statusCode).toBe(200);
    const final = await lista();
    expect(final.proyectos.find((p) => p.id === conZip.id)!.comentarios).toEqual([expect.objectContaining({ autor: "JokeerYT", oficial: true })]);

    // Rechazar lo quita de la vista; borrar elimina también sus comentarios.
    expect((await estado(conZip.id, "rechazado")).statusCode).toBe(200);
    expect((await lista()).proyectos).toHaveLength(1);
    expect((await app.inject({ method: "DELETE", url: `/api/sitios/${s.id}/comunidad/${conZip.id}`, headers: h })).statusCode).toBe(200);
  });

  it("muestra las apps para descargar solo en sitios de la cuenta maestra", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { eq } = await import("drizzle-orm");
    const { users } = await import("../src/db/schema.js");
    dir = await mkdtemp(join(tmpdir(), "v0112b-"));
    await mkdir(join(dir, "descargas"), { recursive: true });
    for (const v of ["0.10.0", "0.11.0", "0.11.1", "0.11.2b"]) await writeFile(join(dir, "descargas", `MiSetup-${v}.apk`), "apk");
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir, DESCARGAS_DIR: join(dir, "descargas") }) });
    const id = await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { sitios: "escritura" } });
    const h = bearer((await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken);
    const app = ctx.app;
    const s = (await app.inject({ method: "POST", url: "/api/sitios", headers: h, payload: { nombre: "Mi Setup", slug: "misetup" } })).json<{ id: string }>();
    await app.inject({ method: "PUT", url: `/api/sitios/${s.id}/ajustes`, headers: h, payload: { ajustes: { descargas: true } } });
    await app.inject({ method: "POST", url: `/api/sitios/${s.id}/publicar`, headers: h, payload: { paginas: [{ ruta: "/", html: "<div data-ms-descargas></div>", css: "" }] } });
    const H = { host: "misetup.mexicanland.net" };
    expect((await app.inject({ method: "GET", url: "/_ms/descargas", headers: H })).statusCode).toBe(404);
    await ctx.db.update(users).set({ role: "maestra" }).where(eq(users.id, id));
    const r = (await app.inject({ method: "GET", url: "/_ms/descargas", headers: H })).json<{ archivos: { nombre: string; url: string }[] }>();
    // La nueva y las 2 anteriores.
    expect(r.archivos.map((a) => a.nombre)).toEqual(["MiSetup-0.11.2b.apk", "MiSetup-0.11.1.apk", "MiSetup-0.11.0.apk"]);
    expect((await app.inject({ method: "GET", url: r.archivos[0]!.url, headers: H })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/_ms/descargas/MiSetup-0.10.0.apk", headers: H })).statusCode).toBe(404);
  });
});

describe("0.11.2b · sitio oficial", () => {
  it("se crea sin publicar, sin nada de la edición personal, y se puede ver con su demo", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { eq } = await import("drizzle-orm");
    const { sites, siteAssets } = await import("../src/db/schema.js");
    const { sembrarSitioOficial } = await import("../src/modules/sitios/oficial.js");
    dir = await mkdtemp(join(tmpdir(), "v0112b-"));
    await mkdir(join(dir, "demo"), { recursive: true });
    await writeFile(join(dir, "demo", "index.html"), "<!doctype html><title>Demo de ejemplo</title>");
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir, DEMO_DIR: join(dir, "demo") }) });
    // Sin cuenta maestra todavía no hay a nombre de quién crearlo.
    await sembrarSitioOficial(ctx.deps);
    expect(await ctx.db.select().from(sites)).toHaveLength(0);
    await seedUser(ctx.db, { email: "m@x.test", password: "clave-de-prueba-123", role: "maestra" });
    await sembrarSitioOficial(ctx.deps);
    await sembrarSitioOficial(ctx.deps);
    const lista = await ctx.db.select().from(sites);
    expect(lista).toHaveLength(1);
    const s = lista[0]!;
    expect(s.slug).toBe("misetup");
    expect(s.published).toBeNull();
    const paginas = (s.draft as { importado: { paginas: { nombre: string; html: string }[] } }).importado.paginas;
    expect(paginas.map((p) => p.nombre)).toEqual(["Inicio", "Funciones", "Descargas", "Instalar", "Wiki", "Demo en vivo", "Comunidad"]);
    const todo = paginas.map((p) => p.html).join("\n");
    expect(todo).toContain("Hecho con IA");
    expect(todo).toContain("El autor no pide créditos");
    expect(todo).toContain("Esta es la página oficial");
    expect(todo).toContain("@JokeerYT_Oficia");
    expect(todo).toContain("data-ms-comunidad");
    expect(todo).toContain("data-ms-descargas");
    expect(todo).not.toMatch(/pterodactyl|discord|twitch|kick\b|minecraft|mi casa|control remoto|servidores en mi pc|mexicanland|<script/i);
    // Capturas de la demo subidas como imágenes del sitio.
    expect((await ctx.db.select().from(siteAssets).where(eq(siteAssets.siteId, s.id))).length).toBeGreaterThanOrEqual(8);

    // Publicado (como lo haría el editor), se ve en misetup.DOMINIO con su demo adentro.
    const rutas: Record<string, string> = { Inicio: "/", "Demo en vivo": "/demo-en-vivo", Comunidad: "/comunidad" };
    const publicadas = paginas.filter((p) => rutas[p.nombre]).map((p) => ({ ruta: rutas[p.nombre]!, titulo: p.nombre, html: p.html, css: "" }));
    await ctx.db.update(sites).set({ published: { paginas: publicadas } }).where(eq(sites.id, s.id));
    const H = { host: "misetup.mexicanland.net" };
    expect((await ctx.app.inject({ method: "GET", url: "/", headers: H })).body).toContain("página oficial");
    expect((await ctx.app.inject({ method: "GET", url: "/demo-en-vivo", headers: H })).body).toContain('src="/demo/"');
    const demo = await ctx.app.inject({ method: "GET", url: "/demo/finanzas", headers: H });
    expect(demo.statusCode).toBe(200);
    expect(demo.body).toContain("Demo de ejemplo");
    expect(String(demo.headers["content-security-policy"])).toContain("frame-ancestors 'self'");
    expect((await ctx.app.inject({ method: "GET", url: "/demo/..%2F..%2F..%2Fetc%2Fpasswd", headers: H })).body).not.toContain("root:");
    expect((await ctx.app.inject({ method: "GET", url: "/_ms/comunidad", headers: H })).statusCode).toBe(200);
  });
});
