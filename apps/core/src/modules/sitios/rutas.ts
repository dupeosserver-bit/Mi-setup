/**
 * Creador de sitios y apps: administración (solo con sesión de Mi Setup).
 * Cada sitio es de su dueño; puede invitar a otras cuentas a editarlo.
 */
import { borrarDnsDeSitio } from "../cloudflare.js";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { and, asc, desc, eq, gte, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import { hashSecret } from "../../auth/password.js";
import { aiUsage, charges, clients, siteAssets, siteEditors, siteEntries, siteMembers, sites, siteStats, siteTables, siteVersions, users } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import { can } from "@mi-setup/shared";
import { currentUser, type AuthUser } from "../../security/rbac.js";
import { clientInfo, idParams, type ModuleDeps } from "../common.js";
import { carpetaArchivos } from "../herramientas.js";
import { calcularCosto, clienteAnthropic, clienteOllama, type ClienteIa } from "../ia/servicio.js";
import { SLUG_VALIDO, SLUGS_RESERVADOS, type DetectorSitios } from "./detector.js";
import { armarPagina, type AjustesSitio, type PaginaPublicada } from "./publico.js";
import { RUNTIME } from "./runtime.js";

const MAX_IMAGEN = 10 * 1024 * 1024;
const TIPOS_IMAGEN = /^image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon)$/;
const DOMINIO = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

const ajustesSchema = z.object({
  titulo: z.string().max(120).optional(),
  descripcion: z.string().max(300).optional(),
  icono: z.string().max(500).optional(),
  imagenCompartir: z.string().max(500).optional(),
  whatsapp: z.string().max(20).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/).or(z.literal("")).optional(),
  moneda: z.enum(["MXN", "USD", "EUR"]).optional(),
  app: z.boolean().optional(),
  nombreCorto: z.string().max(12).optional(),
  fuentes: z.array(z.string().regex(/^[\w -]{2,40}$/)).max(5).optional(),
  servidores: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9-]{8,36}$/), nombre: z.string().max(60), direccion: z.string().max(100).optional() })).max(10).optional(),
  avisos: z.boolean().optional(),
  /** Cómo se paga (transferencia, OXXO, PayPal…): se muestra al cliente al enviar su pedido. */
  pago: z.string().max(700).optional(),
});

const paginaSchema = z.object({
  ruta: z.string().regex(/^\/([a-z0-9-]{1,40})?$/, "Ruta inválida (usa minúsculas y guiones)"),
  titulo: z.string().max(120).default(""),
  html: z.string().max(2_000_000),
  css: z.string().max(1_000_000),
  privada: z.boolean().default(false),
});

const columnaSchema = z.object({ nombre: z.string().regex(/^[a-z0-9_]{1,30}$/), tipo: z.enum(["texto", "numero", "imagen", "enlace"]) });

