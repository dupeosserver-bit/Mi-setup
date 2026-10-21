/**
 * Cloudflare: vincular la cuenta (token de API guardado en Ajustes → Servicios y
 * claves) para crear los registros DNS de los sitios desde Mi Setup, y revisar
 * por qué un sitio publicado todavía no abre (DNS, certificado, publicación).
 * El token nunca sale del servidor y solo hace falta el permiso «Zone → DNS → Edit».
 */
import { resolve4 } from "node:dns/promises";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { siteEditors, sites } from "../db/schema.js";
import { HttpError, missingConfig } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "./common.js";

const API = "https://api.cloudflare.com/client/v4";
const DOMINIO = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

interface Zona {
  id: string;
  name: string;
  status: string;
}
interface Registro {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied?: boolean;
}
interface Respuesta<T> {
  success: boolean;
  result: T;
  errors?: { code: number; message: string }[];
}

/** Zona más específica que contiene ese dominio (a.b.com → b.com antes que com). */
export function zonaDe(dominio: string, zonas: readonly Zona[]): Zona | null {
  const d = dominio.toLowerCase();
  return [...zonas].filter((z) => d === z.name || d.endsWith(`.${z.name}`)).sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

const COMENTARIO = "Mi Setup (sitios)";

/**
 * Al borrar un sitio: quita de Cloudflare solo los registros que creó Mi Setup
 * para él (su dominio propio o nombre.DOMINIO, con el comentario «Mi Setup»).
 * Nunca toca el comodín «*» ni registros hechos a mano. Sin token no hace nada.
 */
export async function borrarDnsDeSitio(deps: Pick<ModuleDeps, "config">, hosts: readonly string[]): Promise<string[]> {
  const token = deps.config.env.CLOUDFLARE_API_TOKEN;
  if (!token || !hosts.length) return [];
  const pedir = async <T>(ruta: string, metodo = "GET"): Promise<T | null> => {
    const r = await fetch(`${API}${ruta}`, { method: metodo, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const d = r ? ((await r.json().catch(() => null)) as Respuesta<T> | null) : null;
    return d?.success ? d.result : null;
  };
  const zonas = (await pedir<Zona[]>("/zones?per_page=50&status=active")) ?? [];
  const borrados: string[] = [];
  for (const host of hosts.map((h) => h.toLowerCase())) {
    const zona = zonaDe(host, zonas);
    if (!zona || host.startsWith("*.")) continue;
    const lista = (await pedir<(Registro & { comment?: string | null })[]>(`/zones/${zona.id}/dns_records?per_page=100&name=${encodeURIComponent(host)}`)) ?? [];
    for (const r of lista) {
      if (r.name.toLowerCase() !== host || r.comment !== COMENTARIO) continue;
      if (await pedir(`/zones/${zona.id}/dns_records/${r.id}`, "DELETE")) borrados.push(`${r.type} ${r.name}`);
    }
  }
  return borrados;
}

/**
 * Al publicar: si nombre.DOMINIO (o el dominio propio) no tiene registro ni lo
 * cubre el comodín «*», crea su registro A hacia el VPS con el comentario
 * «Mi Setup» (así se borra junto con el sitio). Sin token no hace nada.
 */
export async function asegurarDnsDeSitio(deps: Pick<ModuleDeps, "config">, host: string): Promise<"creado" | "existia" | "comodin" | "sin_token" | "no_se_pudo"> {
  const token = deps.config.env.CLOUDFLARE_API_TOKEN;
  if (!token) return "sin_token";
  const pedir = async <T>(ruta: string, metodo = "GET", cuerpo?: unknown): Promise<T | null> => {
    const r = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    const d = r ? ((await r.json().catch(() => null)) as Respuesta<T> | null) : null;
    return d?.success ? d.result : null;
  };
  const nombre = host.toLowerCase();
  const zonas = (await pedir<Zona[]>("/zones?per_page=50&status=active")) ?? [];
  const zona = zonaDe(nombre, zonas);
  if (!zona) return "no_se_pudo";
  const buscar = (z: Zona, n: string) => pedir<Registro[]>(`/zones/${z.id}/dns_records?per_page=50&name=${encodeURIComponent(n)}`).then((l) => l ?? []);
  if ((await buscar(zona, nombre)).some((r) => ["A", "AAAA", "CNAME"].includes(r.type))) return "existia";
  // El comodín cubre un solo nivel: sitio.dominio.com, no a.b.dominio.com.
  const padre = nombre.slice(nombre.indexOf(".") + 1);
  if (padre.includes(".") && (await buscar(zona, `*.${padre}`)).length) return "comodin";
  const app = deps.config.env.APP_HOST.toLowerCase();
  const zonaApp = zonaDe(app, zonas);
  const ip = (zonaApp ? (await buscar(zonaApp, app)).find((r) => r.type === "A")?.content : undefined) ?? (await resolve4(app).catch(() => []))[0];
  if (!ip) return "no_se_pudo";
  const creado = await pedir(`/zones/${zona.id}/dns_records`, "POST", { type: "A", name: nombre, content: ip, ttl: 1, proxied: false, comment: COMENTARIO });
  return creado ? "creado" : "no_se_pudo";
}

export function cloudflareRoutes(deps: ModuleDeps) {
  async function cf<T>(ruta: string, init: { metodo?: string; cuerpo?: unknown } = {}): Promise<T> {
    const token = deps.config.env.CLOUDFLARE_API_TOKEN;
    if (!token) throw missingConfig("CLOUDFLARE_API_TOKEN");
    const r = await fetch(`${API}${ruta}`, {
      method: init.metodo ?? "GET",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(init.cuerpo !== undefined ? { body: JSON.stringify(init.cuerpo) } : {}),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!r) throw new HttpError(502, "Cloudflare no respondió");
    const d = (await r.json().catch(() => null)) as Respuesta<T> | null;
    if (!d?.success) {
      const msg = d?.errors?.[0]?.message ?? `error ${r.status}`;
      throw new HttpError(r.status === 401 || r.status === 403 ? 400 : 502, `Cloudflare: ${msg}${r.status === 403 ? " (revisa que el token tenga el permiso Zone → DNS → Edit)" : ""}`);
    }
    return d.result;
  }

  const zonas = () => cf<Zona[]>("/zones?per_page=50&status=active");
  const registros = (zona: string) => cf<Registro[]>(`/zones/${zona}/dns_records?per_page=500`);

  /** IP del VPS: el registro A de APP_HOST en Cloudflare o, si no está ahí, lo que responde el DNS. */
  async function ipServidor(lista: Registro[] = []): Promise<string | null> {
    const host = deps.config.env.APP_HOST.toLowerCase();
    const r = lista.find((x) => x.type === "A" && x.name.toLowerCase() === host);
    if (r) return r.content;
    return (await resolve4(host).catch(() => []))[0] ?? null;
  }

  async function crearA(zona: Zona, nombre: string, ip: string): Promise<"creado" | "existia"> {
    const lista = await registros(zona.id);
    const completo = nombre === "@" ? zona.name : nombre === "*" ? `*.${zona.name}` : nombre;
    const previo = lista.find((x) => x.name.toLowerCase() === completo.toLowerCase() && ["A", "CNAME"].includes(x.type));
    if (previo) {
      if (previo.type === "A" && previo.content === ip) return "existia";
      throw new HttpError(409, `${completo} ya apunta a otro lado (${previo.type} ${previo.content}). Cámbialo o bórralo en Cloudflare.`);
    }
    await cf(`/zones/${zona.id}/dns_records`, { metodo: "POST", cuerpo: { type: "A", name: completo, content: ip, ttl: 1, proxied: false, comment: COMENTARIO } });
    return "creado";
  }

  return async function (app: FastifyInstance): Promise<void> {
    const leer = { config: { acceso: { modulo: "sitios" as const, nivel: "lectura" as const } } };
    const cambiar = { config: { acceso: { modulo: "sitios" as const, nivel: "administrar" as const, reauth: "fuerte" as const } } };

    app.get("/api/cloudflare/estado", leer, async () => {
      if (!deps.config.env.CLOUDFLARE_API_TOKEN) return { configurado: false as const };
      const todas = await zonas();
      const principal = zonaDe(deps.config.env.DOMAIN, todas);
      const lista = principal ? await registros(principal.id) : [];
      const comodin = lista.find((x) => x.name.toLowerCase() === `*.${deps.config.env.DOMAIN.toLowerCase()}`);
      return {
        configurado: true as const,
        zonas: todas.map((z) => z.name),
        zonaPrincipal: principal?.name ?? null,
        ip: await ipServidor(lista),
        comodin: comodin ? { existe: true, ip: comodin.content, nube: Boolean(comodin.proxied) } : { existe: false, ip: null, nube: false },
      };
    });

    /** Crea el registro «*» (todos los sitios nombre.DOMINIO) con la nube gris. */
    app.post("/api/cloudflare/comodin", cambiar, async (request) => {
      const todas = await zonas();
      const zona = zonaDe(deps.config.env.DOMAIN, todas);
      if (!zona) throw new HttpError(404, `Ese token no ve la zona ${deps.config.env.DOMAIN}. Crea el token para esa zona.`);
      const ip = await ipServidor(await registros(zona.id));
      if (!ip) throw new HttpError(400, `No encontré la IP del VPS: crea primero el registro A de ${deps.config.env.APP_HOST}.`);
      const r = await crearA(zona, "*", ip);
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "cloudflare_comodin", module: "sitios", target: `*.${zona.name}`, outcome: "ok", ...clientInfo(request) });
      return { ok: true, resultado: r, ip };
    });

    /** Dominio propio de un sitio: su registro A hacia el VPS (si la zona está en la misma cuenta de Cloudflare). */
    app.post("/api/cloudflare/dominio", cambiar, async (request) => {
      const { dominio } = z.object({ dominio: z.string().trim().toLowerCase().regex(DOMINIO, "Dominio inválido") }).parse(request.body);
      const todas = await zonas();
      const zona = zonaDe(dominio, todas);
      if (!zona) throw new HttpError(404, `${dominio} no está en tu cuenta de Cloudflare. Pon el registro A a mano o agrega el dominio a Cloudflare.`);
      const principal = zonaDe(deps.config.env.DOMAIN, todas);
      const ip = await ipServidor(principal ? await registros(principal.id) : []);
      if (!ip) throw new HttpError(400, "No encontré la IP del VPS");
      const r = await crearA(zona, dominio === zona.name ? "@" : dominio, ip);
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "cloudflare_dominio", module: "sitios", target: dominio, outcome: "ok", ...clientInfo(request) });
      return { ok: true, resultado: r, ip };
    });

    /** Crea el registro DNS de ese sitio (el mismo que se crea solo al publicar). */
    app.post("/api/sitios/:id/dns", cambiar, async (request) => {
      const { id } = idParams.parse(request.params);
      const [s] = await deps.db.select().from(sites).where(eq(sites.id, id));
      if (!s) throw new HttpError(404, "Sitio no encontrado");
      if (!deps.config.env.CLOUDFLARE_API_TOKEN) throw missingConfig("CLOUDFLARE_API_TOKEN");
      const host = s.customDomain ?? `${s.slug}.${deps.config.env.DOMAIN}`;
      const resultado = await asegurarDnsDeSitio(deps, host);
      if (resultado === "no_se_pudo") throw new HttpError(502, `No pude crear el registro de ${host}: revisa que el token vea esa zona en Cloudflare y que exista el registro A de ${deps.config.env.APP_HOST}.`);
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "cloudflare_dns_sitio", module: "sitios", target: host, outcome: "ok", details: { resultado }, ...clientInfo(request) });
      return { ok: true, resultado, host };
    });

    /** Por qué un sitio todavía no abre: publicado → DNS → HTTPS. */
    app.get("/api/sitios/:id/diagnostico", leer, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const [s] = await deps.db.select().from(sites).where(eq(sites.id, id));
      if (!s) throw new HttpError(404, "Sitio no encontrado");
      if (s.ownerId !== user.id && user.role !== "maestra") {
        const [e] = await deps.db.select().from(siteEditors).where(and(eq(siteEditors.siteId, id), eq(siteEditors.userId, user.id)));
        if (!e) throw new HttpError(403, "No tienes acceso a este sitio");
      }
      const host = s.customDomain ?? `${s.slug}.${deps.config.env.DOMAIN}`;
      const pasos: { id: string; ok: boolean; detalle: string }[] = [];
      pasos.push({ id: "publicado", ok: Boolean(s.published), detalle: s.published ? "El sitio está publicado." : "Falta tocar «Publicar» en el editor." });

      const esperada = await ipServidor();
      const ips = await resolve4(host).catch(() => [] as string[]);
      const apunta = ips.length > 0 && (!esperada || ips.includes(esperada));
      pasos.push({
        id: "dns",
        ok: apunta,
        detalle: ips.length === 0 ? `${host} todavía no existe en internet (falta el registro DNS).` : apunta ? `${host} apunta a ${ips[0]}.` : `${host} apunta a ${ips[0]} y tu VPS es ${esperada}.`,
      });

      let https = { ok: false, detalle: "Se revisa cuando el DNS ya apunta al VPS." };
      if (apunta && s.published) {
        const r = await fetch(`https://${host}/robots.txt`, { signal: AbortSignal.timeout(8000) }).catch((err: unknown) => err as Error);
        https =
          r instanceof Response
            ? { ok: r.ok, detalle: r.ok ? "HTTPS responde." : `El sitio respondió ${r.status}.` }
            : { ok: false, detalle: "HTTPS no responde todavía (el certificado se pide solo la primera vez; si sigue así, reinicia Caddy en el VPS)." };
      }
      pasos.push({ id: "https", ok: https.ok, detalle: https.detalle });

      return { host, url: `https://${host}`, pasos, listo: pasos.every((p) => p.ok), cloudflare: Boolean(deps.config.env.CLOUDFLARE_API_TOKEN), dnsFalta: !apunta };
    });
  };
}
