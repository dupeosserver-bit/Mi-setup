import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { siteVersions, sites } from "../src/db/schema.js";
import { actualizarSitioOficial, sembrarSitioOficial } from "../src/modules/sitios/oficial.js";
import { createTestContext, seedUser, TEST_SECRETS } from "./helpers.js";

let ctx: Awaited<ReturnType<typeof createTestContext>> | undefined;
let dir: string | undefined;
afterEach(async () => {
  await ctx?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  ctx = undefined;
  dir = undefined;
});

describe("0.11.4b · sitio oficial al día", () => {
  it("se actualiza con la versión y, si estaba publicado, se vuelve a publicar con el logo nuevo", async () => {
    dir = await mkdtemp(join(tmpdir(), "v0114b-"));
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir }) });
    await seedUser(ctx.db, { email: "m@x.test", password: "clave-de-prueba-123", role: "maestra" });
    await sembrarSitioOficial(ctx.deps);
    const [s] = await ctx.db.select().from(sites);
    await ctx.db.update(sites).set({ published: { paginas: [{ ruta: "/", titulo: "", html: "<p>viejo</p>", css: "" }] } }).where(eq(sites.id, s!.id));
    const [conPublicado] = await ctx.db.select().from(sites);
    expect(await actualizarSitioOficial(ctx.deps, conPublicado!)).toEqual({ publicado: true });
    const [nuevo] = await ctx.db.select().from(sites);
    const paginas = (nuevo!.published as { paginas: { ruta: string; html: string }[] }).paginas;
    expect(paginas.map((p) => p.ruta)).toEqual(["/", "/funciones", "/descargas", "/instalar", "/wiki", "/demo-en-vivo", "/comunidad"]);
    expect(paginas[0]!.html).toContain("/_archivos/");
    expect(paginas[0]!.html).not.toContain("/api/sitios/");
    expect(typeof (nuevo!.settings as { icono?: string }).icono).toBe("string");
    expect(await ctx.db.select().from(siteVersions).where(eq(siteVersions.siteId, s!.id))).toHaveLength(1);
  });
});
