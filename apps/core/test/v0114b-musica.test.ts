import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { SCOPES_SPOTIFY, mapearDispositivos, mapearEstado, mapearPista, paginar, parecidasSinRepetir, pkce } from "../src/modules/spotify.js";
import { bearer, createTestContext, seedUser, TEST_SECRETS } from "./helpers.js";

type Ctx = Awaited<ReturnType<typeof createTestContext>>;
let ctx: Ctx | undefined;
let dir: string | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await ctx?.close();
  ctx = undefined;
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

async function preparar(extra: Record<string, string> = {}) {
  dir = await mkdtemp(join(tmpdir(), "musica-"));
  ctx = await createTestContext({ config: loadConfig({ NODE_ENV: "test", ...TEST_SECRETS, ARCHIVOS_DIR: dir, ...extra }) });
  await seedUser(ctx.db, { email: "u@x.test", password: "clave-de-prueba-123", permissions: { musica: "escritura" } as never });
  const r = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: "u@x.test", password: "clave-de-prueba-123" } });
  return bearer(r.json<{ accessToken: string }>().accessToken);
}

function multipart(nombre: string, tipo: string) {
  const limite = "----limite123";
  const cuerpo = `--${limite}\r\nContent-Disposition: form-data; name="archivo"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\nxyz\r\n--${limite}--\r\n`;
  return { payload: cuerpo, headers: { "content-type": `multipart/form-data; boundary=${limite}` } };
}

const pista = (id: string, artista = "Artista", artistaId = "art1") => ({ id, uri: `spotify:track:${id}`, name: `Canción ${id}`, duration_ms: 1000, artists: [{ id: artistaId, name: artista }], album: { name: "Álbum", images: [{ url: "grande.jpg" }, { url: "chica.jpg" }] } });
const respuesta = (cuerpo: unknown, status = 200) => new Response(cuerpo === null ? null : JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

describe("0.11.4b música: lógica sin red", () => {
  it("pide los permisos de Spotify necesarios y usa PKCE", () => {
    for (const s of ["user-read-playback-state", "user-modify-playback-state", "user-library-modify", "playlist-read-private", "user-read-recently-played", "user-top-read"]) expect(SCOPES_SPOTIFY).toContain(s);
    const { verificador, reto } = pkce();
    expect(verificador.length).toBeGreaterThanOrEqual(43);
    expect(reto).toBe(createHash("sha256").update(verificador).digest("base64url"));
  });

  it("parte tu música en páginas de 6", () => {
    const ocho = Array.from({ length: 8 }, (_, i) => i);
    expect(paginar(ocho, 1)).toEqual({ items: [0, 1, 2, 3, 4, 5], total: 8, pagina: 1, paginas: 2 });
    expect(paginar(ocho, 2).items).toEqual([6, 7]);
    expect(paginar(ocho, 9).pagina).toBe(2);
    expect(paginar(Array.from({ length: 6 }, (_, i) => i), 1).paginas).toBe(1);
    expect(paginar([], 1)).toEqual({ items: [], total: 0, pagina: 1, paginas: 1 });
  });

  it("convierte las respuestas de Spotify", () => {
    const p = mapearPista(pista("a1"));
    expect(p).toMatchObject({ id: "a1", uri: "spotify:track:a1", nombre: "Canción a1", artistas: "Artista", artistaId: "art1", portada: "grande.jpg", portadaChica: "chica.jpg" });
    const e = mapearEstado({ is_playing: true, progress_ms: 500, device: { name: "PC", type: "Computer" }, item: pista("a1") }, true);
    expect(e).toMatchObject({ sonando: true, equipo: "PC", cancion: { id: "a1", progreso: 500, guardada: true } });
    expect(mapearEstado(null).cancion).toBeNull();
    const d = mapearDispositivos([
      { id: "1", name: "Celular", type: "Smartphone", is_active: true, volume_percent: 50 },
      { id: null, name: "Sin id", type: "Speaker", is_active: false },
      { id: "3", name: "Restringido", type: "TV", is_active: false, is_restricted: true },
    ]);
    expect(d).toEqual([{ id: "1", nombre: "Celular", tipo: "smartphone", activo: true, volumen: 50 }]);
    const lista = ["a", "b", "a", "c", "d"].map((id) => mapearPista(pista(id)));
    expect(parecidasSinRepetir(lista, ["b"], 2).map((x) => x.id)).toEqual(["a", "c"]);
  });
});

describe("0.11.4b música: Spotify con respuestas simuladas", () => {
  it("conecta con PKCE, guarda en la biblioteca y la varita llena la cola aunque no haya recomendaciones", async () => {
    const h = await preparar({ SPOTIFY_CLIENT_ID: "cliente-prueba" });
    const app = ctx!.app;
    const llamadas: { url: string; metodo: string; cuerpo?: string }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (entrada, init) => {
      const url = String(entrada);
      llamadas.push({ url, metodo: init?.method ?? "GET", ...(typeof init?.body === "string" ? { cuerpo: init.body } : init?.body ? { cuerpo: String(init.body) } : {}) });
      if (url.startsWith("https://accounts.spotify.com/api/token")) return respuesta({ access_token: "acceso", refresh_token: "refresco", expires_in: 3600 });
      if (url.includes("/me/player/queue?uri=")) return respuesta(null, 204);
      if (url.includes("/me/player/queue")) return respuesta({ queue: [pista("q1")] });
      if (url.includes("/me/player?market")) return respuesta({ is_playing: true, progress_ms: 10, device: { name: "PC" }, item: pista("actual", "Peso Pluma", "art9") });
      if (url.includes("/me/tracks/contains")) return respuesta([true]);
      if (url.includes("/me/tracks?ids=")) return respuesta(null, 200);
      if (url.includes("/recommendations")) return respuesta({ error: { status: 404 } }, 404);
      if (url.includes("/artists/art9/top-tracks")) return respuesta({ tracks: [pista("actual"), pista("q1"), ...["t1", "t2", "t3"].map((id) => pista(id))] });
      if (url.includes("/search")) return respuesta({ tracks: { items: ["s1", "t1", "s2"].map((id) => pista(id)) } });
      return respuesta({}, 500);
    });

    const conectar = (await app.inject({ method: "GET", url: "/api/musica/spotify/conectar", headers: h })).json<{ url: string }>();
    const u = new URL(conectar.url);
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBeTruthy();
    expect(u.searchParams.get("scope")).toContain("user-library-modify");
    const cb = await app.inject({ method: "GET", url: `/api/musica/spotify/callback?code=abc&state=${u.searchParams.get("state")}` });
    expect(cb.body).toContain("Spotify conectado");
    const token = llamadas.find((l) => l.url.includes("/api/token"))!;
    expect(token.cuerpo).toContain("code_verifier=");
    expect(token.cuerpo).toContain("client_id=cliente-prueba");

    const estado = (await app.inject({ method: "GET", url: "/api/musica/spotify/estado", headers: h })).json<{ cancion: { id: string; guardada: boolean } }>();
    expect(estado.cancion).toMatchObject({ id: "actual", guardada: true });

    const g = await app.inject({ method: "PUT", url: "/api/musica/spotify/biblioteca/actual0000001", headers: h, payload: { guardar: false } });
    expect(g.json()).toEqual({ guardada: false });
    expect(llamadas.some((l) => l.url.includes("/me/tracks?ids=actual0000001") && l.metodo === "DELETE")).toBe(true);

    const v = (await app.inject({ method: "POST", url: "/api/musica/spotify/parecidas", headers: h })).json<{ agregadas: number; canciones: { id: string }[] }>();
    expect(v.canciones.map((c) => c.id)).toEqual(["t1", "t2", "t3", "s1", "s2"]);
    expect(llamadas.filter((l) => l.url.includes("/me/player/queue?uri=") && l.metodo === "POST")).toHaveLength(5);
  });
});