export function sitiosRoutes(deps: ModuleDeps, detector: DetectorSitios, clienteIa?: ClienteIa) {
  const { db } = deps;
  const dirSitio = (id: string) => join(carpetaArchivos(deps), "sitios", id);

  async function refrescarDominios(): Promise<void> {
    const filas = await db.select({ d: sites.customDomain }).from(sites).where(and(isNotNull(sites.customDomain), isNotNull(sites.published)));
    detector.version++;
    detector.dominios.clear();
    for (const f of filas) if (f.d) detector.dominios.add(f.d);
  }
  void refrescarDominios().catch(() => undefined);

  /** El sitio, si eres su dueño o editor. Solo el dueño (o la maestra) para cosas delicadas. */
  async function sitioPara(user: AuthUser, id: string, soloDueno = false) {
    const [s] = await db.select().from(sites).where(eq(sites.id, id));
    if (!s) throw new HttpError(404, "Sitio no encontrado");
    if (s.ownerId === user.id || user.role === "maestra") return s;
    if (!soloDueno) {
      const [e] = await db.select().from(siteEditors).where(and(eq(siteEditors.siteId, id), eq(siteEditors.userId, user.id)));
      if (e) return s;
    }
    throw new HttpError(403, soloDueno ? "Solo el dueño del sitio puede hacer esto" : "No tienes acceso a este sitio");
  }
  const sitioDe = (request: FastifyRequest, soloDueno = false) => sitioPara(currentUser(request), idParams.parse(request.params).id, soloDueno);

  const urlPublica = (s: { slug: string; customDomain: string | null }) =>
    s.customDomain ? `https://${s.customDomain}` : deps.config.isProduction ? `https://${s.slug}.${deps.config.env.DOMAIN}` : `http://${s.slug}.localhost:${deps.config.env.PORT}`;

  const vistaSitio = (s: typeof sites.$inferSelect) => ({
    id: s.id,
    nombre: s.name,
    slug: s.slug,
    dominio: s.customDomain,
    url: urlPublica(s),
    publicado: Boolean(s.published),
    publicadoEn: s.publishedAt?.toISOString() ?? null,
    actualizado: s.updatedAt.toISOString(),
    ajustes: s.settings as AjustesSitio,
    duenoId: s.ownerId,
  });

  function iaDisponible(): ClienteIa | null {
    if (clienteIa) return clienteIa;
    if (deps.config.env.ANTHROPIC_API_KEY) return clienteAnthropic(deps.config.env.ANTHROPIC_API_KEY);
    if (deps.config.env.OLLAMA_URL) return clienteOllama(deps.config.env.OLLAMA_URL, deps.config.env.OLLAMA_MODEL);
    return null;
  }

  return async function (app: FastifyInstance): Promise<void> {
    const leer = { config: { acceso: { modulo: "sitios" as const, nivel: "lectura" as const } } };
    const escribir = { config: { acceso: { modulo: "sitios" as const, nivel: "escritura" as const } } };

    // Caddy pregunta aquí antes de pedir un certificado HTTPS para un dominio (on_demand_tls).
    app.get("/api/sitios/tls", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { domain } = z.object({ domain: z.string().max(253) }).parse(request.query);
      const h = domain.toLowerCase();
      const slug = detector.slugDe(h);
      const [s] = slug ? await db.select({ p: sites.published }).from(sites).where(eq(sites.slug, slug)) : await db.select({ p: sites.published }).from(sites).where(eq(sites.customDomain, h));
      return reply.code(s?.p ? 200 : 404).send({ ok: Boolean(s?.p) });
    });

    app.get("/api/sitios", leer, async (request) => {
      const user = currentUser(request);
      const compartidos = db.select({ id: siteEditors.siteId }).from(siteEditors).where(eq(siteEditors.userId, user.id));
      const filas = await db
        .select()
        .from(sites)
        .where(or(eq(sites.ownerId, user.id), inArray(sites.id, compartidos)))
        .orderBy(desc(sites.updatedAt));
      return filas.map(vistaSitio);
    });

    app.post("/api/sitios", escribir, async (request) => {
      const user = currentUser(request);
      const d = z.object({ nombre: z.string().trim().min(1).max(80), slug: z.string().trim().toLowerCase(), plantilla: z.object({ html: z.string().max(500_000), css: z.string().max(200_000), tablas: z.array(z.object({ nombre: z.string().regex(/^[a-z0-9_-]{1,40}$/), columnas: z.array(columnaSchema).min(1).max(20), filas: z.array(z.record(z.union([z.string().max(2000), z.number()]))).max(200) })).max(5).optional() }).optional() }).parse(request.body);
      if (!SLUG_VALIDO.test(d.slug) || SLUGS_RESERVADOS.has(d.slug)) throw new HttpError(400, "Esa dirección no se puede usar (minúsculas, números y guiones; sin nombres reservados)");
      const [existe] = await db.select({ id: sites.id }).from(sites).where(eq(sites.slug, d.slug));
      if (existe) throw new HttpError(409, "Esa dirección ya la usa otro sitio");
      const [s] = await db
        .insert(sites)
        .values({ ownerId: user.id, name: d.nombre, slug: d.slug, draft: d.plantilla ? { plantilla: d.plantilla } : {}, settings: { titulo: d.nombre, moneda: "MXN", avisos: true } })
        .returning();
      if (!s) throw new HttpError(500, "No se pudo crear");
      // Las plantillas pueden traer sus tablas de datos (por ejemplo los planes de hosting).
      for (const t of d.plantilla?.tablas ?? []) await db.insert(siteTables).values({ siteId: s.id, name: t.nombre, columns: t.columnas, rows: t.filas });
      return vistaSitio(s);
    });

    app.get("/api/sitios/:id", leer, async (request) => {
      const s = await sitioDe(request);
      return { ...vistaSitio(s), borrador: s.draft };
    });

    app.put("/api/sitios/:id/borrador", { ...escribir, bodyLimit: 8 * 1024 * 1024 }, async (request) => {
      const s = await sitioDe(request);
      const { borrador } = z.object({ borrador: z.record(z.unknown()) }).parse(request.body);
      await db.update(sites).set({ draft: borrador, updatedAt: deps.now() }).where(eq(sites.id, s.id));
      return { ok: true };
    });

    app.put("/api/sitios/:id/ajustes", escribir, async (request) => {
      const s = await sitioDe(request);
      const d = z
        .object({
          nombre: z.string().trim().min(1).max(80).optional(),
          slug: z.string().trim().toLowerCase().optional(),
          dominio: z.string().trim().toLowerCase().max(253).nullable().optional(),
          ajustes: ajustesSchema.optional(),
        })
        .parse(request.body);
      const cambios: Partial<typeof sites.$inferInsert> = { updatedAt: deps.now() };
      if (d.nombre) cambios.name = d.nombre;
      if (d.slug && d.slug !== s.slug) {
        if (!SLUG_VALIDO.test(d.slug) || SLUGS_RESERVADOS.has(d.slug)) throw new HttpError(400, "Esa dirección no se puede usar");
        const [otro] = await db.select({ id: sites.id }).from(sites).where(eq(sites.slug, d.slug));
        if (otro) throw new HttpError(409, "Esa dirección ya la usa otro sitio");
        cambios.slug = d.slug;
      }
      if (d.dominio !== undefined) {
        const dom = d.dominio ? d.dominio.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null;
        if (dom && (!DOMINIO.test(dom) || dom === deps.config.env.APP_HOST || dom.endsWith(`.${deps.config.env.DOMAIN}`) || dom === deps.config.env.DOMAIN)) throw new HttpError(400, "Dominio inválido");
        if (dom) {
          const [otro] = await db.select({ id: sites.id }).from(sites).where(eq(sites.customDomain, dom));
          if (otro && otro.id !== s.id) throw new HttpError(409, "Ese dominio ya lo usa otro sitio");
        }
        cambios.customDomain = dom;
      }
      if (d.ajustes) cambios.settings = { ...(s.settings as AjustesSitio), ...d.ajustes };
      const [n] = await db.update(sites).set(cambios).where(eq(sites.id, s.id)).returning();
      await refrescarDominios();
      return vistaSitio(n!);
    });

    app.post("/api/sitios/:id/publicar", { ...escribir, bodyLimit: 8 * 1024 * 1024 }, async (request) => {
      const s = await sitioDe(request);
      const d = z.object({ paginas: z.array(paginaSchema).min(1).max(30), nota: z.string().max(200).default("") }).parse(request.body);
      if (!d.paginas.some((p) => p.ruta === "/")) throw new HttpError(400, "Falta la página de inicio (ruta /)");
      const rutas = new Set(d.paginas.map((p) => p.ruta));
      if (rutas.size !== d.paginas.length) throw new HttpError(400, "Hay dos páginas con la misma ruta");
      const publicado = { paginas: d.paginas };
      await db.update(sites).set({ published: publicado, publishedAt: deps.now(), updatedAt: deps.now() }).where(eq(sites.id, s.id));
      await db.insert(siteVersions).values({ siteId: s.id, draft: s.draft as object, published: publicado, note: d.nota || `Publicado el ${deps.now().toLocaleString("es-MX")}` });
      // Solo se guardan las 30 publicaciones más recientes.
      const viejas = await db.select({ id: siteVersions.id }).from(siteVersions).where(eq(siteVersions.siteId, s.id)).orderBy(desc(siteVersions.createdAt)).offset(30);
      if (viejas.length) await db.delete(siteVersions).where(inArray(siteVersions.id, viejas.map((v) => v.id)));
      await refrescarDominios();
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "sitio_publicado", module: "sitios", target: s.slug, outcome: "ok", ...clientInfo(request) });
      return { ok: true, url: urlPublica(s) };
    });

    app.post("/api/sitios/:id/despublicar", escribir, async (request) => {
      const s = await sitioDe(request);
      await db.update(sites).set({ published: null, publishedAt: null }).where(eq(sites.id, s.id));
      await refrescarDominios();
      return { ok: true };
    });

    app.get("/api/sitios/:id/versiones", leer, async (request) => {
      const s = await sitioDe(request);
      const filas = await db.select({ id: siteVersions.id, nota: siteVersions.note, creado: siteVersions.createdAt }).from(siteVersions).where(eq(siteVersions.siteId, s.id)).orderBy(desc(siteVersions.createdAt));
      return filas.map((v) => ({ ...v, creado: v.creado.toISOString() }));
    });

    app.post("/api/sitios/:id/versiones/:version/restaurar", escribir, async (request) => {
      const s = await sitioDe(request);
      const { version } = z.object({ version: z.string().uuid() }).parse(request.params);
      const [v] = await db.select().from(siteVersions).where(and(eq(siteVersions.id, version), eq(siteVersions.siteId, s.id)));
      if (!v) throw new HttpError(404, "Versión no encontrada");
      await db.update(sites).set({ draft: v.draft, published: v.published, publishedAt: deps.now(), updatedAt: deps.now() }).where(eq(sites.id, s.id));
      await refrescarDominios();
      return { ok: true };
    });

    app.delete("/api/sitios/:id", { config: { acceso: { modulo: "sitios" as const, nivel: "escritura" as const, reauth: "pin" as const } } }, async (request) => {
      const s = await sitioDe(request, true);
      await db.delete(sites).where(eq(sites.id, s.id));
      await rm(dirSitio(s.id), { recursive: true, force: true });
      await refrescarDominios();
      // También su DNS en Cloudflare (solo lo que creó Mi Setup; el comodín «*» se queda).
      const dns = await borrarDnsDeSitio(deps, [`${s.slug}.${deps.config.env.DOMAIN}`, ...(s.customDomain ? [s.customDomain] : [])]).catch(() => []);
      await deps.audit.record({ actorType: "usuario", actorUserId: currentUser(request).id, action: "sitio_borrado", module: "sitios", target: s.slug, outcome: "ok", details: { dns }, ...clientInfo(request) });
      return { ok: true, dns };
    });

    // ---------------------------------------------------------- imágenes y archivos
    app.get("/api/sitios/:id/archivos", leer, async (request) => {
      const s = await sitioDe(request);
      const filas = await db.select().from(siteAssets).where(eq(siteAssets.siteId, s.id)).orderBy(desc(siteAssets.createdAt));
      return filas.map((a) => ({ id: a.id, nombre: a.name, tipo: a.mime, tamano: a.size, url: `/api/sitios/${s.id}/archivos/${a.id}`, urlPublica: `/_archivos/${a.id}` }));
    });

    app.get("/api/sitios/:id/archivos/:archivo", { config: { acceso: { publico: true } } }, async (request, reply) => {
      // Las imágenes del editor se ven sin sesión (son las mismas que el sitio publica).
      const { id, archivo } = z.object({ id: z.string().uuid(), archivo: z.string().uuid() }).parse(request.params);
      const [a] = await db.select().from(siteAssets).where(and(eq(siteAssets.id, archivo), eq(siteAssets.siteId, id)));
      if (!a) throw new HttpError(404, "No encontrado");
      const datos = await readFile(join(dirSitio(id), a.storedName)).catch(() => null);
      if (!datos) throw new HttpError(404, "No encontrado");
      return reply.type(a.mime).header("cache-control", "public, max-age=86400").header("x-content-type-options", "nosniff").send(datos);
    });

    app.post("/api/sitios/:id/archivos", { ...escribir, bodyLimit: MAX_IMAGEN + 1024 * 1024 }, async (request) => {
      const s = await sitioDe(request);
      const archivo = await request.file({ limits: { fileSize: MAX_IMAGEN, files: 1 } });
      if (!archivo) throw new HttpError(400, "Falta el archivo");
      if (!TIPOS_IMAGEN.test(archivo.mimetype)) throw new HttpError(415, "Solo imágenes (PNG, JPG, WebP, GIF, SVG o ICO)");
      await mkdir(dirSitio(s.id), { recursive: true });
      const guardado = crypto.randomUUID();
      const ruta = join(dirSitio(s.id), guardado);
      await pipeline(archivo.file, createWriteStream(ruta));
      if (archivo.file.truncated) {
        await unlink(ruta).catch(() => undefined);
        throw new HttpError(413, "La imagen supera 10 MB");
      }
      const { size } = await stat(ruta);
      const [a] = await db.insert(siteAssets).values({ siteId: s.id, name: archivo.filename.slice(0, 120), storedName: guardado, mime: archivo.mimetype, size }).returning();
      return { id: a!.id, url: `/api/sitios/${s.id}/archivos/${a!.id}`, urlPublica: `/_archivos/${a!.id}` };
    });

    app.delete("/api/sitios/:id/archivos/:archivo", escribir, async (request) => {
      const s = await sitioDe(request);
      const { archivo } = z.object({ archivo: z.string().uuid() }).parse(request.params);
      const [a] = await db.delete(siteAssets).where(and(eq(siteAssets.id, archivo), eq(siteAssets.siteId, s.id))).returning();
      if (a) await unlink(join(dirSitio(s.id), a.storedName)).catch(() => undefined);
      return { ok: true };
    });

    // ---------------------------------------------------------- formularios y pedidos
    app.get("/api/sitios/:id/entradas", leer, async (request) => {
      const s = await sitioDe(request);
      const filas = await db.select().from(siteEntries).where(eq(siteEntries.siteId, s.id)).orderBy(desc(siteEntries.createdAt)).limit(500);
      return filas.map((e) => ({ id: e.id, tipo: e.kind, formulario: e.form, datos: e.data, leida: e.read, creado: e.createdAt.toISOString() }));
    });
    app.patch("/api/sitios/:id/entradas/:entrada", escribir, async (request) => {
      const s = await sitioDe(request);
      const { entrada } = z.object({ entrada: z.string().uuid() }).parse(request.params);
      const { leida } = z.object({ leida: z.boolean() }).parse(request.body);
      await db.update(siteEntries).set({ read: leida }).where(and(eq(siteEntries.id, entrada), eq(siteEntries.siteId, s.id)));
      return { ok: true };
    });
    /** De un pedido a un cliente con cobro recurrente (Clientes y cobros): así tu hosting queda con fecha de pago y recordatorios. */
    app.post("/api/sitios/:id/entradas/:entrada/cobro", escribir, async (request) => {
      const user = currentUser(request);
      const s = await sitioDe(request);
      if (!can(user, "clientes", "escritura")) throw new HttpError(403, "Necesitas permiso en «Clientes y cobros» para crear el cobro", "sin_permiso");
      const { entrada } = z.object({ entrada: z.string().uuid() }).parse(request.params);
      const d = z
        .object({
          concepto: z.string().trim().min(1).max(200),
          monto: z.number().positive().max(1_000_000_000),
          frecuencia: z.enum(["mensual", "trimestral", "anual", "unico"]),
          proximoCobro: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        })
        .parse(request.body);
      const [e] = await db.select().from(siteEntries).where(and(eq(siteEntries.id, entrada), eq(siteEntries.siteId, s.id)));
      if (!e || e.kind !== "pedido") throw new HttpError(404, "Pedido no encontrado");
      const datos = e.data as { cliente?: Record<string, string>; cobro?: string };
      if (datos.cobro) throw new HttpError(409, "Este pedido ya tiene su cobro creado");
      const c = datos.cliente ?? {};
      const [cliente] = await db
        .insert(clients)
        .values({ name: (c["nombre"] ?? "Cliente del sitio").slice(0, 120), contact: [c["telefono"], c["correo"] ?? c["email"]].filter(Boolean).join(" · ").slice(0, 200), notes: `Pedido en el sitio ${s.name}` })
        .returning({ id: clients.id });
      const [cobro] = await db
        .insert(charges)
        .values({ clientId: cliente!.id, concept: d.concepto, amount: d.monto.toFixed(2), currency: ((s.settings as { moneda?: string }).moneda ?? "MXN").slice(0, 3), frequency: d.frecuencia, nextDue: new Date(`${d.proximoCobro}T12:00:00Z`), status: "activo" })
        .returning({ id: charges.id });
      await db.update(siteEntries).set({ data: { ...datos, cobro: cobro!.id, clienteId: cliente!.id }, read: true }).where(eq(siteEntries.id, e.id));
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "cobro_desde_pedido", module: "sitios", target: s.name, outcome: "ok", ...clientInfo(request) });
      return { ok: true, clienteId: cliente!.id, cobroId: cobro!.id };
    });

    app.delete("/api/sitios/:id/entradas/:entrada", escribir, async (request) => {
      const s = await sitioDe(request);
      const { entrada } = z.object({ entrada: z.string().uuid() }).parse(request.params);
      await db.delete(siteEntries).where(and(eq(siteEntries.id, entrada), eq(siteEntries.siteId, s.id)));
      return { ok: true };
    });

    // ---------------------------------------------------------- tablas de datos
    app.get("/api/sitios/:id/tablas", leer, async (request) => {
      const s = await sitioDe(request);
      const filas = await db.select().from(siteTables).where(eq(siteTables.siteId, s.id)).orderBy(asc(siteTables.name));
      return filas.map((t) => ({ id: t.id, nombre: t.name, columnas: t.columns, filas: t.rows, actualizado: t.updatedAt.toISOString() }));
    });
    app.put("/api/sitios/:id/tablas/:nombre", { ...escribir, bodyLimit: 4 * 1024 * 1024 }, async (request) => {
      const s = await sitioDe(request);
      const { nombre } = z.object({ nombre: z.string().regex(/^[a-z0-9_-]{1,40}$/, "Nombre de tabla inválido") }).parse(request.params);
      const d = z.object({ columnas: z.array(columnaSchema).min(1).max(20), filas: z.array(z.record(z.union([z.string().max(2000), z.number()]))).max(2000) }).parse(request.body);
      await db
        .insert(siteTables)
        .values({ siteId: s.id, name: nombre, columns: d.columnas, rows: d.filas })
        .onConflictDoUpdate({ target: [siteTables.siteId, siteTables.name], set: { columns: d.columnas, rows: d.filas, updatedAt: deps.now() } });
      return { ok: true };
    });
    app.delete("/api/sitios/:id/tablas/:nombre", escribir, async (request) => {
      const s = await sitioDe(request);
      const { nombre } = z.object({ nombre: z.string().max(40) }).parse(request.params);
      await db.delete(siteTables).where(and(eq(siteTables.siteId, s.id), eq(siteTables.name, nombre)));
      return { ok: true };
    });

    // ---------------------------------------------------------- cuentas del área privada
    app.get("/api/sitios/:id/cuentas", leer, async (request) => {
      const s = await sitioDe(request);
      const filas = await db.select({ id: siteMembers.id, correo: siteMembers.email, nombre: siteMembers.name, creado: siteMembers.createdAt }).from(siteMembers).where(eq(siteMembers.siteId, s.id)).orderBy(asc(siteMembers.email));
      return filas.map((m) => ({ ...m, creado: m.creado.toISOString() }));
    });
    app.post("/api/sitios/:id/cuentas", escribir, async (request) => {
      const s = await sitioDe(request);
      const d = z.object({ correo: z.string().trim().toLowerCase().email().max(200), nombre: z.string().trim().max(80).default(""), clave: z.string().min(8).max(200) }).parse(request.body);
      const [ya] = await db.select({ id: siteMembers.id }).from(siteMembers).where(and(eq(siteMembers.siteId, s.id), eq(siteMembers.email, d.correo)));
      if (ya) {
        await db.update(siteMembers).set({ name: d.nombre, passwordHash: await hashSecret(d.clave) }).where(eq(siteMembers.id, ya.id));
        return { ok: true, actualizada: true };
      }
      await db.insert(siteMembers).values({ siteId: s.id, email: d.correo, name: d.nombre, passwordHash: await hashSecret(d.clave) });
      return { ok: true };
    });
    app.delete("/api/sitios/:id/cuentas/:cuenta", escribir, async (request) => {
      const s = await sitioDe(request);
      const { cuenta } = z.object({ cuenta: z.string().uuid() }).parse(request.params);
      await db.delete(siteMembers).where(and(eq(siteMembers.id, cuenta), eq(siteMembers.siteId, s.id)));
      return { ok: true };
    });

    // ---------------------------------------------------------- editores (compartir)
    app.get("/api/sitios/:id/editores", leer, async (request) => {
      const s = await sitioDe(request);
      return db.select({ id: users.id, correo: users.email, nombre: users.displayName }).from(siteEditors).innerJoin(users, eq(users.id, siteEditors.userId)).where(eq(siteEditors.siteId, s.id));
    });
    app.post("/api/sitios/:id/editores", escribir, async (request) => {
      const s = await sitioDe(request, true);
      const { correo } = z.object({ correo: z.string().trim().toLowerCase().email() }).parse(request.body);
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, correo));
      if (!u) throw new HttpError(404, "No hay una cuenta de Mi Setup con ese correo");
      if (u.id === s.ownerId) throw new HttpError(400, "Ya es el dueño");
      await db.insert(siteEditors).values({ siteId: s.id, userId: u.id }).onConflictDoNothing();
      deps.hub.publicar(`usuario:${u.id}`, { recurso: "sitios", aviso: { titulo: "Te compartieron un sitio", cuerpo: `Ya puedes editar «${s.name}» en Sitios web.` } });
      return { ok: true };
    });
    app.delete("/api/sitios/:id/editores/:usuario", escribir, async (request) => {
      const s = await sitioDe(request, true);
      const { usuario } = z.object({ usuario: z.string().uuid() }).parse(request.params);
      await db.delete(siteEditors).where(and(eq(siteEditors.siteId, s.id), eq(siteEditors.userId, usuario)));
      return { ok: true };
    });

    // ---------------------------------------------------------- estadísticas
    app.get("/api/sitios/:id/estadisticas", leer, async (request) => {
      const s = await sitioDe(request);
      const { dias } = z.object({ dias: z.coerce.number().int().min(1).max(365).default(30) }).parse(request.query);
      const desde = new Date(deps.now().getTime() - (dias - 1) * 86_400_000).toISOString().slice(0, 10);
      const filas = await db.select().from(siteStats).where(and(eq(siteStats.siteId, s.id), gte(siteStats.day, desde)));
      const porDia = new Map<string, number>();
      const sumar = (tipo: string) => {
        const m = new Map<string, number>();
        for (const f of filas.filter((x) => x.kind === tipo)) m.set(f.key, (m.get(f.key) ?? 0) + f.count);
        return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([clave, total]) => ({ clave, total }));
      };
      for (const f of filas.filter((x) => x.kind === "visita")) porDia.set(f.day, (porDia.get(f.day) ?? 0) + f.count);
      const serie = Array.from({ length: dias }, (_, i) => {
        const dia = new Date(deps.now().getTime() - (dias - 1 - i) * 86_400_000).toISOString().slice(0, 10);
        return { dia, visitas: porDia.get(dia) ?? 0 };
      });
      return { serie, total: serie.reduce((t, x) => t + x.visitas, 0), paginas: sumar("visita"), clics: sumar("clic"), origenes: sumar("ref") };
    });

    // ---------------------------------------------------------- exportar en ZIP
    app.get("/api/sitios/:id/exportar", leer, async (request, reply) => {
      const s = await sitioDe(request);
      const paginas = ((s.published as { paginas?: PaginaPublicada[] } | null)?.paginas ?? []) as PaginaPublicada[];
      if (!paginas.length) throw new HttpError(400, "Publica el sitio primero (se exporta lo publicado)");
      const archivos: Record<string, Uint8Array> = {};
      for (const p of paginas) {
        const html = armarPagina(s, p, urlPublica(s))
          .replace(/\/_ms\/runtime\.js/g, "_ms/runtime.js")
          .replace(/(["'(])\/_archivos\/([0-9a-f-]{36})/g, "$1archivos/$2");
        archivos[p.ruta === "/" ? "index.html" : `${p.ruta.slice(1)}/index.html`] = strToU8(html);
      }
      archivos["_ms/runtime.js"] = strToU8(RUNTIME);
      const assets = await db.select().from(siteAssets).where(eq(siteAssets.siteId, s.id));
      for (const a of assets) {
        const datos = await readFile(join(dirSitio(s.id), a.storedName)).catch(() => null);
        if (datos) archivos[`archivos/${a.id}`] = new Uint8Array(datos);
      }
      archivos["LEEME.txt"] = strToU8(
        `Sitio «${s.name}» exportado desde Mi Setup.\nSube estos archivos a cualquier hosting. Los formularios, pedidos, tablas, cuentas y estadísticas solo funcionan publicado en Mi Setup.\n`,
      );
      return reply
        .type("application/zip")
        .header("content-disposition", `attachment; filename="${s.slug}.zip"`)
        .send(Buffer.from(zipSync(archivos, { level: 6 })));
    });

    // ---------------------------------------------------------- "Hazlo con IA"
    app.post("/api/sitios/ia", escribir, async (request) => {
      const user = currentUser(request);
      const { descripcion } = z.object({ descripcion: z.string().trim().min(5).max(2000) }).parse(request.body);
      const cliente = iaDisponible();
      if (!cliente) throw new HttpError(400, "Configura la IA (ANTHROPIC_API_KEY u OLLAMA_URL) para usar «Hazlo con IA»", "falta_configuracion", { variable: "ANTHROPIC_API_KEY" });
      const r = await cliente.mensajes({
        modelo: deps.config.env.AI_MODEL,
        sistema:
          "Eres un diseñador web. Respondes SOLO con una página en HTML y CSS (sin JavaScript), en español, moderna, responsiva (móvil primero), con secciones claras, buenos contrastes y textos de ejemplo reales para el negocio. Usa imágenes de https://picsum.photos/seed/<palabra>/800/600 como relleno. Formato exacto: el HTML del <body> dentro de ```html ... ``` y luego el CSS dentro de ```css ... ```. Nada más.",
        mensajes: [{ role: "user", content: [{ type: "text", text: descripcion }] }],
        herramientas: [],
      });
      const texto = r.content.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("\n");
      await db.insert(aiUsage).values({
        userId: user.id,
        model: r.model,
        inputTokens: r.usage.input_tokens,
        outputTokens: r.usage.output_tokens,
        cacheReadTokens: r.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: r.usage.cache_creation_input_tokens ?? 0,
        costUsd: calcularCosto(r.model, r.usage).toFixed(6),
        createdAt: deps.now(),
      });
      const html = /```html\s*([\s\S]*?)```/i.exec(texto)?.[1]?.trim() ?? "";
      const css = /```css\s*([\s\S]*?)```/i.exec(texto)?.[1]?.trim() ?? "";
      if (!html) throw new HttpError(502, "La IA no regresó una página. Intenta describirla de otra forma.");
      // Sin scripts ni manejadores: el diseño queda solo con HTML y CSS.
      const limpio = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+="[^"]*"/gi, "");
      return { html: limpio, css };
    });

    app.get("/api/sitios/:id/vista-previa", leer, async (request, reply) => {
      // Vista previa de una página del borrador ya armada (la manda el editor).
      const s = await sitioDe(request);
      return reply.send({ url: urlPublica(s), publicado: Boolean(s.published) });
    });

    // Contador para el menú: formularios y pedidos sin leer en todos tus sitios.
    app.get("/api/sitios/pendientes", leer, async (request) => {
      const user = currentUser(request);
      const [f] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(siteEntries)
        .innerJoin(sites, eq(sites.id, siteEntries.siteId))
        .where(and(eq(sites.ownerId, user.id), eq(siteEntries.read, false)));
      return { pendientes: f?.n ?? 0 };
    });
  };
}
