/**
 * Entretenimiento:
 * - Películas y series (TMDB): buscar, dónde verlas en México, estrenos y
 *   siguiente capítulo; lista "por ver".
 * - Tu música y tus videos subidos al VPS, con reproducción por enlace firmado
 *   (el reproductor no puede mandar la sesión) y "seguir viendo".
 * - Spotify: conectar tu cuenta y controlar lo que suena.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { mediaFiles, watchlist } from "../db/schema.js";
import { HttpError, missingConfig } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, requireCipher, type ModuleDeps } from "./common.js";
import { disposicion, carpetaArchivos } from "./herramientas.js";
import { deleteSetting, getSetting, setSetting } from "./settings.js";
import {
  SCOPES_SPOTIFY,
  mapearDispositivos,
  mapearEstado,
  mapearPista,
  mapearPlaylist,
  paginar,
  parecidasSinRepetir,
  pistasDePlaylist,
  pkce,
  type DispositivoSp,
  type ElementoPlaylistSp,
  type Pista,
  type PistaSp,
  type PlaylistSp,
  type ReproductorSp,
} from "./spotify.js";

const MAX_MEDIA = 4 * 1024 * 1024 * 1024;
const TIPOS = ["musica", "videos"] as const;
const IMG = "https://image.tmdb.org/t/p/w342";

// ---------------------------------------------------------------- enlaces firmados

/** Enlace que caduca para reproducir un archivo (los <audio>/<video> no mandan la sesión). */
export function firmarMedia(secreto: string, id: string, vence: number): string {
  const firma = createHmac("sha256", secreto).update(`${id}.${vence}`).digest("base64url");
  return `${vence}.${firma}`;
}

export function verificarMedia(secreto: string, id: string, token: string, ahora: number): boolean {
  const [venceTxt, firma] = token.split(".");
  const vence = Number(venceTxt);
  if (!firma || !Number.isFinite(vence) || vence < ahora) return false;
  const esperada = Buffer.from(firmarMedia(secreto, id, vence).split(".")[1]!);
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

// ---------------------------------------------------------------- TMDB

async function tmdb<T>(deps: ModuleDeps, ruta: string, params: Record<string, string> = {}): Promise<T> {
  const clave = deps.config.env.TMDB_API_KEY;
  if (!clave) throw missingConfig("TMDB_API_KEY");
  const url = new URL(`https://api.themoviedb.org/3${ruta}`);
  url.searchParams.set("language", "es-MX");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // La clave puede ser la corta (v3) o el token largo (v4).
  const headers: Record<string, string> = { accept: "application/json" };
  if (clave.length > 60) headers["authorization"] = `Bearer ${clave}`;
  else url.searchParams.set("api_key", clave);
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!r) throw new HttpError(502, "TMDB no respondió");
  if (r.status === 401) throw new HttpError(400, "La clave de TMDB no es válida (Ajustes → Servicios y claves).");
  if (!r.ok) throw new HttpError(502, `TMDB respondió ${r.status}`);
  return (await r.json()) as T;
}

interface ResultadoTmdb {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  poster_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  overview?: string;
}

const resumen = (r: ResultadoTmdb, tipo?: "movie" | "tv") => ({
  id: r.id,
  tipo: (tipo ?? r.media_type) as "movie" | "tv",
  titulo: r.title ?? r.name ?? "",
  poster: r.poster_path ? `${IMG}${r.poster_path}` : null,
  fecha: r.release_date ?? r.first_air_date ?? null,
  calificacion: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
  sinopsis: r.overview ?? "",
});

// ---------------------------------------------------------------- Spotify

interface TokensSpotify {
  acceso: string;
  refresco: string;
  vence: number;
}

