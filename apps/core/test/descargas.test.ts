import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
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

describe("descargas de las apps", () => {
  it("lista con sesión, descarga pública solo de .apk/.exe y sin salir de la carpeta", async () => {
    dir = await mkdtemp(join(tmpdir(), "descargas-"));
    await writeFile(join(dir, "MiSetup.apk"), "apk-de-prueba");
    await writeFile(join(dir, "secreto.env"), "NO");
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, DESCARGAS_DIR: dir }) });

    expect((await ctx.app.inject({ method: "GET", url: "/api/descargas" })).statusCode).toBe(401);
    await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123" });
    const login = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } });
    const h = bearer(login.json<{ accessToken: string }>().accessToken);
    const lista = (await ctx.app.inject({ method: "GET", url: "/api/descargas", headers: h })).json<{ archivos: { nombre: string; tipo: string }[] }>();
    expect(lista.archivos).toEqual([expect.objectContaining({ nombre: "MiSetup.apk", tipo: "android" })]);

    const bajada = await ctx.app.inject({ method: "GET", url: "/api/descargas/MiSetup.apk" });
    expect(bajada.statusCode).toBe(200);
    expect(bajada.body).toBe("apk-de-prueba");
    expect(bajada.headers["content-type"]).toContain("android");
    for (const malo of ["secreto.env", "..%2Fsecreto.env", "..%2F..%2Fetc%2Fpasswd.apk", "nada.apk"]) {
      expect((await ctx.app.inject({ method: "GET", url: `/api/descargas/${malo}` })).statusCode, malo).toBe(404);
    }
  });
});
