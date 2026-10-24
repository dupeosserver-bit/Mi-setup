import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { partirVersion, readmeAlDia, versionAndroid } from "../../../scripts/al-dia.mjs";
import { loadConfig } from "../src/config.js";
import { armarSitioOficial } from "../src/modules/sitios/oficial.js";
import { VIDEO_EN_LINEA } from "../src/modules/sitios/publico.js";
import { bearer, createTestContext, seedUser, TEST_SECRETS } from "./helpers.js";

const RAIZ = join(import.meta.dirname, "..", "..", "..");
let ctx: Awaited<ReturnType<typeof createTestContext>> | undefined;
let dir: string | undefined;
afterEach(async () => {
  await ctx?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
  ctx = undefined;
  dir = undefined;
});

describe("0.11.5b · varias instalaciones en el mismo VPS", () => {
  it("los contenedores llevan el prefijo de su instalación y Caddy los busca por nombre", async () => {
    const compose = await readFile(join(RAIZ, "docker-compose.yml"), "utf8");
    expect(compose).not.toMatch(/container_name: misetup-/);
    expect(compose.match(/container_name: \$\{MISETUP_PREFIJO:-misetup\}-/g)).toHaveLength(6);
    expect(compose).toContain("name: misetup-compartida");
    const caddy = await readFile(join(RAIZ, "deploy", "Caddyfile"), "utf8");
    expect(caddy).not.toMatch(/\bcore:3000|\bntfy:80/);
    expect(caddy).toContain("{$CORE_DESTINO}");
    const instancia = await readFile(join(RAIZ, "deploy", "compose.instancia.yml"), "utf8");
    expect(instancia).toContain("external: true");
  });

  it("encuentra cada instalación, su carpeta y su prefijo", async () => {
    dir = await mkdtemp(join(tmpdir(), "v0115b-"));
    const base = join(dir, "mi-setup").replace(/\\/g, "/");
    for (const n of ["publica", "pruebas", "vieja"]) await mkdir(join(`${base}-${n}`, "app"), { recursive: true });
    await writeFile(`${base}-publica/.env`, "EDICION=publica\nMISETUP_PREFIJO=misetup-publica\n");
    await writeFile(`${base}-pruebas/.env`, "EDICION=publica\n");
    // «vieja» no tiene .env: no cuenta.
    const correr = (orden: string) =>
      execFileSync("bash", ["-c", `. "${join(RAIZ, "deploy", "instancias.sh").replace(/\\/g, "/")}"; ${orden}`], { env: { ...process.env, MISETUP_BASE: base }, encoding: "utf8" }).trim();
    // La personal siempre primero; el orden de las demás depende del idioma del sistema.
    const [primera, ...demas] = correr("todas_las_instancias").split("\n");
    expect([primera, ...demas.sort()]).toEqual(["personal", "pruebas", "publica"]);
    expect(correr("prefijo_de personal; prefijo_de publica; prefijo_de pruebas").split("\n")).toEqual(["misetup", "misetup-publica", "misetup-pruebas"]);
    expect(correr("base_de personal; base_de pruebas").split("\n")).toEqual([base, `${base}-pruebas`]);
    expect(correr("servicios_de publica")).toBe("misetup-db core");
  });
});

describe("0.11.5b · página oficial", () => {
  it("el inicio enseña el video del recorrido y el botón para usarla en el navegador", () => {
    const img = (n: string) => `/a/${n}`;
    const inicio = armarSitioOficial(img, [], "0.11.5b").paginas[0]!.html;
    expect(inicio).toMatch(/<video src="\/a\/recorrido" poster="\/a\/recorrido-foto" autoplay muted loop playsinline/);
    expect(inicio).toContain('href="/app/"');
    const sinVideo = armarSitioOficial((n) => (n === "recorrido" ? null : img(n)), [], "0.11.5b").paginas[0]!.html;
    expect(sinVideo).not.toContain("<video");
    expect(sinVideo).toContain('src="/a/inicio"');
  });

  it("los videos MP4 y WebM de un sitio se ven en la página; lo demás se descarga", () => {
    for (const t of ["video/mp4", "video/webm"]) expect(VIDEO_EN_LINEA.test(t), t).toBe(true);
    for (const t of ["video/x-msvideo", "application/zip", "text/html"]) expect(VIDEO_EN_LINEA.test(t), t).toBe(false);
  });
});