export function entretenimientoRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const dirMedia = join(carpetaArchivos(deps), "media");
  const secreto = () => deps.config.env.JWT_SECRET ?? "desarrollo-sin-secreto";
  const urlBase = () => (deps.config.isProduction ? `https://${deps.config.env.APP_HOST}` : `http://localhost:${deps.config.env.PORT}`);
  const retornoSpotify = () => `${urlBase()}/api/musica/spotify/callback`;

  const credencialesSpotify = (cuerpo: Record<string, string>) => {
    const id = deps.config.env.SPOTIFY_CLIENT_ID;
    if (!id) throw missingConfig("SPOTIFY_CLIENT_ID");
    const sec = deps.config.env.SPOTIFY_CLIENT_SECRET;
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
    if (sec) headers.authorization = `Basic ${Buffer.from(`${id}:${sec}`).toString("base64")}`;
    return { headers, body: new URLSearchParams(sec ? cuerpo : { ...cuerpo, client_id: id }) };
  };

  async function tokensSpotify(userId: string): Promise<string> {
    const guardado = await getSetting<string>(db, `spotify:${userId}`);
    if (!guardado) throw new HttpError(400, "Conecta tu cuenta de Spotify primero", "spotify_no_conectado");
    const t = JSON.parse(requireCipher(deps).decrypt(guardado)) as TokensSpotify;
    if (t.vence > Date.now() + 60_000) return t.acceso;
    const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", ...credencialesSpotify({ grant_type: "refresh_token", refresh_token: t.refresco }) });
    if (!r.ok) throw new HttpError(400, "Spotify pidió volver a conectar la cuenta", "spotify_no_conectado");
    const d = (await r.json()) as { access_token: string; expires_in: number; refresh_token?: string };
    const nuevos: TokensSpotify = { acceso: d.access_token, refresco: d.refresh_token ?? t.refresco, vence: Date.now() + d.expires_in * 1000 };
    await setSetting(db, `spotify:${userId}`, requireCipher(deps).encrypt(JSON.stringify(nuevos)), deps.now());
    return nuevos.acceso;
  }

  async function spotify<T = unknown>(userId: string, ruta: string, opciones: { metodo?: string; cuerpo?: unknown; tolerar?: boolean } = {}): Promise<T | null> {
    const token = await tokensSpotify(userId);
    const r = await fetch(`https://api.spotify.com/v1${ruta}`, {
      method: opciones.metodo ?? "GET",
      headers: { authorization: `Bearer ${token}`, ...(opciones.cuerpo ? { "content-type": "application/json" } : {}) },
      ...(opciones.cuerpo ? { body: JSON.stringify(opciones.cuerpo) } : {}),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 204) return null;
    if (opciones.tolerar && (r.status === 404 || r.status === 403 || r.status === 400)) return null;
    if (r.status === 404) throw new HttpError(404, "Abre Spotify en algún equipo (celular, PC o bocina) y vuelve a intentar.");
    if (r.status === 403) {
      // Spotify marca la falta de Premium con PREMIUM_REQUIRED; otro 403 es una conexión sin los permisos nuevos.
      const error = ((await r.json().catch(() => null)) as { error?: { reason?: string } } | null)?.error;
      if (error?.reason === "PREMIUM_REQUIRED") throw new HttpError(403, "Spotify solo deja controlar la música con cuenta Premium.");
      throw new HttpError(403, "Vuelve a conectar Spotify (botón de desconectar y luego Conectar) para dar los permisos nuevos.", "spotify_reconectar");
    }
    if (r.status === 429) throw new HttpError(429, "Spotify pidió esperar un momento. Intenta de nuevo en unos segundos.");
    if (!r.ok) throw new HttpError(502, `Spotify respondió ${r.status}`);
    // Los controles (siguiente, pausa…) a veces responden 200 con un texto que no es JSON: no es un error.
    const texto = await r.text();
    try {
      return texto ? (JSON.parse(texto) as T) : null;
    } catch {
      return null;
    }
  }

  async function parecidas(userId: string, actual: Pista, excluir: string[]): Promise<Pista[]> {
    const rec = await spotify<{ tracks: PistaSp[] }>(userId, `/recommendations?limit=20&market=MX&seed_tracks=${actual.id}${actual.artistaId ? `&seed_artists=${actual.artistaId}` : ""}`, { tolerar: true });
    const candidatas: Pista[] = (rec?.tracks ?? []).map(mapearPista);
    if (candidatas.length < 10 && actual.artistaId) {
      const top = await spotify<{ tracks: PistaSp[] }>(userId, `/artists/${actual.artistaId}/top-tracks?market=MX`, { tolerar: true });
      candidatas.push(...(top?.tracks ?? []).map(mapearPista));
    }
    if (candidatas.length < 10) {
      const artista = actual.artistas.split(",")[0]!.trim();
      const b = await spotify<{ tracks: { items: PistaSp[] } }>(userId, `/search?type=track&limit=10&market=MX&q=${encodeURIComponent(`artist:"${artista}"`)}`, { tolerar: true });
      candidatas.push(...(b?.tracks.items ?? []).map(mapearPista));
    }
    return parecidasSinRepetir(candidatas, [actual.id, ...excluir], 10);
  }

  return async function (app: FastifyInstance): Promise<void> {
    // ---------------------------------------------------------------- películas y series
    const pelLeer = { config: { acceso: { modulo: "peliculas" as const, nivel: "lectura" as const } } };
    const pelEscribir = { config: { acceso: { modulo: "peliculas" as const, nivel: "escritura" as const } } };

    app.get("/api/peliculas/buscar", pelLeer, async (request) => {
      const { q } = z.object({ q: z.string().trim().min(2).max(100) }).parse(request.query);
      const r = await tmdb<{ results: ResultadoTmdb[] }>(deps, "/search/multi", { query: q, include_adult: "false", region: "MX" });
      return r.results.filter((x) => x.media_type === "movie" || x.media_type === "tv").slice(0, 20).map((x) => resumen(x));
    });

    app.get("/api/peliculas/novedades", pelLeer, async () => {
      const [cine, series, proximas] = await Promise.all([
        tmdb<{ results: ResultadoTmdb[] }>(deps, "/trending/movie/week"),
        tmdb<{ results: ResultadoTmdb[] }>(deps, "/trending/tv/week"),
        tmdb<{ results: ResultadoTmdb[] }>(deps, "/movie/upcoming", { region: "MX" }),
      ]);
      return {
        peliculas: cine.results.slice(0, 12).map((x) => resumen(x, "movie")),
        series: series.results.slice(0, 12).map((x) => resumen(x, "tv")),
        proximas: proximas.results.slice(0, 12).map((x) => resumen(x, "movie")),
      };
    });

    app.get("/api/peliculas/:tipo/:id", pelLeer, async (request) => {
      const { tipo, id } = z.object({ tipo: z.enum(["movie", "tv"]), id: z.coerce.number().int().positive() }).parse(request.params);
      const [d, prov] = await Promise.all([
        tmdb<ResultadoTmdb & { genres?: { name: string }[]; runtime?: number; number_of_seasons?: number; next_episode_to_air?: { air_date: string; episode_number: number; season_number: number; name: string } | null; status?: string }>(
          deps,
          `/${tipo}/${id}`,
        ),
        tmdb<{ results: Record<string, { link?: string; flatrate?: { provider_name: string; logo_path: string }[]; rent?: { provider_name: string; logo_path: string }[]; buy?: { provider_name: string; logo_path: string }[] }> }>(
          deps,
          `/${tipo}/${id}/watch/providers`,
        ),
      ]);
      const mx = prov.results["MX"] as
        | ((typeof prov.results)[string] & { ads?: { provider_name: string; logo_path: string }[]; free?: { provider_name: string; logo_path: string }[] })
        | undefined;
      const lista = (l?: { provider_name: string; logo_path: string }[]) => (l ?? []).map((p) => ({ nombre: p.provider_name, logo: `https://image.tmdb.org/t/p/w92${p.logo_path}` }));
      // Tráiler: primero en español; si no hay, en inglés. Solo videos de YouTube.
      type Video = { key: string; site: string; type: string; name: string; official?: boolean };
      const buscarVideos = (idioma: string) => tmdb<{ results: Video[] }>(deps, `/${tipo}/${id}/videos`, { language: idioma }).catch(() => ({ results: [] as Video[] }));
      const elegir = (r: { results: Video[] }) =>
        r.results.filter((v) => v.site === "YouTube").sort((a, b) => Number(b.type === "Trailer") - Number(a.type === "Trailer") || Number(Boolean(b.official)) - Number(Boolean(a.official)))[0];
      const trailer = elegir(await buscarVideos("es-MX")) ?? elegir(await buscarVideos("en-US"));
      return {
        ...resumen(d, tipo),
        generos: (d.genres ?? []).map((g) => g.name),
        duracion: d.runtime ?? null,
        temporadas: d.number_of_seasons ?? null,
        estado: d.status ?? null,
        siguienteCapitulo: d.next_episode_to_air
          ? { fecha: d.next_episode_to_air.air_date, temporada: d.next_episode_to_air.season_number, capitulo: d.next_episode_to_air.episode_number, nombre: d.next_episode_to_air.name }
          : null,
        dondeVer: { suscripcion: lista(mx?.flatrate), gratis: lista([...(mx?.free ?? []), ...(mx?.ads ?? [])]), renta: lista(mx?.rent), compra: lista(mx?.buy), enlace: mx?.link ?? null },
        trailer: trailer ? { youtube: trailer.key, nombre: trailer.name } : null,
      };
    });

    app.get("/api/peliculas/por-ver", pelLeer, async (request) => {
      const filas = await db.select().from(watchlist).where(eq(watchlist.userId, currentUser(request).id)).orderBy(watchlist.seen, desc(watchlist.createdAt));
      return filas.map((w) => ({ id: w.id, tmdbId: w.tmdbId, tipo: w.mediaType, titulo: w.title, poster: w.poster, vista: w.seen }));
    });

    app.post("/api/peliculas/por-ver", pelEscribir, async (request) => {
      const d = z.object({ tmdbId: z.number().int().positive(), tipo: z.enum(["movie", "tv"]), titulo: z.string().max(300), poster: z.string().url().nullable() }).parse(request.body);
      await db
        .insert(watchlist)
        .values({ userId: currentUser(request).id, tmdbId: d.tmdbId, mediaType: d.tipo, title: d.titulo, poster: d.poster })
        .onConflictDoNothing();
      return { ok: true };
    });

    app.patch("/api/peliculas/por-ver/:id", pelEscribir, async (request) => {
      const { id } = idParams.parse(request.params);
      const { vista } = z.object({ vista: z.boolean() }).parse(request.body);
      await db.update(watchlist).set({ seen: vista }).where(and(eq(watchlist.id, id), eq(watchlist.userId, currentUser(request).id)));
      return { ok: true };
    });

    app.delete("/api/peliculas/por-ver/:id", pelEscribir, async (request) => {
      const { id } = idParams.parse(request.params);
      await db.delete(watchlist).where(and(eq(watchlist.id, id), eq(watchlist.userId, currentUser(request).id)));
      return { ok: true };
    });

    // ---------------------------------------------------------------- tu música y tus videos
    const modulo = (tipo: (typeof TIPOS)[number]) => (tipo === "musica" ? "musica" : "videos");

    app.get("/api/media/:tipo", { config: { acceso: { autenticado: true } } }, async (request) => {
      const { tipo } = z.object({ tipo: z.enum(TIPOS) }).parse(request.params);
      const user = currentUser(request);
      const { can } = await import("@mi-setup/shared");
      if (!can(user, modulo(tipo), "lectura")) throw new HttpError(403, "Sin permiso");
      const { pagina, porPagina } = z.object({ pagina: z.coerce.number().int().min(1).optional(), porPagina: z.coerce.number().int().min(1).max(50).default(6) }).parse(request.query);
      const filas = await db.select().from(mediaFiles).where(and(eq(mediaFiles.userId, user.id), eq(mediaFiles.kind, tipo))).orderBy(desc(mediaFiles.createdAt));
      const vence = Date.now() + 6 * 60 * 60_000;
      const mapear = (m: (typeof filas)[number]) => ({
        id: m.id,
        titulo: m.title,
        tamano: m.size,
        tipoArchivo: m.mime,
        progreso: m.progress,
        url: `/api/media/archivo/${m.id}?t=${firmarMedia(secreto(), m.id, vence)}`,
        creado: m.createdAt.toISOString(),
      });
      if (pagina === undefined) return filas.map(mapear);
      const p = paginar(filas, pagina, porPagina);
      return { ...p, items: p.items.map(mapear) };
    });

    app.post("/api/media/:tipo", { config: { acceso: { autenticado: true } }, bodyLimit: MAX_MEDIA + 1024 * 1024 }, async (request) => {
      const { tipo } = z.object({ tipo: z.enum(TIPOS) }).parse(request.params);
      const user = currentUser(request);
      const { can } = await import("@mi-setup/shared");
      if (!can(user, modulo(tipo), "escritura")) throw new HttpError(403, "Sin permiso");
      const archivo = await request.file({ limits: { fileSize: MAX_MEDIA, files: 1 } });
      if (!archivo) throw new HttpError(400, "Falta el archivo");
      const esperado = tipo === "musica" ? /^(audio\/|video\/mp4$)/ : /^video\//;
      if (!esperado.test(archivo.mimetype)) throw new HttpError(415, tipo === "musica" ? "Solo audio (MP3, M4A…) o MP4" : "Solo videos (MP4, WebM…)");
      await mkdir(dirMedia, { recursive: true });
      const guardado = randomBytes(16).toString("hex");
      const ruta = join(dirMedia, guardado);
      await pipeline(archivo.file, createWriteStream(ruta));
      if (archivo.file.truncated) {
        await unlink(ruta).catch(() => undefined);
        throw new HttpError(413, "El archivo supera 4 GB");
      }
      const tamano = (await stat(ruta)).size;
      const [m] = await db
        .insert(mediaFiles)
        .values({ userId: user.id, kind: tipo, title: archivo.filename.replace(/\.[^.]+$/, "").slice(0, 200) || "Sin nombre", storedName: guardado, size: tamano, mime: archivo.mimetype })
        .returning();
      if (!m) throw new HttpError(500, "No se pudo guardar");
      return { id: m.id };
    });

    /** Reproducción con enlace firmado y soporte de "Range" (adelantar y retroceder). */
    app.get("/api/media/archivo/:id", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { id } = idParams.parse(request.params);
      const { t } = z.object({ t: z.string().max(200) }).parse(request.query);
      if (!verificarMedia(secreto(), id, t, Date.now())) throw new HttpError(403, "El enlace caducó: vuelve a abrir la lista");
      const [m] = await db.select().from(mediaFiles).where(eq(mediaFiles.id, id));
      if (!m) throw new HttpError(404, "No encontrado");
      const ruta = join(dirMedia, m.storedName);
      const rango = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? "");
      reply.header("accept-ranges", "bytes").header("content-type", m.mime).header("content-disposition", disposicion(m.title, "inline")).header("cache-control", "private, max-age=3600");
      if (rango && (rango[1] || rango[2])) {
        const ini = rango[1] ? Number(rango[1]) : Math.max(0, m.size - Number(rango[2]));
        const fin = rango[1] && rango[2] ? Math.min(Number(rango[2]), m.size - 1) : m.size - 1;
        if (ini >= m.size || ini > fin) return reply.code(416).header("content-range", `bytes */${m.size}`).send();
        return reply
          .code(206)
          .header("content-range", `bytes ${ini}-${fin}/${m.size}`)
          .header("content-length", String(fin - ini + 1))
          .send(createReadStream(ruta, { start: ini, end: fin }));
      }
      return reply.header("content-length", String(m.size)).send(createReadStream(ruta));
    });

    app.patch("/api/media/archivo/:id", { config: { acceso: { autenticado: true } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const d = z.object({ progreso: z.number().int().min(0).max(1_000_000).optional(), titulo: z.string().trim().min(1).max(200).optional() }).parse(request.body);
      await db
        .update(mediaFiles)
        .set({ ...(d.progreso !== undefined ? { progress: d.progreso } : {}), ...(d.titulo ? { title: d.titulo } : {}) })
        .where(and(eq(mediaFiles.id, id), eq(mediaFiles.userId, currentUser(request).id)));
      return { ok: true };
    });

    app.delete("/api/media/archivo/:id", { config: { acceso: { autenticado: true } } }, async (request) => {
      const { id } = idParams.parse(request.params);
      const [m] = await db.delete(mediaFiles).where(and(eq(mediaFiles.id, id), eq(mediaFiles.userId, currentUser(request).id))).returning();
      if (m) await unlink(join(dirMedia, m.storedName)).catch(() => undefined);
      return { ok: true };
    });

    // ---------------------------------------------------------------- Spotify
    const musLeer = { config: { acceso: { modulo: "musica" as const, nivel: "lectura" as const } } };
    const musEscribir = { config: { acceso: { modulo: "musica" as const, nivel: "escritura" as const } } };
    const uriSpotify = /^spotify:(track|album|playlist|artist):\w+$/;
    const idSpotify = z.string().regex(/^\w{10,40}$/);

    app.get("/api/musica/spotify/conectar", musEscribir, async (request) => {
      const id = deps.config.env.SPOTIFY_CLIENT_ID;
      if (!id) throw missingConfig("SPOTIFY_CLIENT_ID");
      const estado = randomBytes(24).toString("base64url");
      const { verificador, reto } = pkce();
      await setSetting(db, `spotify-estado:${estado}`, { userId: currentUser(request).id, vence: Date.now() + 10 * 60_000, verificador }, deps.now());
      const url = new URL("https://accounts.spotify.com/authorize");
      url.search = new URLSearchParams({
        client_id: id,
        response_type: "code",
        redirect_uri: retornoSpotify(),
        state: estado,
        scope: SCOPES_SPOTIFY.join(" "),
        code_challenge_method: "S256",
        code_challenge: reto,
      }).toString();
      return { url: url.toString() };
    });

    app.get("/api/musica/spotify/callback", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { code, state } = z.object({ code: z.string().max(2000).optional(), state: z.string().max(200) }).parse(request.query);
      const pendiente = await getSetting<{ userId: string; vence: number; verificador?: string }>(db, `spotify-estado:${state}`);
      await deleteSetting(db, `spotify-estado:${state}`);
      const pagina = (texto: string) =>
        reply.type("text/html; charset=utf-8").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;background:#121212;color:#eee;display:grid;place-items:center;min-height:90vh"><p>${texto}</p></body>`);
      if (!pendiente || pendiente.vence < Date.now() || !code) return pagina("No se pudo conectar Spotify. Vuelve a intentarlo desde la app.");
      const r = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        ...credencialesSpotify({ grant_type: "authorization_code", code, redirect_uri: retornoSpotify(), ...(pendiente.verificador ? { code_verifier: pendiente.verificador } : {}) }),
      });
      if (!r.ok) return pagina("Spotify no aceptó la conexión. Revisa el Client ID, el Client Secret y la Redirect URI.");
      const d = (await r.json()) as { access_token: string; refresh_token: string; expires_in: number };
      const tokens: TokensSpotify = { acceso: d.access_token, refresco: d.refresh_token, vence: Date.now() + d.expires_in * 1000 };
      await setSetting(db, `spotify:${pendiente.userId}`, requireCipher(deps).encrypt(JSON.stringify(tokens)), deps.now());
      return pagina("¡Spotify conectado! Ya puedes cerrar esta ventana y volver a la app.");
    });

    app.delete("/api/musica/spotify", musEscribir, async (request) => {
      await deleteSetting(db, `spotify:${currentUser(request).id}`);
      return { ok: true };
    });

    app.get("/api/musica/spotify/app", musLeer, async () => ({ clientId: deps.config.env.SPOTIFY_CLIENT_ID ?? null, retorno: "misetup://spotify" }));

    app.get("/api/musica/spotify/estado", musLeer, async (request) => {
      const user = currentUser(request);
      if (!(await getSetting(db, `spotify:${user.id}`))) return { conectado: false, configurado: Boolean(deps.config.env.SPOTIFY_CLIENT_ID) };
      const d = await spotify<ReproductorSp>(user.id, "/me/player?market=MX", { tolerar: true });
      let guardada = false;
      // El corazón es un extra: si Spotify falla al revisarlo, el reproductor sale igual.
      if (d?.item?.uri) guardada = Boolean((await spotify<boolean[]>(user.id, `/me/library/contains?uris=${encodeURIComponent(d.item.uri)}`, { tolerar: true }).catch(() => null))?.[0]);
      return mapearEstado(d, guardada);
    });

    app.post("/api/musica/spotify/control", musEscribir, async (request) => {
      const d = z
        .object({
          accion: z.enum(["play", "pause", "next", "previous", "aleatorio"]),
          uri: z.string().regex(uriSpotify).optional(),
          uris: z.array(z.string().regex(uriSpotify)).max(100).optional(),
          desde: z.number().int().min(0).max(10_000).optional(),
          encendido: z.boolean().optional(),
          dispositivo: z.string().max(80).optional(),
        })
        .parse(request.body);
      const user = currentUser(request);
      const enEquipo = d.dispositivo ? `?device_id=${encodeURIComponent(d.dispositivo)}` : "";
      if (d.accion === "next" || d.accion === "previous") await spotify(user.id, `/me/player/${d.accion}${enEquipo}`, { metodo: "POST" });
      else if (d.accion === "pause") await spotify(user.id, `/me/player/pause${enEquipo}`, { metodo: "PUT" });
      else if (d.accion === "aleatorio") await spotify(user.id, `/me/player/shuffle?state=${d.encendido ? "true" : "false"}${d.dispositivo ? `&device_id=${encodeURIComponent(d.dispositivo)}` : ""}`, { metodo: "PUT" });
      else {
        const cuerpo = d.uris?.length ? { uris: d.uris, ...(d.desde ? { offset: { position: d.desde } } : {}) } : d.uri ? (d.uri.startsWith("spotify:track") ? { uris: [d.uri] } : { context_uri: d.uri, ...(d.desde ? { offset: { position: d.desde } } : {}) }) : undefined;
        await spotify(user.id, `/me/player/play${enEquipo}`, { metodo: "PUT", ...(cuerpo ? { cuerpo } : {}) });
      }
      return { ok: true };
    });

    app.post("/api/musica/spotify/volumen", musEscribir, async (request) => {
      const d = z.object({ volumen: z.number().int().min(0).max(100), dispositivo: z.string().max(80).optional() }).parse(request.body);
      const enEquipo = d.dispositivo ? `&device_id=${encodeURIComponent(d.dispositivo)}` : "";
      try {
        await spotify(currentUser(request).id, `/me/player/volume?volume_percent=${d.volumen}${enEquipo}`, { metodo: "PUT" });
      } catch (err) {
        // 403/404: ese equipo no deja cambiar el volumen desde fuera (bocinas, autos, algunos celulares).
        if (err instanceof HttpError && (err.statusCode === 403 || err.statusCode === 404)) throw new HttpError(400, "Este equipo no deja cambiar el volumen desde aquí. Cámbialo en el equipo.", "spotify_volumen");
        throw err;
      }
      return { volumen: d.volumen };
    });

    app.get("/api/musica/spotify/dispositivos", musLeer, async (request) => {
      const d = await spotify<{ devices: DispositivoSp[] }>(currentUser(request).id, "/me/player/devices");
      return mapearDispositivos(d?.devices ?? []);
    });

    app.post("/api/musica/spotify/transferir", musEscribir, async (request) => {
      const { id, sonar } = z.object({ id: z.string().min(1).max(80), sonar: z.boolean().default(true) }).parse(request.body);
      await spotify(currentUser(request).id, "/me/player", { metodo: "PUT", cuerpo: { device_ids: [id], play: sonar } });
      return { ok: true };
    });

    app.put("/api/musica/spotify/biblioteca/:id", musEscribir, async (request) => {
      const id = idSpotify.parse((request.params as { id: string }).id);
      const { guardar } = z.object({ guardar: z.boolean() }).parse(request.body);
      // Desde 2026 Spotify guarda y quita con /me/library y direcciones spotify:track:….
      await spotify(currentUser(request).id, `/me/library?uris=${encodeURIComponent(`spotify:track:${id}`)}`, { metodo: guardar ? "PUT" : "DELETE" });
      return { guardada: guardar };
    });

    app.post("/api/musica/spotify/parecidas", musEscribir, async (request) => {
      const user = currentUser(request);
      const d = await spotify<ReproductorSp>(user.id, "/me/player?market=MX", { tolerar: true });
      if (!d?.item?.id) throw new HttpError(400, "No suena nada en Spotify. Dale play a una canción y vuelve a tocar la varita.");
      const cola = await spotify<{ queue: PistaSp[] }>(user.id, "/me/player/queue", { tolerar: true });
      const lista = await parecidas(user.id, mapearPista(d.item), (cola?.queue ?? []).map((p) => p.id));
      for (const p of lista) await spotify(user.id, `/me/player/queue?uri=${encodeURIComponent(p.uri)}`, { metodo: "POST" });
      return { agregadas: lista.length, canciones: lista };
    });

    app.get("/api/musica/spotify/playlists", musLeer, async (request) => {
      const d = await spotify<{ items: (PlaylistSp | null)[] }>(currentUser(request).id, "/me/playlists?limit=50");
      return (d?.items ?? []).filter((p): p is PlaylistSp => Boolean(p)).map(mapearPlaylist);
    });

    app.get("/api/musica/spotify/playlists/:id", musLeer, async (request) => {
      const id = idSpotify.parse((request.params as { id: string }).id);
      const user = currentUser(request);
      // Spotify (2026) solo da las canciones de las playlists tuyas o colaborativas; de las demás, solo sus datos.
      const [info, d] = await Promise.all([
        spotify<PlaylistSp>(user.id, `/playlists/${id}?fields=id,uri,name,images,items.total,tracks.total,owner.display_name`),
        spotify<{ items: ElementoPlaylistSp[] }>(user.id, `/playlists/${id}/items?limit=50&market=MX`, { tolerar: true }),
      ]);
      return {
        ...(info ? mapearPlaylist(info) : { id, uri: `spotify:playlist:${id}`, nombre: "", portada: null, total: 0, de: "" }),
        pistas: pistasDePlaylist(d?.items ?? []),
        legible: d !== null,
      };
    });

    app.get("/api/musica/spotify/recientes", musLeer, async (request) => {
      const d = await spotify<{ items: { track: PistaSp; played_at: string }[] }>(currentUser(request).id, "/me/player/recently-played?limit=20");
      const vistas = new Set<string>();
      return (d?.items ?? [])
        .filter((i) => (vistas.has(i.track.id) ? false : (vistas.add(i.track.id), true)))
        .map((i) => ({ ...mapearPista(i.track), cuando: i.played_at }));
    });

    app.get("/api/musica/spotify/top", musLeer, async (request) => {
      const user = currentUser(request);
      const tuyo = await spotify<{ items: PistaSp[] }>(user.id, "/me/top/tracks?limit=50&time_range=short_term", { tolerar: true });
      if (tuyo?.items.length) return { fuente: "tuyo" as const, pistas: tuyo.items.map(mapearPista) };
      const b = await spotify<{ playlists: { items: (PlaylistSp | null)[] } }>(user.id, `/search?type=playlist&limit=5&market=MX&q=${encodeURIComponent("Top 50 México")}`, { tolerar: true });
      for (const pl of b?.playlists.items ?? []) {
        if (!pl) continue;
        const d = await spotify<{ items: ElementoPlaylistSp[] }>(user.id, `/playlists/${pl.id}/items?limit=50&market=MX`, { tolerar: true });
        const pistas = pistasDePlaylist(d?.items ?? []);
        if (pistas.length) return { fuente: "mexico" as const, pistas };
      }
      return { fuente: "ninguna" as const, pistas: [] };
    });

    app.get("/api/musica/spotify/buscar", musLeer, async (request) => {
      const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(request.query);
      // Desde 2026 la búsqueda da máximo 10 resultados.
      const d = await spotify<{ tracks: { items: PistaSp[] } }>(currentUser(request).id, `/search?type=track&limit=10&market=MX&q=${encodeURIComponent(q)}`);
      return (d?.tracks.items ?? []).map(mapearPista);
    });
  };
}
