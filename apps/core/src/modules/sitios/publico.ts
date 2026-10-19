/**
 * Sitios publicados: atiende las peticiones que llegan a nombre.DOMINIO o a un
 * dominio propio (Fastify las manda a /__sitio/… con rewriteUrl).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { verifySecret } from "../../auth/password.js";
import { siteAssets, siteEntries, siteMembers, sites, siteStats, siteTables, users } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import type { ModuleDeps } from "../common.js";
import { carpetaArchivos } from "../herramientas.js";
import { PteroClient } from "../ptero.js";
import { limpiarHost, type DetectorSitios } from "./detector.js";
import { RUNTIME, SERVICE_WORKER } from "./runtime.js";

export interface PaginaPublicada {
  ruta: string;
  titulo: string;
  html: string;
  css: string;
  privada?: boolean;
}
export interface AjustesSitio {
  titulo?: string;
  descripcion?: string;
  icono?: string;
  imagenCompartir?: string;
  whatsapp?: string;
  color?: string;
  moneda?: string;
  app?: boolean;
  nombreCorto?: string;
  fuentes?: string[];
  servidores?: { id: string; nombre: string; direccion?: string }[];
  /** Avisar al celular del dueño cuando llega un formulario o pedido. */
  avisos?: boolean;
}

type FilaSitio = typeof sites.$inferSelect;

const CSP_SITIO =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src * data: blob:; media-src * data: blob:; connect-src 'self'; frame-src https://www.youtube-nocookie.com https://player.twitch.tv https://player.kick.com https://www.google.com https://maps.google.com; form-action 'self'; base-uri 'self'; frame-ancestors *";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const jsonSeguro = (v: unknown) => JSON.stringify(v).replace(/</g, "\\u003c");

export function urlArchivo(valor: string | undefined): string | undefined {
  if (!valor) return undefined;
  return /^[0-9a-f-]{36}$/.test(valor) ? `/_archivos/${valor}` : valor;
}

/** Página completa lista para el navegador. */
export function armarPagina(sitio: Pick<FilaSitio, "name" | "settings">, pagina: PaginaPublicada, origen: string): string {
  const a = (sitio.settings ?? {}) as AjustesSitio;
  const titulo = pagina.titulo || a.titulo || sitio.name;
  const descripcion = a.descripcion ?? "";
  const imagen = urlArchivo(a.imagenCompartir);
  const icono = urlArchivo(a.icono);
  const fuentes = (a.fuentes ?? []).filter((f) => /^[\w \-]{2,40}$/.test(f));
  const cfg = { whatsapp: (a.whatsapp ?? "").replace(/\D/g, ""), color: a.color ?? "", moneda: a.moneda ?? "MXN", app: Boolean(a.app) };
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title>${descripcion ? `<meta name="description" content="${esc(descripcion)}">` : ""}
<meta property="og:title" content="${esc(titulo)}"><meta property="og:type" content="website"><meta property="og:url" content="${esc(origen + pagina.ruta)}">${descripcion ? `<meta property="og:description" content="${esc(descripcion)}">` : ""}${imagen ? `<meta property="og:image" content="${esc(imagen.startsWith("/") ? origen + imagen : imagen)}"><meta name="twitter:card" content="summary_large_image">` : ""}
${icono ? `<link rel="icon" href="${esc(icono)}"><link rel="apple-touch-icon" href="${esc(icono)}">` : ""}${a.app ? `<link rel="manifest" href="/manifest.webmanifest">` : ""}${a.color ? `<meta name="theme-color" content="${esc(a.color)}">` : ""}
${fuentes.length ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fuentes.map((f) => `family=${encodeURIComponent(f)}:wght@400;600;700`).join("&")}&display=swap">` : ""}
<style>*{box-sizing:border-box}body{margin:0}img{max-width:100%}.ms-tarjeta{display:inline-block;vertical-align:top;width:220px;margin:8px;padding:12px;border-radius:14px;box-shadow:0 2px 12px rgba(0,0,0,.08);background:#fff;color:#111}.ms-tarjeta img{width:100%;border-radius:10px}.ms-agregar{margin-top:8px;padding:8px 14px;border:0;border-radius:10px;background:${esc(a.color || "#16a34a")};color:#fff;font-weight:600;cursor:pointer}</style>
<style>${pagina.css.replace(/<\/style/gi, "<\\/style")}</style></head><body>${pagina.html}
<script>window.__MS=${jsonSeguro(cfg)}</script><script src="/_ms/runtime.js" defer></script></body></html>`;
}

function paginaSimple(titulo: string, cuerpo: string): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f0f12;color:#eee;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:420px;padding:24px;text-align:center}input,button{width:100%;padding:12px;margin:6px 0;border-radius:12px;border:1px solid #333;background:#1b1b20;color:#eee;font-size:15px}button{background:#fff;color:#111;font-weight:700;border:0}</style></head><body><main>${cuerpo}</main><script src="/_ms/runtime.js" defer></script></body></html>`;
}

// ---------------------------------------------------------------- sesión de miembros
const firma = (secreto: string, datos: string) => createHmac("sha256", secreto).update(datos).digest("base64url");
export function cookieMiembro(secreto: string, siteId: string, memberId: string, vence: number): string {
  return `${memberId}.${vence}.${firma(secreto, `${siteId}.${memberId}.${vence}`)}`;
}
function leerMiembro(secreto: string, siteId: string, valor: string | undefined, ahora: number): string | null {
  if (!valor) return null;
  const [id, venceTxt, f] = valor.split(".");
  const vence = Number(venceTxt);
  if (!id || !f || !Number.isFinite(vence) || vence < ahora) return null;
  const esperada = Buffer.from(firma(secreto, `${siteId}.${id}.${vence}`));
  const recibida = Buffer.from(f);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida) ? id : null;
}
const leerCookie = (request: FastifyRequest, nombre: string) =>
  (request.headers.cookie ?? "")
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === nombre)?.[1];

