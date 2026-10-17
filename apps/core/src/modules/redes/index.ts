/**
 * Redes y streams: título y categoría en Twitch, YouTube y Kick; publicar y
 * leer menciones en X (pago por uso, con costo estimado antes de cada acción)
 * y mensajes de Discord por bot. También registra las herramientas que la IA
 * puede proponer (redactar → el usuario aprueba → recién entonces se publica).
 */
import { can } from "@mi-setup/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, missingConfig } from "../../http-error.js";
import { currentUser, type AuthUser } from "../../security/rbac.js";
import type { ModuleDeps } from "../common.js";
import type { Herramienta } from "../ia/herramientas.js";
import { oauthRoutes, pedirJson, tokenVigente } from "./oauth.js";

export const STREAMS = ["twitch", "youtube", "kick"] as const;
export type StreamId = (typeof STREAMS)[number];

export interface Canal {
  titulo: string;
  categoria: { id: string; nombre: string } | null;
  /** Aviso cuando la plataforma no permite algo (p. ej. YouTube sin transmisión). */
  nota?: string;
}

// ---------------------------------------------------------------- streams

interface EmisionYoutube {
  id: string;
  snippet: { title: string; description?: string; scheduledStartTime?: string };
}

async function emisionYoutube(token: string): Promise<EmisionYoutube | null> {
  for (const estado of ["active", "upcoming"]) {
    const r = await pedirJson<{ items?: EmisionYoutube[] }>(
      "YouTube",
      `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&broadcastType=all&broadcastStatus=${estado}&maxResults=5`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (r.items?.[0]) return r.items[0];
  }
  return null;
}

export async function leerCanal(deps: ModuleDeps, p: StreamId): Promise<Canal> {
  const { token, externalId, clientId } = await tokenVigente(deps, p);
  if (p === "twitch") {
    const r = await pedirJson<{ data: { title: string; game_id: string; game_name: string }[] }>(
      "Twitch",
      `https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(externalId)}`,
      { headers: { authorization: `Bearer ${token}`, "client-id": clientId } },
    );
    const c = r.data[0];
    return { titulo: c?.title ?? "", categoria: c?.game_id ? { id: c.game_id, nombre: c.game_name } : null };
  }
  if (p === "kick") {
    const r = await pedirJson<{ data: { stream_title: string; category?: { id: number; name: string } | null }[] }>(
      "Kick",
      "https://api.kick.com/public/v1/channels",
      { headers: { authorization: `Bearer ${token}` } },
    );
    const c = r.data[0];
    return { titulo: c?.stream_title ?? "", categoria: c?.category ? { id: String(c.category.id), nombre: c.category.name } : null };
  }
  const e = await emisionYoutube(token);
  if (!e) return { titulo: "", categoria: null, nota: "No hay una transmisión en vivo ni programada en YouTube." };
  return { titulo: e.snippet.title, categoria: null, nota: "YouTube no permite cambiar el juego desde la API de transmisiones; solo el título." };
}

export async function buscarCategorias(deps: ModuleDeps, p: StreamId, q: string): Promise<{ id: string; nombre: string }[]> {
  if (p === "youtube") return [];
  const { token, clientId } = await tokenVigente(deps, p);
  if (p === "twitch") {
    const r = await pedirJson<{ data: { id: string; name: string }[] }>(
      "Twitch",
      `https://api.twitch.tv/helix/search/categories?first=10&query=${encodeURIComponent(q)}`,
      { headers: { authorization: `Bearer ${token}`, "client-id": clientId } },
    );
    return r.data.map((c) => ({ id: c.id, nombre: c.name }));
  }
  const r = await pedirJson<{ data: { id: number; name: string }[] }>("Kick", `https://api.kick.com/public/v1/categories?q=${encodeURIComponent(q)}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  return r.data.slice(0, 10).map((c) => ({ id: String(c.id), nombre: c.name }));
}

export async function cambiarStream(
  deps: ModuleDeps,
  user: AuthUser,
  p: StreamId,
  cambio: { titulo?: string; categoriaId?: string; categoriaNombre?: string },
): Promise<Canal> {
  const { token, externalId, clientId } = await tokenVigente(deps, p);
  let categoriaId = cambio.categoriaId;
  if (!categoriaId && cambio.categoriaNombre && p !== "youtube") {
    const [primera] = await buscarCategorias(deps, p, cambio.categoriaNombre);
    if (!primera) throw new HttpError(404, `No se encontró la categoría "${cambio.categoriaNombre}"`);
    categoriaId = primera.id;
  }
  if (p === "twitch") {
    await pedirJson("Twitch", `https://api.twitch.tv/helix/channels?broadcaster_id=${encodeURIComponent(externalId)}`, {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "client-id": clientId, "content-type": "application/json" },
      body: JSON.stringify({ ...(cambio.titulo !== undefined ? { title: cambio.titulo } : {}), ...(categoriaId ? { game_id: categoriaId } : {}) }),
    });
  } else if (p === "kick") {
    await pedirJson("Kick", "https://api.kick.com/public/v1/channels", {
      method: "PATCH",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        ...(cambio.titulo !== undefined ? { stream_title: cambio.titulo } : {}),
        ...(categoriaId ? { category_id: Number(categoriaId) } : {}),
      }),
    });
  } else {
    const e = await emisionYoutube(token);
    if (!e) throw new HttpError(409, "No hay una transmisión en vivo ni programada en YouTube");
    if (cambio.titulo !== undefined) {
      await pedirJson("YouTube", "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet", {
        method: "PUT",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ id: e.id, snippet: { ...e.snippet, title: cambio.titulo } }),
      });
    }
  }
  await deps.audit.record({
    actorType: "usuario",
    actorUserId: user.id,
    action: "stream_actualizado",
    module: "streams",
    target: p,
    outcome: "ok",
    details: { titulo: cambio.titulo ?? null, categoria: categoriaId ?? null },
  });
  return leerCanal(deps, p);
}