describe("0.11.5b · Mi Setup en el navegador (/app)", () => {
  it("solo la página oficial sirve la app en /app; en otros sitios /app es una página más", async () => {
    dir = await mkdtemp(join(tmpdir(), "v0115b-"));
    await mkdir(join(dir, "web", "assets"), { recursive: true });
    await writeFile(join(dir, "web", "index.html"), "<!doctype html><title>Mi Setup web</title>");
    await writeFile(join(dir, "web", "assets", "a.js"), "console.log(1)");
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir, WEB_DIR: join(dir, "web") }) });
    await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { sitios: "escritura" } });
    const h = bearer((await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken);
    const app = ctx.app;
    for (const slug of ["misetup", "tienda"]) {
      const s = (await app.inject({ method: "POST", url: "/api/sitios", headers: h, payload: { nombre: slug, slug } })).json<{ id: string }>();
      await app.inject({ method: "POST", url: `/api/sitios/${s.id}/publicar`, headers: h, payload: { paginas: [{ ruta: "/", html: "<p>inicio</p>", css: "" }, { ruta: "/app", html: "<p>pagina app de la tienda</p>", css: "" }] } });
    }
    expect((await app.inject({ method: "GET", url: "/api/sitios/dominio", headers: h })).json()).toEqual({ dominio: "mexicanland.net" });
    const oficial = { host: "misetup.mexicanland.net" };
    expect((await app.inject({ method: "GET", url: "/app", headers: oficial })).headers.location).toBe("/app/");
    for (const url of ["/app/", "/app/notas"]) {
      const r = await app.inject({ method: "GET", url, headers: oficial });
      expect(r.statusCode, url).toBe(200);
      expect(r.body).toContain("<title>Mi Setup web</title>");
      const csp = String(r.headers["content-security-policy"]);
      expect(csp).toContain("connect-src 'self' https: wss:");
      expect(csp).toContain("frame-ancestors 'none'");
    }
    expect((await app.inject({ method: "GET", url: "/app/assets/a.js", headers: oficial })).statusCode).toBe(200);
    const tienda = await app.inject({ method: "GET", url: "/app", headers: { host: "tienda.mexicanland.net" } });
    expect(tienda.statusCode).toBe(200);
    expect(tienda.body).toContain("pagina app de la tienda");
  });

  it("cada instalación acepta la página oficial por CORS (y se puede apagar)", async () => {
    const preguntar = async (extra: Record<string, string>) => {
      ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ...extra }) });
      const r = await ctx.app.inject({ method: "OPTIONS", url: "/api/auth/login", headers: { origin: "https://misetup.mexicanland.net", "access-control-request-method": "POST" } });
      await ctx.close();
      ctx = undefined;
      return r.headers["access-control-allow-origin"];
    };
    expect(await preguntar({})).toBe("https://misetup.mexicanland.net");
    expect(await preguntar({ APP_WEB_ORIGEN: "" })).toBeUndefined();
  });
});

describe("0.11.5b · pnpm al-dia", () => {
  it("parte la versión, sube Android una sola vez y pone el README al día", () => {
    expect(partirVersion("0.11.6b")).toEqual({ version: "0.11.6", etapa: "b" });
    expect(() => partirVersion("once")).toThrow(/inválida/);
    const gradle = 'versionCode 15\n        versionName "0.11.5b"';
    const nuevo = versionAndroid(gradle, "0.11.6b");
    expect(nuevo).toContain("versionCode 16");
    expect(nuevo).toContain('versionName "0.11.6b"');
    expect(versionAndroid(nuevo, "0.11.6b")).toBe(nuevo);
    const readme = "> Versión actual: **0.11.4b** ·\n- `MiSetup-0.11.4.exe`\n- `MiSetup-0.11.4b.apk`";
    expect(readmeAlDia(readme, "0.11.6", "b")).toBe("> Versión actual: **0.11.6b** ·\n- `MiSetup-0.11.6.exe`\n- `MiSetup-0.11.6b.apk`");
  });
});

