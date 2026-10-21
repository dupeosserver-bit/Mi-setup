import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
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