// ---------------------------------------------------------------- X

export function estimacionX(deps: ModuleDeps) {
  return { publicarUsd: deps.config.env.X_COSTO_PUBLICAR_USD, leerPorMencionUsd: deps.config.env.X_COSTO_LECTURA_USD };
}

export async function publicarX(deps: ModuleDeps, user: AuthUser, texto: string) {
  const { token } = await tokenVigente(deps, "x");
  const r = await pedirJson<{ data: { id: string; text: string } }>("X", "https://api.x.com/2/tweets", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ text: texto }),
  });
  await deps.audit.record({
    actorType: "usuario",
    actorUserId: user.id,
    action: "x_publicado",
    module: "x",
    target: r.data.id,
    outcome: "ok",
    details: { texto: texto.slice(0, 280), costoEstimadoUsd: estimacionX(deps).publicarUsd },
  });
  return { id: r.data.id, url: `https://x.com/i/web/status/${r.data.id}` };
}

async function mencionesX(deps: ModuleDeps, user: AuthUser, cantidad: number) {
  const { token, externalId } = await tokenVigente(deps, "x");
  const r = await pedirJson<{
    data?: { id: string; text: string; author_id: string; created_at?: string }[];
    includes?: { users?: { id: string; username: string }[] };
  }>(
    "X",
    `https://api.x.com/2/users/${encodeURIComponent(externalId)}/mentions?max_results=${cantidad}&expansions=author_id&user.fields=username&tweet.fields=created_at`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const lista = r.data ?? [];
  const autores = new Map((r.includes?.users ?? []).map((u) => [u.id, u.username]));
  await deps.audit.record({
    actorType: "usuario",
    actorUserId: user.id,
    action: "x_menciones_leidas",
    module: "x",
    outcome: "ok",
    details: { cantidad: lista.length, costoEstimadoUsd: lista.length * estimacionX(deps).leerPorMencionUsd },
  });
  return lista.map((t) => ({ id: t.id, texto: t.text, autor: autores.get(t.author_id) ?? t.author_id, fecha: t.created_at ?? null }));
}

// ---------------------------------------------------------------- Discord (bot)

let cacheCanales: { hasta: number; canales: { id: string; nombre: string; servidor: string }[] } | null = null;

async function discord<T>(deps: ModuleDeps, ruta: string, init: RequestInit = {}): Promise<T> {
  const token = deps.config.env.DISCORD_BOT_TOKEN;
  if (!token) throw missingConfig("DISCORD_BOT_TOKEN");
  return pedirJson<T>("Discord", `https://discord.com/api/v10${ruta}`, {
    ...init,
    headers: { authorization: `Bot ${token}`, "content-type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
}

export async function canalesDiscord(deps: ModuleDeps) {
  const ahora = Date.now();
  if (cacheCanales && cacheCanales.hasta > ahora) return cacheCanales.canales;
  const servidores = await discord<{ id: string; name: string }[]>(deps, "/users/@me/guilds");
  const canales: { id: string; nombre: string; servidor: string }[] = [];
  for (const s of servidores.slice(0, 20)) {
    const lista = await discord<{ id: string; name: string; type: number; position: number }[]>(deps, `/guilds/${s.id}/channels`);
    // 0 = texto, 5 = anuncios
    for (const c of lista.filter((x) => x.type === 0 || x.type === 5).sort((a, b) => a.position - b.position)) {
      canales.push({ id: c.id, nombre: c.name, servidor: s.name });
    }
  }
  cacheCanales = { hasta: ahora + 5 * 60_000, canales };
  return canales;
}

/** Solo pruebas. */
export function limpiarCacheDiscord(): void {
  cacheCanales = null;
}

export interface EmbedDiscord {
  titulo?: string;
  descripcion?: string;
  color?: string;
  imagen?: string;
  url?: string;
}

async function canalDelBot(deps: ModuleDeps, canalId: string) {
  const canal = (await canalesDiscord(deps)).find((c) => c.id === canalId);
  if (!canal) throw new HttpError(404, "El bot no tiene acceso a ese canal");
  return canal;
}

export async function enviarDiscord(deps: ModuleDeps, user: AuthUser, canalId: string, texto: string, embed?: EmbedDiscord) {
  const canal = await canalDelBot(deps, canalId);
  const tarjeta = embed && (embed.titulo || embed.descripcion || embed.imagen)
    ? {
        ...(embed.titulo ? { title: embed.titulo } : {}),
        ...(embed.descripcion ? { description: embed.descripcion } : {}),
        ...(embed.url ? { url: embed.url } : {}),
        ...(embed.imagen ? { image: { url: embed.imagen } } : {}),
        color: Number.parseInt((embed.color ?? "#5865f2").slice(1), 16),
      }
    : null;
  const r = await discord<{ id: string }>(deps, `/channels/${canalId}/messages`, {
    method: "POST",
    // Sin menciones masivas (@everyone, roles) aunque el texto las incluya.
    body: JSON.stringify({ ...(texto ? { content: texto } : {}), ...(tarjeta ? { embeds: [tarjeta] } : {}), allowed_mentions: { parse: [] } }),
  });
  await deps.audit.record({
    actorType: "usuario",
    actorUserId: user.id,
    action: "discord_enviado",
    module: "discord",
    target: `${canal.servidor} #${canal.nombre}`,
    outcome: "ok",
    details: { texto: texto.slice(0, 500) },
  });
  return { id: r.id };
}

// ---------------------------------------------------------------- rutas, herramientas de IA y contexto

const streamParams = z.object({ plataforma: z.enum(STREAMS) });
const textoX = z.string().trim().min(1, "Escribe algo").max(280, "Máximo 280 caracteres");
const textoDiscord = z.string().trim().min(1).max(2000);
const costoAceptado = z.literal(true, { errorMap: () => ({ message: "Confirma el costo estimado" }) });

export function redesModule(deps: ModuleDeps) {
  const objeto = (properties: Record<string, unknown>, required: string[]) => ({ type: "object", properties, required, additionalProperties: false });

  const herramientas = [
    {
      nombre: "publicar_x",
      descripcion: "Propone publicar un post en X (Twitter). Redacta el texto completo (máximo 280 caracteres). Tiene costo por uso.",
      modulo: "x",
      esquema: z.object({ texto: textoX }),
      inputSchema: objeto({ texto: { type: "string" } }, ["texto"]),
      describir: (i: { texto: string }) => `Publicar en X (≈${estimacionX(deps).publicarUsd} USD): "${i.texto}"`,
      peligroso: () => false,
      ejecutar: (user: AuthUser, i: { texto: string }) => publicarX(deps, user, i.texto),
    },
    {
      nombre: "enviar_discord",
      descripcion: "Propone enviar un mensaje con el bot de Discord a un canal (usa un canalId del contexto).",
      modulo: "discord",
      esquema: z.object({ canalId: z.string().regex(/^\d{5,25}$/), texto: textoDiscord }),
      inputSchema: objeto({ canalId: { type: "string" }, texto: { type: "string" } }, ["canalId", "texto"]),
      describir: (i: { canalId: string; texto: string }) => `Enviar a Discord: "${i.texto.slice(0, 120)}"`,
      peligroso: () => false,
      ejecutar: (user: AuthUser, i: { canalId: string; texto: string }) => enviarDiscord(deps, user, i.canalId, i.texto),
    },
    {
      nombre: "cambiar_stream",
      descripcion: "Propone cambiar el título y/o la categoría (juego) del stream en Twitch, YouTube o Kick.",
      modulo: "streams",
      esquema: z.object({ plataforma: z.enum(STREAMS), titulo: z.string().trim().min(1).max(140).optional(), categoria: z.string().trim().max(100).optional() }),
      inputSchema: objeto(
        { plataforma: { type: "string", enum: [...STREAMS] }, titulo: { type: "string" }, categoria: { type: "string", description: "Nombre del juego o categoría" } },
        ["plataforma"],
      ),
      describir: (i: { plataforma: StreamId; titulo?: string; categoria?: string }) =>
        `Cambiar stream de ${i.plataforma}: ${[i.titulo ? `título "${i.titulo}"` : "", i.categoria ? `categoría "${i.categoria}"` : ""].filter(Boolean).join(", ")}`,
      peligroso: () => false,
      ejecutar: (user: AuthUser, i: { plataforma: StreamId; titulo?: string; categoria?: string }) =>
        cambiarStream(deps, user, i.plataforma, { ...(i.titulo ? { titulo: i.titulo } : {}), ...(i.categoria ? { categoriaNombre: i.categoria } : {}) }),
    },
  ] as unknown as Herramienta[];

  /** Contexto no secreto para la IA: canales de Discord disponibles. */
  async function contexto(user: AuthUser): Promise<string | null> {
    if (!deps.config.env.DISCORD_BOT_TOKEN || !can(user, "discord", "lectura")) return null;
    try {
      const canales = await canalesDiscord(deps);
      if (!canales.length) return null;
      return `Canales de Discord (canalId → servidor #canal): ${canales.slice(0, 40).map((c) => `${c.id} → ${c.servidor} #${c.nombre}`).join("; ")}`;
    } catch {
      return null;
    }
  }

  async function routes(app: FastifyInstance): Promise<void> {
    await app.register(oauthRoutes(deps));

    const streamsLeer = { config: { acceso: { modulo: "streams" as const, nivel: "lectura" as const } } };
    const streamsEscribir = { config: { acceso: { modulo: "streams" as const, nivel: "escritura" as const } } };
    app.get("/api/streams/:plataforma", streamsLeer, async (request) => leerCanal(deps, streamParams.parse(request.params).plataforma));
    app.get("/api/streams/:plataforma/categorias", streamsLeer, async (request) => {
      const { q } = z.object({ q: z.string().trim().min(1).max(100) }).parse(request.query);
      return buscarCategorias(deps, streamParams.parse(request.params).plataforma, q);
    });
    app.patch("/api/streams/:plataforma", streamsEscribir, async (request) => {
      const cuerpo = z
        .object({ titulo: z.string().trim().min(1).max(140).optional(), categoriaId: z.string().max(40).optional() })
        .refine((c) => c.titulo !== undefined || c.categoriaId !== undefined, "Nada que cambiar")
        .parse(request.body);
      return cambiarStream(deps, currentUser(request), streamParams.parse(request.params).plataforma, {
        ...(cuerpo.titulo !== undefined ? { titulo: cuerpo.titulo } : {}),
        ...(cuerpo.categoriaId ? { categoriaId: cuerpo.categoriaId } : {}),
      });
    });

    app.get("/api/x/estimacion", { config: { acceso: { modulo: "x", nivel: "lectura" } } }, async () => estimacionX(deps));
    app.post("/api/x/publicar", { config: { acceso: { modulo: "x", nivel: "escritura" } } }, async (request) => {
      const { texto } = z.object({ texto: textoX, costoAceptado }).parse(request.body);
      return publicarX(deps, currentUser(request), texto);
    });
    app.post("/api/x/menciones", { config: { acceso: { modulo: "x", nivel: "lectura" } } }, async (request) => {
      const { cantidad } = z.object({ cantidad: z.number().int().min(5).max(100).default(10), costoAceptado }).parse(request.body);
      return mencionesX(deps, currentUser(request), cantidad);
    });

    app.get("/api/discord/canales", { config: { acceso: { modulo: "discord", nivel: "lectura" } } }, async () => {
      if (!deps.config.env.DISCORD_BOT_TOKEN) return { configurado: false, canales: [] };
      return { configurado: true, canales: await canalesDiscord(deps) };
    });
    const embedSchema = z
      .object({
        titulo: z.string().trim().max(256).optional(),
        descripcion: z.string().trim().max(4000).optional(),
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        imagen: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "La imagen debe ser https").optional(),
        url: z.string().url().max(1000).optional(),
      })
      .optional();
    const snowflake = z.string().regex(/^\d{5,25}$/, "Identificador inválido");
    const leerDiscord = { config: { acceso: { modulo: "discord" as const, nivel: "lectura" as const } } };
    const escribirDiscord = { config: { acceso: { modulo: "discord" as const, nivel: "escritura" as const } } };

    app.post("/api/discord/enviar", escribirDiscord, async (request) => {
      const d = z
        .object({ canalId: snowflake, texto: z.string().trim().max(2000).default(""), embed: embedSchema })
        .refine((x) => x.texto || x.embed?.titulo || x.embed?.descripcion || x.embed?.imagen, "Escribe un mensaje o arma la tarjeta")
        .parse(request.body);
      return enviarDiscord(deps, currentUser(request), d.canalId, d.texto, d.embed);
    });

    /** Servidores del bot con número de miembros y conectados. */
    app.get("/api/discord/servidores", leerDiscord, async () => {
      if (!deps.config.env.DISCORD_BOT_TOKEN) return [];
      const lista = await discord<{ id: string; name: string }[]>(deps, "/users/@me/guilds");
      return Promise.all(
        lista.slice(0, 20).map(async (s) => {
          const g = await discord<{ id: string; name: string; icon: string | null; approximate_member_count?: number; approximate_presence_count?: number }>(
            deps,
            `/guilds/${s.id}?with_counts=true`,
          ).catch(() => null);
          return {
            id: s.id,
            nombre: s.name,
            icono: g?.icon ? `https://cdn.discordapp.com/icons/${s.id}/${g.icon}.png?size=64` : null,
            miembros: g?.approximate_member_count ?? null,
            conectados: g?.approximate_presence_count ?? null,
          };
        }),
      );
    });

    /** Últimos mensajes de un canal (requiere activar "Message Content Intent" en el portal de Discord para ver el texto). */
    app.get("/api/discord/canales/:canalId/mensajes", leerDiscord, async (request) => {
      const { canalId } = z.object({ canalId: snowflake }).parse(request.params);
      await canalDelBot(deps, canalId);
      const yo = await discord<{ id: string }>(deps, "/users/@me");
      const lista = await discord<
        { id: string; content: string; timestamp: string; pinned: boolean; author: { id: string; username: string; global_name?: string | null }; attachments: unknown[]; embeds: { title?: string }[] }[]
      >(deps, `/channels/${canalId}/messages?limit=30`);
      return lista.map((m) => ({
        id: m.id,
        texto: m.content,
        fecha: m.timestamp,
        fijado: m.pinned,
        autor: m.author.global_name || m.author.username,
        delBot: m.author.id === yo.id,
        adjuntos: m.attachments.length,
        tarjeta: m.embeds[0]?.title ?? null,
      }));
    });

    app.patch("/api/discord/canales/:canalId/mensajes/:mensajeId", escribirDiscord, async (request) => {
      const { canalId, mensajeId } = z.object({ canalId: snowflake, mensajeId: snowflake }).parse(request.params);
      const { texto } = z.object({ texto: textoDiscord }).parse(request.body);
      const canal = await canalDelBot(deps, canalId);
      await discord(deps, `/channels/${canalId}/messages/${mensajeId}`, { method: "PATCH", body: JSON.stringify({ content: texto, allowed_mentions: { parse: [] } }) });
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "discord_editado", module: "discord", target: `${canal.servidor} #${canal.nombre}`, outcome: "ok" });
      return { ok: true };
    });

    app.delete("/api/discord/canales/:canalId/mensajes/:mensajeId", escribirDiscord, async (request) => {
      const { canalId, mensajeId } = z.object({ canalId: snowflake, mensajeId: snowflake }).parse(request.params);
      const canal = await canalDelBot(deps, canalId);
      await discord(deps, `/channels/${canalId}/messages/${mensajeId}`, { method: "DELETE" });
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "discord_borrado", module: "discord", target: `${canal.servidor} #${canal.nombre}`, outcome: "ok" });
      return { ok: true };
    });

    app.post("/api/discord/canales/:canalId/mensajes/:mensajeId/fijar", escribirDiscord, async (request) => {
      const { canalId, mensajeId } = z.object({ canalId: snowflake, mensajeId: snowflake }).parse(request.params);
      const { fijar } = z.object({ fijar: z.boolean() }).parse(request.body);
      await canalDelBot(deps, canalId);
      await discord(deps, `/channels/${canalId}/pins/${mensajeId}`, { method: fijar ? "PUT" : "DELETE" });
      return { ok: true };
    });

    app.post("/api/discord/canales/:canalId/mensajes/:mensajeId/reaccion", escribirDiscord, async (request) => {
      const { canalId, mensajeId } = z.object({ canalId: snowflake, mensajeId: snowflake }).parse(request.params);
      const { emoji } = z.object({ emoji: z.string().min(1).max(16) }).parse(request.body);
      await canalDelBot(deps, canalId);
      await discord(deps, `/channels/${canalId}/messages/${mensajeId}/reactions/${encodeURIComponent(emoji)}/@me`, { method: "PUT" });
      return { ok: true };
    });
  }

  return { routes, herramientas, contexto };
}