export function sitiosPublicosRoutes(deps: ModuleDeps, detector: DetectorSitios) {
  const { db } = deps;
  const secreto = () => `${deps.config.env.JWT_SECRET ?? "desarrollo"}:sitios`;
  const cache = new Map<string, { sitio: FilaSitio | null; hasta: number; version: number }>();
  const limites = new Map<string, { n: number; desde: number }>();
  const cacheBloques = new Map<string, { valor: unknown; hasta: number }>();
  const ptero = new PteroClient(deps.config.env);

  async function sitioDe(request: FastifyRequest): Promise<FilaSitio> {
    const host = limpiarHost(request.headers.host);
    const ahora = Date.now();
    const c = cache.get(host);
    if (c && c.hasta > ahora && c.version === detector.version) {
      if (!c.sitio) throw new HttpError(404, "Sitio no encontrado");
      return c.sitio;
    }
    const slug = detector.slugDe(host);
    const [s] = slug ? await db.select().from(sites).where(eq(sites.slug, slug)) : await db.select().from(sites).where(eq(sites.customDomain, host));
    const sitio = s?.published ? s : null;
    cache.set(host, { sitio, hasta: ahora + 15_000, version: detector.version });
    if (!sitio) throw new HttpError(404, "Sitio no encontrado");
    return sitio;
  }

  const limitar = (request: FastifyRequest, clave: string, maximo: number) => {
    const k = `${request.ip}|${clave}`;
    const ahora = Date.now();
    const l = limites.get(k);
    if (!l || ahora - l.desde > 60_000) limites.set(k, { n: 1, desde: ahora });
    else if (++l.n > maximo) throw new HttpError(429, "Demasiados intentos; espera un minuto.");
  };

  async function contar(siteId: string, tipo: string, clave: string): Promise<void> {
    const dia = deps.now().toISOString().slice(0, 10);
    await db
      .insert(siteStats)
      .values({ siteId, day: dia, kind: tipo, key: clave.slice(0, 80) || "(vacío)", count: 1 })
      .onConflictDoUpdate({ target: [siteStats.siteId, siteStats.day, siteStats.kind, siteStats.key], set: { count: sql`${siteStats.count} + 1` } });
  }

  async function avisarDueno(s: FilaSitio, titulo: string, cuerpo: string): Promise<void> {
    deps.hub.publicar(`usuario:${s.ownerId}`, { recurso: "sitios", aviso: { titulo, cuerpo } });
    const a = (s.settings ?? {}) as AjustesSitio;
    if (a.avisos === false) return;
    const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, s.ownerId));
    if (u?.role === "maestra") await deps.notifier.send({ title: titulo, message: cuerpo, priority: 3, tags: ["globe_with_meridians"] }).catch(() => undefined);
  }

  const enviarHtml = (reply: FastifyReply, html: string, codigo = 200) =>
    reply.code(codigo).header("content-security-policy", CSP_SITIO).header("cache-control", "no-cache").type("text/html; charset=utf-8").send(html);

  return async function (app: FastifyInstance): Promise<void> {
    const publico = { config: { acceso: { publico: true as const } } };

    // Solo responde si la petición llegó por un host de sitio (nunca por setup.mexicanland.net/__sitio).
    app.addHook("onRequest", async (request, reply) => {
      if (request.url.startsWith("/__sitio") && !detector.esSitio(request.headers.host)) return reply.code(404).send({ error: "No encontrado" });
    });

    app.get("/__sitio/_ms/runtime.js", publico, async (_r, reply) => reply.type("application/javascript; charset=utf-8").header("cache-control", "public, max-age=300").send(RUNTIME));
    app.get("/__sitio/sw.js", publico, async (_r, reply) => reply.type("application/javascript; charset=utf-8").header("cache-control", "no-cache").send(SERVICE_WORKER));

    app.get("/__sitio/robots.txt", publico, async (request, reply) => {
      await sitioDe(request);
      return reply.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: https://${limpiarHost(request.headers.host)}/sitemap.xml\n`);
    });

    app.get("/__sitio/sitemap.xml", publico, async (request, reply) => {
      const s = await sitioDe(request);
      const paginas = ((s.published as { paginas?: PaginaPublicada[] }).paginas ?? []).filter((p) => !p.privada);
      const base = `https://${limpiarHost(request.headers.host)}`;
      return reply
        .type("application/xml")
        .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paginas.map((p) => `<url><loc>${esc(base + p.ruta)}</loc></url>`).join("")}</urlset>`);
    });

    app.get("/__sitio/manifest.webmanifest", publico, async (request, reply) => {
      const s = await sitioDe(request);
      const a = (s.settings ?? {}) as AjustesSitio;
      const icono = urlArchivo(a.icono);
      return reply.type("application/manifest+json").send({
        name: a.titulo || s.name,
        short_name: (a.nombreCorto || s.name).slice(0, 12),
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: a.color || "#111111",
        icons: icono ? [{ src: icono, sizes: "512x512", type: "image/png", purpose: "any maskable" }] : [],
      });
    });

    app.get("/__sitio/_archivos/:id", publico, async (request, reply) => {
      const s = await sitioDe(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const [a] = await db.select().from(siteAssets).where(and(eq(siteAssets.id, id), eq(siteAssets.siteId, s.id)));
      const ruta = a ? join(carpetaArchivos(deps), "sitios", s.id, a.storedName) : "";
      if (!a || !existsSync(ruta)) throw new HttpError(404, "No encontrado");
      return reply.type(a.mime).header("cache-control", "public, max-age=86400").header("x-content-type-options", "nosniff").send(createReadStream(ruta));
    });

    app.get("/__sitio/_ms/datos/:tabla", publico, async (request) => {
      const s = await sitioDe(request);
      const { tabla } = z.object({ tabla: z.string().max(60) }).parse(request.params);
      const [t] = await db.select().from(siteTables).where(and(eq(siteTables.siteId, s.id), eq(siteTables.name, tabla)));
      return { filas: (t?.rows as unknown[]) ?? [] };
    });

    app.post("/__sitio/_ms/evento", publico, async (request) => {
      const s = await sitioDe(request);
      const d = z.object({ tipo: z.enum(["visita", "clic"]), clave: z.string().max(200).default(""), ref: z.string().max(200).optional() }).parse(request.body);
      limitar(request, `evento:${s.id}`, 120);
      await contar(s.id, d.tipo, d.clave);
      if (d.tipo === "visita" && d.ref) await contar(s.id, "ref", d.ref);
      return { ok: true };
    });

    app.post("/__sitio/_ms/formulario", publico, async (request) => {
      const s = await sitioDe(request);
      const d = z.object({ formulario: z.string().max(60).default("contacto"), datos: z.record(z.string().max(2000)) }).parse(request.body);
      limitar(request, `formulario:${s.id}`, 8);
      if (d.datos["_trampa"]) return { ok: true }; // campo oculto que solo llenan los bots
      if (Object.keys(d.datos).length > 30) throw new HttpError(400, "Formulario demasiado grande");
      await db.insert(siteEntries).values({ siteId: s.id, kind: "formulario", form: d.formulario, data: d.datos });
      const resumen = Object.entries(d.datos).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(" · ");
      await avisarDueno(s, `Nuevo mensaje en ${s.name}`, resumen.slice(0, 200));
      return { ok: true };
    });

    app.post("/__sitio/_ms/pedido", publico, async (request) => {
      const s = await sitioDe(request);
      const d = z
        .object({
          items: z.array(z.object({ nombre: z.string().max(120), precio: z.number().min(0).max(1_000_000), cantidad: z.number().int().min(1).max(999) })).min(1).max(50),
          cliente: z.record(z.string().max(500)),
        })
        .parse(request.body);
      limitar(request, `pedido:${s.id}`, 6);
      const total = d.items.reduce((t, i) => t + i.precio * i.cantidad, 0);
      await db.insert(siteEntries).values({ siteId: s.id, kind: "pedido", form: "pedido", data: { ...d, total } });
      await avisarDueno(s, `Nuevo pedido en ${s.name}`, `${d.cliente["nombre"] ?? "Cliente"} · ${d.items.length} producto(s) · $${total.toFixed(2)}`);
      return { ok: true };
    });

    app.post("/__sitio/_ms/entrar", publico, async (request, reply) => {
      const s = await sitioDe(request);
      limitar(request, `entrar:${s.id}`, 8);
      const d = z.object({ correo: z.string().trim().toLowerCase().max(200), clave: z.string().max(200) }).parse(request.body);
      const [m] = await db.select().from(siteMembers).where(and(eq(siteMembers.siteId, s.id), eq(siteMembers.email, d.correo)));
      if (!m || !(await verifySecret(m.passwordHash, d.clave))) throw new HttpError(401, "Correo o contraseña incorrectos");
      const vence = Date.now() + 30 * 24 * 60 * 60_000;
      reply.header(
        "set-cookie",
        `ms_sesion=${cookieMiembro(secreto(), s.id, m.id, vence)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 24 * 3600}${deps.config.isProduction ? "; Secure" : ""}`,
      );
      return { ok: true, nombre: m.name };
    });

    app.post("/__sitio/_ms/salir", publico, async (_request, reply) => {
      reply.header("set-cookie", "ms_sesion=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
      return { ok: true };
    });

    app.get("/__sitio/_ms/yo", publico, async (request) => {
      const s = await sitioDe(request);
      const id = leerMiembro(secreto(), s.id, leerCookie(request, "ms_sesion"), Date.now());
      if (!id) return { conectado: false };
      const [m] = await db.select({ name: siteMembers.name, email: siteMembers.email }).from(siteMembers).where(and(eq(siteMembers.id, id), eq(siteMembers.siteId, s.id)));
      return m ? { conectado: true, nombre: m.name, correo: m.email } : { conectado: false };
    });

    app.get("/__sitio/_ms/bloque/:tipo", publico, async (request) => {
      const s = await sitioDe(request);
      const { tipo } = z.object({ tipo: z.enum(["youtube", "clima", "servidores"]) }).parse(request.params);
      const q = z.object({ canal: z.string().regex(/^UC[\w-]{20,30}$/).optional(), lat: z.coerce.number().min(-90).max(90).optional(), lon: z.coerce.number().min(-180).max(180).optional() }).parse(request.query);
      const clave = `${s.id}|${tipo}|${q.canal ?? ""}|${q.lat ?? ""}|${q.lon ?? ""}`;
      const c = cacheBloques.get(clave);
      if (c && c.hasta > Date.now()) return c.valor;
      let valor: unknown = {};
      if (tipo === "youtube" && q.canal) {
        const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${q.canal}`, { signal: AbortSignal.timeout(8000) }).then((r) => r.text()).catch(() => "");
        valor = { video: /<yt:videoId>([\w-]{6,20})<\/yt:videoId>/.exec(xml)?.[1] ?? null };
      } else if (tipo === "clima" && q.lat !== undefined && q.lon !== undefined) {
        const d = (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${q.lat}&longitude=${q.lon}&current=temperature_2m,weather_code`, { signal: AbortSignal.timeout(8000) }).then((r) => r.json()).catch(() => null)) as {
          current?: { temperature_2m: number; weather_code: number };
        } | null;
        const codigo = d?.current?.weather_code ?? -1;
        valor = { temperatura: d?.current?.temperature_2m, texto: codigo === 0 ? "Despejado" : codigo <= 3 ? "Nublado" : codigo <= 67 ? "Lluvia" : codigo <= 77 ? "Nieve" : codigo >= 95 ? "Tormenta" : "" };
      } else if (tipo === "servidores") {
        const lista = ((s.settings ?? {}) as AjustesSitio).servidores ?? [];
        valor = {
          servidores: await Promise.all(
            lista.slice(0, 10).map(async (sv) => {
              const r = await ptero.peticion<{ attributes: { current_state: string } }>(`/api/client/servers/${encodeURIComponent(sv.id)}/resources`).catch(() => null);
              return { nombre: sv.nombre, direccion: sv.direccion ?? "", encendido: r?.attributes.current_state === "running" };
            }),
          ),
        };
      }
      cacheBloques.set(clave, { valor, hasta: Date.now() + (tipo === "servidores" ? 30_000 : 10 * 60_000) });
      return valor;
    });

    // Páginas: "/" y "/otra-pagina". Las privadas piden entrar con una cuenta del sitio.
    app.get("/__sitio/*", publico, async (request, reply) => {
      const host = limpiarHost(request.headers.host);
      let s: FilaSitio;
      try {
        s = await sitioDe(request);
      } catch {
        return enviarHtml(reply, paginaSimple("Sitio no disponible", `<h1>🚧</h1><p>Este sitio todavía no está publicado.</p>`), 404);
      }
      const ruta = ("/" + ((request.params as { "*": string })["*"] ?? "")).replace(/\/+$/, "").split("?")[0] || "/";
      const paginas = (s.published as { paginas?: PaginaPublicada[] }).paginas ?? [];
      const pagina = paginas.find((p) => p.ruta === ruta);
      if (!pagina) return enviarHtml(reply, paginaSimple("No encontrado", `<h1>404</h1><p>Esa página no existe.</p><p><a style="color:#9cf" href="/">Ir al inicio</a></p>`), 404);
      if (pagina.privada && !leerMiembro(secreto(), s.id, leerCookie(request, "ms_sesion"), Date.now())) {
        return enviarHtml(
          reply,
          paginaSimple(
            "Entrar",
            `<h2>Área privada</h2><p>Entra con tu cuenta de ${esc(s.name)}.</p><form data-ms-login data-ms-destino="${esc(ruta)}"><input name="correo" type="email" placeholder="Correo" required><input name="clave" type="password" placeholder="Contraseña" required><button>Entrar</button></form>`,
          ),
          401,
        );
      }
      return enviarHtml(reply, armarPagina(s, pagina, `https://${host}`));
    });
  };
}
