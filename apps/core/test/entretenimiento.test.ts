import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { firmarMedia, verificarMedia } from "../src/modules/entretenimiento.js";
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

async function preparar(extra: Record<string, string> = {}) {
  dir = await mkdtemp(join(tmpdir(), "media-"));
  ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir, ...extra }) });
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { peliculas: "escritura", musica: "escritura", videos: "lectura" } as never });
  const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } });
  return bearer(r.json<{ accessToken: string }>().accessToken);
}

function multipart(nombre: string, tipo: string, contenido: string) {
  const limite = "----limite123";
  const cuerpo = `--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n${contenido}\r\n--${limite}--\r\n`;
  return { payload: cuerpo, headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

describe("enlaces firmados", () => {
  it("caducan y no sirven para otro archivo", () => {
    const t = firmarMedia("secreto", "a", 2000);
    expect(verificarMedia("secreto", "a", t, 1000)).toBe(true);
    expect(verificarMedia("secreto", "a", t, 3000)).toBe(false);
    expect(verificarMedia("secreto", "b", t, 1000)).toBe(false);
    expect(verificarMedia("otro", "a", t, 1000)).toBe(false);
    expect(verificarMedia("secreto", "a", "basura", 1000)).toBe(false);
  });
});

describe("tu música", () => {
  it("sube, reproduce por partes (Range) y respeta permisos", async () => {
    const h = await preparar();
    const app = ctx!.app;
    const noAudio = multipart("nota.txt", "text/plain", "hola");
    expect((await app.inject({ method: "POST", url: "/api/media/musica", headers: { ...h, ...noAudio.headers }, payload: noAudio.payload })).statusCode).toBe(415);
    const cancion = multipart("Mi canción.mp3", "audio/mpeg", "0123456789");
    expect((await app.inject({ method: "POST", url: "/api/media/musica", headers: { ...h, ...cancion.headers }, payload: cancion.payload })).statusCode).toBe(200);
    // Videos solo en lectura: no puede subir.
    const video = multipart("v.mp4", "video/mp4", "x");
    expect((await app.inject({ method: "POST", url: "/api/media/videos", headers: { ...h, ...video.headers }, payload: video.payload })).statusCode).toBe(403);

    const [m] = (await app.inject({ method: "GET", url: "/api/media/musica", headers: h })).json<{ id: string; titulo: string; url: string }[]>();
    expect(m?.titulo).toBe("Mi canción");
    const completo = await app.inject({ method: "GET", url: m!.url });
    expect(completo.statusCode).toBe(200);
    expect(completo.body).toBe("0123456789");
    const parte = await app.inject({ method: "GET", url: m!.url, headers: { range: "bytes=2-4" } });
    expect(parte.statusCode).toBe(206);
    expect(parte.body).toBe("234");
    expect(parte.headers["content-range"]).toBe("bytes 2-4/10");
    expect((await app.inject({ method: "GET", url: `/api/media/archivo/${m!.id}?t=1.falsa` })).statusCode).toBe(403);

    await app.inject({ method: "DELETE", url: `/api/media/archivo/${m!.id}`, headers: h });
    expect((await app.inject({ method: "GET", url: "/api/media/musica", headers: h })).json<unknown[]>()).toHaveLength(0);
  });
});

describe("películas", () => {
  it("sin clave de TMDB avisa qué falta; la lista por ver no duplica", async () => {
    const h = await preparar();
    const app = ctx!.app;
    const r = await app.inject({ method: "GET", url: "/api/peliculas/buscar?q=batman", headers: h });
    expect(r.json<{ error: string }>().error).toContain("TMDB_API_KEY");
    const p = { tmdbId: 550, tipo: "movie", titulo: "El club de la pelea", poster: null };
    await app.inject({ method: "POST", url: "/api/peliculas/por-ver", headers: h, payload: p });
    await app.inject({ method: "POST", url: "/api/peliculas/por-ver", headers: h, payload: p });
    const lista = (await app.inject({ method: "GET", url: "/api/peliculas/por-ver", headers: h })).json<{ id: string; vista: boolean }[]>();
    expect(lista).toHaveLength(1);
    await app.inject({ method: "PATCH", url: `/api/peliculas/por-ver/${lista[0]!.id}`, headers: h, payload: { vista: true } });
    expect((await app.inject({ method: "GET", url: "/api/peliculas/por-ver", headers: h })).json<{ vista: boolean }[]>()[0]?.vista).toBe(true);
  });

  it("Spotify sin configurar se reporta sin romper", async () => {
    const h = await preparar();
    const r = await ctx!.app.inject({ method: "GET", url: "/api/musica/spotify/estado", headers: h });
    expect(r.json()).toEqual({ conectado: false, configurado: false });
  });
});

describe("respaldo de mis datos", () => {
  it("descarga solo lo tuyo en JSON", async () => {
    const h = await preparar();
    const app = ctx!.app;
    await app.inject({ method: "POST", url: "/api/peliculas/por-ver", headers: h, payload: { tmdbId: 1, tipo: "tv", titulo: "Serie", poster: null } });
    const r = await app.inject({ method: "GET", url: "/api/respaldos/mis-datos", headers: h });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-disposition"]).toContain("mis-datos-");
    const d = r.json<{ cuenta: { correo: string }; porVer: unknown[]; notas: unknown[] }>();
    expect(d.cuenta.correo).toBe("u@x.test");
    expect(d.porVer).toHaveLength(1);
    // Un usuario normal no puede bajar la base completa.
    expect((await app.inject({ method: "GET", url: "/api/respaldos/base/descargar/x.sql", headers: h })).statusCode).toBeGreaterThanOrEqual(400);
  });
});
