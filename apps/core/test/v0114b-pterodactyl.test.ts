import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTotpSecret, totpAt } from "../src/auth/totp.js";
import { vpsServers } from "../src/db/schema.js";
import { marcarInstaladas, nombreBlueprintAceptado, soloDescargables, type ExtensionTienda } from "../src/modules/blueprint-tienda.js";
import { bearer, createTestContext, seedUser, testCipher } from "./helpers.js";

vi.mock("../src/modules/vps/ssh.js", async (original) => {
  const real = await original<typeof import("../src/modules/vps/ssh.js")>();
  return {
    ...real,
    conectar: async () => ({ cliente: { end() {} }, huellaNueva: null }),
    ejecutar: async () => ({ codigo: 0, salida: "BP:1\nPV|1.11.10\nBV|beta-2026-06\n", error: "" }),
  };
});

const ZIP = Buffer.from(
  "UEsDBBQAAAAIAPSZVV1ysWZHiAAAAL8AAAAIAAAAY29uZi55bWxFjjEOgzAMRXdOEWUnhagTW9l7CIeYYqk4yDFwfZK2Usf/3pNs4jkNjTEMKw7GPlMUYl3MKOnMKLYoishKM6GUYP0F4e8j5kloU0pcgnHPE5iS5eoOlPzlvfOuq0hBXqiFBFRofefvbe+rgF2XVG88GGwDcSWunx2EZ4GffavDhTdEdNuy2eYCUEsDBBQAAAAIAPSZVV29L0lZEwAAACYCAAAUAAAAYWRtaW4vdmlldy5ibGFkZS5waHCzKbDLyM9JtNEvsLMZZY4ysTMBUEsBAhQDFAAAAAgA9JlVXXKxZkeIAAAAvwAAAAgAAAAAAAAAAAAAAIABAAAAAGNvbmYueW1sUEsBAhQDFAAAAAgA9JlVXb0vSVkTAAAAJgIAABQAAAAAAAAAAAAAAIABrgAAAGFkbWluL3ZpZXcuYmxhZGUucGhwUEsFBgAAAAACAAIAeAAAAPMAAAAAAA==",
  "base64",
);

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
});

async function preparar() {
  ctx = await createTestContext();
  const secret = generateTotpSecret();
  await seedUser(ctx.db, { email: "m@x.test", password: "clave-maestra-123", role: "maestra", totpSecret: secret });
  const res = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "m@x.test", password: "clave-maestra-123", totp: totpAt(secret, ctx.clock.now) } });
  await ctx.db.insert(vpsServers).values({ name: "panel", host: "203.0.113.20", username: "root", authType: "password", secretEnc: testCipher.encrypt("x"), hostKeyFingerprint: "SHA256:prueba" });
  return { c: ctx, h: bearer(res.json<{ accessToken: string }>().accessToken) };
}

function multipart(nombre: string, contenido: Buffer, tipo = "application/octet-stream") {
  const limite = "----misetupprueba";
  const cuerpo = Buffer.concat([
    Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n`),
    contenido,
    Buffer.from(`\r\n--${limite}--\r\n`),
  ]);
  return { payload: cuerpo, headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

const ext = (id: string, extra: Partial<ExtensionTienda> = {}): ExtensionTienda => ({
  id,
  nombre: id,
  resumen: "",
  autor: "a",
  imagen: null,
  origen: "github",
  pagina: `https://github.com/${id.replace(/^gh:/, "")}`,
  descarga: null,
  popularidad: 1,
  actualizada: null,
  ...extra,
});

describe("0.11.4b · Blueprint", () => {
  it("acepta un .blueprint subido aunque llegue como application/octet-stream", async () => {
    const { c, h } = await preparar();
    const m = multipart("modrinth-browser.blueprint", ZIP);
    const res = await c.app.inject({ method: "POST", url: "/api/ptero/admin/blueprint/revisar", headers: { ...h, ...m.headers }, payload: m.payload });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ info: { identificador: "modrinthbrowser" }, blueprint: true, compatible: "si" });
  });

  it("acepta el archivo del celular aunque venga sin extensión", async () => {
    const { c, h } = await preparar();
    const m = multipart("documento-1234", ZIP, "");
    const res = await c.app.inject({ method: "POST", url: "/api/ptero/admin/blueprint/revisar", headers: { ...h, ...m.headers }, payload: m.payload });
    expect(res.statusCode).toBe(200);
  });

  it("rechaza archivos con otra extensión", async () => {
    const { c, h } = await preparar();
    const m = multipart("foto.png", ZIP, "image/png");
    const res = await c.app.inject({ method: "POST", url: "/api/ptero/admin/blueprint/revisar", headers: { ...h, ...m.headers }, payload: m.payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/no es un archivo \.blueprint/);
    expect(nombreBlueprintAceptado("Tema Oscuro.BLUEPRINT")).toBe(true);
    expect(nombreBlueprintAceptado("respaldo.zip")).toBe(true);
    expect(nombreBlueprintAceptado("notas.txt")).toBe(false);
  });

  it("la tienda solo deja lo que se puede descargar", async () => {
    const lista = [ext("gh:a/con-release"), ext("bp:oficial", { origen: "blueprint", pagina: "https://blueprint.zip/x", descarga: "https://blueprint.zip/x.blueprint" }), ext("gh:a/sin-archivo"), ext("bp:pago", { origen: "blueprint", pagina: "https://builtbybit.com/x" })];
    const resolver = vi.fn(async (repo: string) => (repo === "a/con-release" ? "https://github.com/a/con-release/releases/download/v1/x.blueprint" : null));
    const r = await soloDescargables(lista, resolver);
    expect(r.extensiones.map((e) => e.id)).toEqual(["gh:a/con-release", "bp:oficial"]);
    expect(r.extensiones[0]!.descarga).toMatch(/\.blueprint$/);
    expect(r.incompleta).toBe(false);
    const limitado = await soloDescargables([ext("gh:a/b")], async () => {
      throw new Error("límite");
    });
    expect(limitado).toEqual({ extensiones: [], incompleta: true });
  });

  it("marca como instaladas las que ya están en el panel", () => {
    const lista = [ext("gh:a/modrinth", { nombre: "Modrinth Browser" }), ext("gh:a/temas", { nombre: "Temas" }), ext("gh:a/respaldos", { nombre: "Respaldos" })];
    const r = marcarInstaladas(lista, { "gh:a/respaldos": "mejoresrespaldos" }, [
      { id: "modrinthbrowser", nombre: "Modrinth Browser" },
      { id: "mejoresrespaldos", nombre: "Mejores respaldos" },
    ]);
    expect(r.map((e) => e.instalada)).toEqual([true, false, true]);
  });
});
