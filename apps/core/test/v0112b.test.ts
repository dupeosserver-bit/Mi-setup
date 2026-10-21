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