describe("0.11.4b música: tu música del servidor", () => {
  it("acepta MP3 y MP4 y entrega páginas de 6", async () => {
    const h = await preparar();
    const app = ctx!.app;
    for (let i = 0; i < 8; i++) {
      const a = i % 2 ? multipart(`clip${i}.mp4`, "video/mp4") : multipart(`cancion${i}.mp3`, "audio/mpeg");
      expect((await app.inject({ method: "POST", url: "/api/media/musica", headers: { ...h, ...a.headers }, payload: a.payload })).statusCode).toBe(200);
    }
    const web = multipart("x.webm", "video/webm");
    expect((await app.inject({ method: "POST", url: "/api/media/musica", headers: { ...h, ...web.headers }, payload: web.payload })).statusCode).toBe(415);
    const p1 = (await app.inject({ method: "GET", url: "/api/media/musica?pagina=1", headers: h })).json<{ items: unknown[]; total: number; paginas: number }>();
    expect(p1.items).toHaveLength(6);
    expect(p1.total).toBe(8);
    expect(p1.paginas).toBe(2);
    const p2 = (await app.inject({ method: "GET", url: "/api/media/musica?pagina=2", headers: h })).json<{ items: { tipoArchivo: string }[] }>();
    expect(p2.items).toHaveLength(2);
    expect((await app.inject({ method: "GET", url: "/api/media/musica", headers: h })).json<unknown[]>()).toHaveLength(8);
  });
});