describe("0.11.5b · arreglos después de probarla", () => {
  it("el celular solo ve como «nueva» la versión del APK que de verdad se baja", async () => {
    dir = await mkdtemp(join(tmpdir(), "v0115b-"));
    await writeFile(join(dir, "MiSetup-0.11.4b.apk"), "apk viejo");
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, DESCARGAS_DIR: dir }) });
    await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123" });
    const h = bearer((await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } })).json<{ accessToken: string }>().accessToken);
    const leer = async () => (await ctx!.app.inject({ method: "GET", url: "/api/actualizaciones", headers: h })).json<{ version: string; servidor: string; apk: { nombre: string; version: string } | null }>();
    // El servidor ya es 0.11.5b pero el APK nuevo todavía no se sube: no se ofrece el viejo como nuevo.
    let r = await leer();
    expect(r.version).toBe("0.11.4b");
    expect(r.servidor).toMatch(/^\d+\.\d+\.\d+[ab]?$/);
    expect(r.apk?.nombre).toBe("MiSetup-0.11.4b.apk");
    await writeFile(join(dir, "MiSetup-0.11.5b.apk"), "apk nuevo");
    r = await leer();
    expect(r.version).toBe("0.11.5b");
    expect(r.apk?.nombre).toBe("MiSetup-0.11.5b.apk");
  });

  it("el sitio oficial se pone al día solo con cada versión (aunque esté publicado) y guarda lo de antes", async () => {
    const { eq } = await import("drizzle-orm");
    const { sites, siteVersions } = await import("../src/db/schema.js");
    const { sembrarSitioOficial } = await import("../src/modules/sitios/oficial.js");
    const { setSetting, getSetting } = await import("../src/modules/settings.js");
    dir = await mkdtemp(join(tmpdir(), "v0115b-"));
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir }) });
    await seedUser(ctx.db, { email: "m@x.test", password: "clave-de-prueba-123", role: "maestra" });
    await sembrarSitioOficial(ctx.deps);
    const [s] = await ctx.db.select().from(sites);
    // Publicado y editado a mano con una versión vieja de Mi Setup.
    await ctx.db.update(sites).set({ draft: { pages: [] }, published: { paginas: [{ ruta: "/", titulo: "", html: "<p>viejo</p>", css: "" }] }, updatedAt: new Date() }).where(eq(sites.id, s!.id));
    const guardado = await getSetting<{ sitio: string; version: string; actualizado: string }>(ctx.db, "sitio_oficial");
    await setSetting(ctx.db, "sitio_oficial", { ...guardado!, version: "0.11.4b" }, new Date());
    await sembrarSitioOficial(ctx.deps);
    const [nuevo] = await ctx.db.select().from(sites);
    expect((nuevo!.published as { paginas: { html: string }[] }).paginas[0]!.html).toContain('href="/app/"');
    const notas = (await ctx.db.select().from(siteVersions).where(eq(siteVersions.siteId, s!.id))).map((v) => v.note);
    expect(notas.some((n) => n.startsWith("Antes de actualizar"))).toBe(true);
    // Con «Actualizar sola» apagado ya no se toca.
    await ctx.db.update(sites).set({ settings: { ...(nuevo!.settings as object), actualizarSola: false }, published: { paginas: [{ ruta: "/", titulo: "", html: "<p>mío</p>", css: "" }] } }).where(eq(sites.id, s!.id));
    await setSetting(ctx.db, "sitio_oficial", { ...guardado!, version: "0.11.4b" }, new Date());
    await sembrarSitioOficial(ctx.deps);
    const [quieto] = await ctx.db.select().from(sites);
    expect((quieto!.published as { paginas: { html: string }[] }).paginas[0]!.html).toBe("<p>mío</p>");
  });
});

describe("0.11.5b · Spotify 2026", () => {
  it("lee playlists con `items`/`item` (nuevo) y con `tracks`/`track` (viejo)", async () => {
    const { mapearPlaylist, pistasDePlaylist } = await import("../src/modules/spotify.js");
    const base = { id: "p1", uri: "spotify:playlist:p1", name: "Mía" };
    expect(mapearPlaylist({ ...base, items: { total: 12 } }).total).toBe(12);
    expect(mapearPlaylist({ ...base, tracks: { total: 7 } }).total).toBe(7);
    const pista = (id: string) => ({ id, uri: `spotify:track:${id}`, name: id, artists: [{ name: "A" }] });
    expect(pistasDePlaylist([{ item: pista("n1") }, { track: pista("v1") }, { item: null }]).map((p) => p.id)).toEqual(["n1", "v1"]);
  });
});

describe("0.11.5b · revisar otro servidor", () => {
  it("/api/health responde a cualquier app de Mi Setup; el resto de la API sigue cerrada", async () => {
    ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS }) });
    const ajeno = { origin: "https://setup.otro-dominio.com" };
    const salud = await ctx.app.inject({ method: "GET", url: "/api/health", headers: ajeno });
    expect(salud.statusCode).toBe(200);
    expect(salud.headers["access-control-allow-origin"]).toBe("*");
    expect(salud.headers["access-control-allow-credentials"]).toBeUndefined();
    const previa = await ctx.app.inject({ method: "OPTIONS", url: "/api/health", headers: { ...ajeno, "access-control-request-method": "GET" } });
    expect(previa.headers["access-control-allow-origin"]).toBe("*");
    const privada = await ctx.app.inject({ method: "OPTIONS", url: "/api/auth/login", headers: { ...ajeno, "access-control-request-method": "POST" } });
    expect(privada.headers["access-control-allow-origin"]).toBeUndefined();
    const propia = await ctx.app.inject({ method: "OPTIONS", url: "/api/auth/login", headers: { origin: "https://misetup.mexicanland.net", "access-control-request-method": "POST" } });
    expect(propia.headers["access-control-allow-origin"]).toBe("https://misetup.mexicanland.net");
  });
});
