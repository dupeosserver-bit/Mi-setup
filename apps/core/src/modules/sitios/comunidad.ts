/**
 * Comunidad de un sitio (la usa el sitio oficial de Mi Setup):
 * - Los visitantes suben proyectos (enlace de GitHub o un .zip) con su nombre o
 *   como «Anónimo», y dejan comentarios.
 * - El nombre oficial (p. ej. «JokeerYT») está reservado: solo lo usa el dueño
 *   cuando responde desde Mi Setup, y se muestra como oficial.
 * - Se bloquean insultos y groserías (español e inglés, aunque los escriban
 *   con números o letras repetidas).
 * - Cada archivo (y el .zip del repositorio de GitHub) se revisa con ClamAV y
 *   el proyecto no aparece hasta que el dueño lo aprueba.
 */
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, open, stat, unlink } from "node:fs/promises";
import { connect } from "node:net";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { siteCommunity, sites } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import type { ModuleDeps } from "../common.js";
import { carpetaArchivos } from "../herramientas.js";

type FilaSitio = typeof sites.$inferSelect;
type Fila = typeof siteCommunity.$inferSelect;

export interface AjustesComunidad {
  activa?: boolean;
  /** Nombre del autor oficial (reservado). */
  oficial?: string;
}

/** Siempre reservado, aunque el sitio use otro nombre oficial. */
export const NOMBRE_OFICIAL = "JokeerYT";
export const MAX_ZIP = 50 * 1024 * 1024;
/** Si hay más proyectos esperando revisión, se pide intentar más tarde (evita llenar el disco). */
const MAX_PENDIENTES = 40;

// ---------------------------------------------------------------- filtro de groserías

const LEET: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", $: "s", "!": "i", "|": "i" };

/** Minúsculas, sin acentos, sin números disfrazados ni letras alargadas («puuuuto»). */
export function normalizar(texto: string): string {
  const base = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[0-9@$!|]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]+/g, " ")
    .replace(/(.)\1{2,}/g, "$1")
    .trim();
  // "p u t o" → "puto"
  return base.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (m) => m.replace(/ /g, ""));
}

const colapsar = (t: string) => t.replace(/(.)\1+/g, "$1");
const sinDobles = (t: string) => colapsar(t) === t;
const lista = (palabras: string[]) => palabras.map(normalizar);
/** Palabras completas. */
const EXACTAS = new Set(
  lista(["puto", "puta", "putos", "putas", "joto", "jotos", "perra", "zorra", "zorras", "ptm", "alv", "mamon", "mamona", "idiota", "imbecil", "estupido", "estupida", "tarado", "tarada", "baboso", "babosa", "culo", "ojete", "puñeta", "puñetas", "bitch", "dick", "cunt", "slut", "whore", "retard", "bastard", "jerk", "wanker", "twat", "prick", "pussy", "cock"]),
);
/** Inicio de palabra (pendeja, pendejadas, chingados…). */
const PREFIJOS = lista(["pendej", "chingad", "chingar", "chingue", "chinga", "verga", "culer", "cabron", "mierd", "maric", "pinche", "idiot", "imbecil", "estupid", "puñet", "putit", "putaz", "malparid", "gilipoll", "subnormal", "fuck", "shit", "asshole", "bullshit", "motherf", "nigger", "nigga", "faggot", "retard", "dumbass", "stupid"]);
/** Dentro de cualquier palabra (hijodeputa, mamaverga…). */
const DENTRO = lista(["pendej", "chingad", "hijodeput", "hdp", "mamaverg", "fuck", "nigger", "nigga", "faggot", "maricon", "cabron"]);

function esGroseria(palabra: string, soloSinDobles: boolean): boolean {
  const vale = (x: string) => !soloSinDobles || sinDobles(x);
  if (EXACTAS.has(palabra) && vale(palabra)) return true;
  if (PREFIJOS.some((x) => vale(x) && palabra.startsWith(x))) return true;
  return DENTRO.some((x) => vale(x) && palabra.includes(x));
}

export function contieneGroseria(texto: string): boolean {
  const n = normalizar(texto);
  if (!n) return false;
  // Tal cual y con las letras dobles juntadas («puuto» → «puto»), sin confundir «Niger» con un insulto.
  return n.split(" ").some((p) => esGroseria(p, false) || esGroseria(colapsar(p), true));
}

/** ¿El nombre intenta hacerse pasar por el autor oficial? */
export function nombreReservado(nombre: string, oficial = NOMBRE_OFICIAL): boolean {
  const n = colapsar(normalizar(nombre).replace(/ /g, ""));
  if (!n) return false;
  return [oficial, NOMBRE_OFICIAL].some((o) => {
    const r = colapsar(normalizar(o).replace(/ /g, ""));
    return r.length > 0 && n.includes(r);
  });
}

// ---------------------------------------------------------------- ClamAV

export interface ResultadoEscaneo {
  estado: "limpio" | "infectado" | "error";
  detalle: string;
}

/**
 * Manda los datos a clamd con INSTREAM y lee el veredicto.
 * Nunca guarda nada: solo pasa los bytes al antivirus.
 */
export function escanearConClamav(host: string, puerto: number, datos: AsyncIterable<Uint8Array>, tiempo = 120_000): Promise<ResultadoEscaneo> {
  return new Promise((resolve) => {
    let terminado = false;
    let respuesta = "";
    const fin = (r: ResultadoEscaneo) => {
      if (terminado) return;
      terminado = true;
      socket.destroy();
      resolve(r);
    };
    const socket = connect({ host, port: puerto });
    socket.setTimeout(tiempo, () => fin({ estado: "error", detalle: "El antivirus tardó demasiado" }));
    socket.on("error", (e) => fin({ estado: "error", detalle: `No se pudo usar el antivirus: ${e.message}` }));
    socket.on("data", (d) => {
      respuesta += d.toString("utf8");
      if (respuesta.includes("\0")) socket.end();
    });
    socket.on("close", () => {
      const r = respuesta.replace(/\0/g, "").trim();
      if (/:\s*OK$/.test(r)) fin({ estado: "limpio", detalle: "Sin virus" });
      else if (/FOUND$/.test(r)) fin({ estado: "infectado", detalle: r.replace(/^stream:\s*/, "").replace(/\s*FOUND$/, "") });
      else fin({ estado: "error", detalle: r || "El antivirus no respondió" });
    });
    socket.on("connect", async () => {
      try {
        const escribir = (b: Buffer) => new Promise<void>((ok, mal) => socket.write(b, (e) => (e ? mal(e) : ok())));
        await escribir(Buffer.from("zINSTREAM\0"));
        for await (const trozo of datos) {
          for (let i = 0; i < trozo.length; i += 64 * 1024) {
            const parte = Buffer.from(trozo.subarray(i, i + 64 * 1024));
            const largo = Buffer.alloc(4);
            largo.writeUInt32BE(parte.length);
            await escribir(Buffer.concat([largo, parte]));
          }
          if (terminado) return;
        }
        await escribir(Buffer.alloc(4));
      } catch (e) {
        fin({ estado: "error", detalle: e instanceof Error ? e.message : "No se pudo enviar el archivo al antivirus" });
      }
    });
  });
}

/** Solo repositorios públicos de github.com (https://github.com/usuario/repo). */
export function enlaceGithub(url: string): { usuario: string; repo: string } | null {
  const m = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([\w.-]{1,100}?)(?:\.git)?\/?$/.exec(url.trim());
  return m ? { usuario: m[1]!, repo: m[2]! } : null;
}

/** Descarga el .zip del repositorio de GitHub (máx. 50 MB) como flujo para el antivirus. */
async function* zipDeGithub(usuario: string, repo: string): AsyncGenerator<Uint8Array> {
  const r = await fetch(`https://codeload.github.com/${usuario}/${repo}/zip/HEAD`, { signal: AbortSignal.timeout(90_000) });
  if (!r.ok || !r.body) throw new Error(r.status === 404 ? "El repositorio no existe o es privado" : `GitHub respondió ${r.status}`);
  let total = 0;
  for await (const trozo of r.body as unknown as AsyncIterable<Uint8Array>) {
    total += trozo.length;
    if (total > MAX_ZIP) throw new Error("El repositorio pesa más de 50 MB");
    yield trozo;
  }
}

// ---------------------------------------------------------------- rutas

export const ajustesComunidad = (s: Pick<FilaSitio, "settings" | "name">) => {
  const c = ((s.settings ?? {}) as { comunidad?: AjustesComunidad }).comunidad ?? {};
  return { activa: Boolean(c.activa), oficial: (c.oficial || NOMBRE_OFICIAL).slice(0, 40) };
};

// eslint-disable-next-line no-control-regex -- se quitan caracteres de control a propósito
const textoLimpio = (max: number) => z.string().trim().max(max).transform((t) => t.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ""));

function revisarTextos(oficial: string, nombre: string, ...textos: string[]): string {
  const autor = nombre.trim() || "Anónimo";
  if (nombreReservado(autor, oficial)) throw new HttpError(400, `El nombre «${oficial}» está reservado para el autor oficial.`);
  if ([autor, ...textos].some((t) => contieneGroseria(t))) throw new HttpError(400, "Tu mensaje tiene palabras ofensivas. Escríbelo sin insultos ni groserías.");
  return autor;
}

export interface OpcionesComunidad {
  deps: ModuleDeps;
  /** Escaneo (se cambia en las pruebas). */
  escanear?: (datos: AsyncIterable<Uint8Array>) => Promise<ResultadoEscaneo>;
  /** Descarga del repositorio de GitHub (se cambia en las pruebas). */
  descargarGithub?: (usuario: string, repo: string) => AsyncIterable<Uint8Array>;
}

export function servicioComunidad(o: OpcionesComunidad) {
  const { deps } = o;
  const { db } = deps;
  const dir = (siteId: string) => join(carpetaArchivos(deps), "sitios", siteId, "comunidad");
  const escanear =
    o.escanear ??
    ((datos: AsyncIterable<Uint8Array>) => {
      const host = deps.config.env.CLAMAV_HOST;
      if (!host) {
        // Igual se consume el flujo para no dejar conexiones abiertas.
        return (async () => {
          for await (const _ of datos) void _;
          return { estado: "error", detalle: "El antivirus no está configurado (falta CLAMAV_HOST)" } as ResultadoEscaneo;
        })();
      }
      return escanearConClamav(host, deps.config.env.CLAMAV_PORT, datos);
    });
  const descargarGithub = o.descargarGithub ?? zipDeGithub;

  /** Revisa el archivo o el repositorio y guarda el resultado. */
  async function revisar(fila: Fila): Promise<ResultadoEscaneo> {
    let r: ResultadoEscaneo;
    try {
      if (fila.storedName) r = await escanear(createReadStream(join(dir(fila.siteId), fila.storedName)));
      else if (fila.link) {
        const g = enlaceGithub(fila.link);
        r = g ? await escanear(descargarGithub(g.usuario, g.repo)) : { estado: "error", detalle: "Enlace inválido" };
      } else r = { estado: "limpio", detalle: "Sin archivo" };
    } catch (e) {
      r = { estado: "error", detalle: e instanceof Error ? e.message : "No se pudo revisar" };
    }
    await db.update(siteCommunity).set({ scan: r.estado, scanDetail: r.detalle.slice(0, 300) }).where(eq(siteCommunity.id, fila.id));
    // Un archivo con virus se borra en ese momento; queda el aviso para el dueño.
    if (r.estado === "infectado" && fila.storedName) await unlink(join(dir(fila.siteId), fila.storedName)).catch(() => undefined);
    return r;
  }

  const vistaPublica = (f: Fila) => ({
    id: f.id,
    autor: f.author || "Anónimo",
    oficial: f.official,
    titulo: f.title,
    texto: f.body,
    enlace: f.link,
    archivo: f.storedName && f.scan === "limpio" ? { nombre: f.fileName ?? "proyecto.zip", tamano: f.fileSize ?? 0, url: `/_ms/comunidad/archivo/${f.id}` } : null,
    fecha: f.createdAt.toISOString(),
  });

  const vistaDueno = (f: Fila) => ({ ...vistaPublica(f), tipo: f.kind, proyecto: f.parentId, estado: f.status, revision: f.scan, detalleRevision: f.scanDetail, tieneArchivo: Boolean(f.storedName), archivoNombre: f.fileName });

  async function listaPublica(s: FilaSitio) {
    const filas = await db
      .select()
      .from(siteCommunity)
      .where(and(eq(siteCommunity.siteId, s.id), eq(siteCommunity.status, "aprobado")))
      .orderBy(desc(siteCommunity.createdAt))
      .limit(600);
    const proyectos = filas.filter((f) => f.kind === "proyecto").slice(0, 100);
    const comentarios = filas.filter((f) => f.kind === "comentario").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return {
      oficial: ajustesComunidad(s).oficial,
      proyectos: proyectos.map((p) => ({ ...vistaPublica(p), comentarios: comentarios.filter((c) => c.parentId === p.id).map(vistaPublica) })),
      comentarios: comentarios.filter((c) => !c.parentId).slice(-200).map(vistaPublica),
    };
  }

  /** Rutas del sitio publicado (/_ms/comunidad…). */
  function publicas(app: FastifyInstance, sitioDe: (r: FastifyRequest) => Promise<FilaSitio>, limitar: (r: FastifyRequest, clave: string, max: number) => void, avisar: (s: FilaSitio, t: string, c: string) => Promise<void>) {
    const publico = { config: { acceso: { publico: true as const } } };
    const sitioConComunidad = async (request: FastifyRequest) => {
      const s = await sitioDe(request);
      if (!ajustesComunidad(s).activa) throw new HttpError(404, "Este sitio no tiene comunidad");
      return s;
    };

    app.get("/__sitio/_ms/comunidad", publico, async (request) => listaPublica(await sitioConComunidad(request)));

    app.post("/__sitio/_ms/comunidad/comentario", publico, async (request) => {
      const s = await sitioConComunidad(request);
      limitar(request, `comunidad-comentario:${s.id}`, 5);
      const d = z.object({ nombre: textoLimpio(40).default(""), texto: textoLimpio(1000).pipe(z.string().min(2, "Escribe tu comentario")), proyecto: z.string().uuid().nullish(), _trampa: z.string().optional() }).parse(request.body);
      if (d._trampa) return { ok: true };
      const autor = revisarTextos(ajustesComunidad(s).oficial, d.nombre, d.texto);
      if (d.proyecto) {
        const [p] = await db.select({ id: siteCommunity.id }).from(siteCommunity).where(and(eq(siteCommunity.id, d.proyecto), eq(siteCommunity.siteId, s.id), eq(siteCommunity.kind, "proyecto"), eq(siteCommunity.status, "aprobado")));
        if (!p) throw new HttpError(404, "Ese proyecto no existe");
      }
      const [c] = await db.insert(siteCommunity).values({ siteId: s.id, kind: "comentario", parentId: d.proyecto ?? null, author: autor, body: d.texto, status: "aprobado" }).returning();
      return { ok: true, comentario: vistaPublica(c!) };
    });

    app.post("/__sitio/_ms/comunidad/proyecto", { ...publico, bodyLimit: MAX_ZIP + 1024 * 1024 }, async (request) => {
      const s = await sitioConComunidad(request);
      limitar(request, `comunidad-proyecto:${s.id}`, 3);
      const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(siteCommunity).where(and(eq(siteCommunity.siteId, s.id), eq(siteCommunity.kind, "proyecto"), eq(siteCommunity.status, "pendiente")));
      if (n >= MAX_PENDIENTES) throw new HttpError(429, "Hay muchos proyectos esperando revisión. Intenta más tarde.");
      const esquema = z.object({
        nombre: textoLimpio(40).default(""),
        titulo: textoLimpio(80).pipe(z.string().min(2, "Ponle nombre a tu proyecto")),
        descripcion: textoLimpio(1500).default(""),
        enlace: z.string().trim().max(200).default(""),
        _trampa: z.string().optional(),
      });
      let d: z.infer<typeof esquema>;
      let guardado: { nombre: string; interno: string; tamano: number } | null = null;
      if (request.isMultipart()) {
        const archivo = await request.file({ limits: { fileSize: MAX_ZIP, files: 1, fields: 10 } });
        if (!archivo) throw new HttpError(400, "Falta el archivo");
        const campos = Object.fromEntries(Object.entries(archivo.fields).map(([k, v]) => [k, v && "value" in v ? String(v.value) : ""]));
        d = esquema.parse(campos);
        if (!/\.zip$/i.test(archivo.filename)) {
          archivo.file.resume();
          throw new HttpError(415, "Solo se aceptan archivos .zip");
        }
        await mkdir(dir(s.id), { recursive: true });
        const interno = crypto.randomUUID();
        const ruta = join(dir(s.id), interno);
        await pipeline(archivo.file, createWriteStream(ruta));
        const cabeza = Buffer.alloc(4);
        const fh = await open(ruta, "r");
        await fh.read(cabeza, 0, 4, 0).finally(() => fh.close());
        if (archivo.file.truncated || cabeza.toString("latin1") !== "PK\u0003\u0004") {
          await unlink(ruta).catch(() => undefined);
          throw new HttpError(archivo.file.truncated ? 413 : 415, archivo.file.truncated ? "El .zip supera 50 MB" : "Ese archivo no es un .zip válido");
        }
        guardado = { nombre: archivo.filename.replace(/[^\w. ()-]/g, "_").slice(0, 120), interno, tamano: (await stat(ruta)).size };
      } else {
        d = esquema.parse(request.body);
      }
      const borrar = () => (guardado ? unlink(join(dir(s.id), guardado.interno)).catch(() => undefined) : undefined);
      if (d._trampa) {
        await borrar();
        return { ok: true };
      }
      let autor: string;
      try {
        if (d.enlace && !enlaceGithub(d.enlace)) throw new HttpError(400, "El enlace debe ser de un repositorio público de GitHub (https://github.com/usuario/proyecto)");
        if (!d.enlace && !guardado) throw new HttpError(400, "Agrega el enlace de GitHub o sube un .zip");
        autor = revisarTextos(ajustesComunidad(s).oficial, d.nombre, d.titulo, d.descripcion);
      } catch (e) {
        await borrar();
        throw e;
      }
      const [fila] = await db
        .insert(siteCommunity)
        .values({
          siteId: s.id,
          kind: "proyecto",
          author: autor,
          title: d.titulo,
          body: d.descripcion,
          link: d.enlace || null,
          fileName: guardado?.nombre ?? null,
          storedName: guardado?.interno ?? null,
          fileSize: guardado?.tamano ?? null,
          scan: "pendiente",
          status: "pendiente",
        })
        .returning();
      void revisar(fila!).catch(() => undefined);
      await avisar(s, `Proyecto nuevo en ${s.name}`, `${autor}: ${d.titulo}`.slice(0, 200));
      return { ok: true, mensaje: "¡Gracias! Lo revisamos con antivirus y aparecerá cuando el autor lo apruebe." };
    });

    app.get("/__sitio/_ms/comunidad/archivo/:id", publico, async (request, reply) => {
      const s = await sitioConComunidad(request);
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      const [f] = await db.select().from(siteCommunity).where(and(eq(siteCommunity.id, id), eq(siteCommunity.siteId, s.id), eq(siteCommunity.status, "aprobado"), eq(siteCommunity.scan, "limpio")));
      if (!f?.storedName) throw new HttpError(404, "No encontrado");
      return enviarZip(reply, f);
    });
  }

  async function enviarZip(reply: FastifyReply, f: Fila) {
    const ruta = join(dir(f.siteId), f.storedName!);
    const st = await stat(ruta).catch(() => null);
    if (!st) throw new HttpError(404, "No encontrado");
    return reply
      .type("application/zip")
      .header("content-length", String(st.size))
      .header("content-disposition", `attachment; filename="${(f.fileName ?? "proyecto.zip").replace(/"/g, "")}"`)
      .header("x-content-type-options", "nosniff")
      .header("cache-control", "no-cache")
      .send(createReadStream(ruta));
  }

  /** Rutas del dueño del sitio dentro de Mi Setup (/api/sitios/:id/comunidad…). */
  function privadas(app: FastifyInstance, sitioDe: (r: FastifyRequest, soloDueno?: boolean) => Promise<FilaSitio>) {
    const leer = { config: { acceso: { modulo: "sitios" as const, nivel: "lectura" as const } } };
    const escribir = { config: { acceso: { modulo: "sitios" as const, nivel: "escritura" as const } } };
    const item = z.object({ id: z.string().uuid(), item: z.string().uuid() });
    const filaDe = async (s: FilaSitio, request: FastifyRequest) => {
      const { item: id } = item.parse(request.params);
      const [f] = await db.select().from(siteCommunity).where(and(eq(siteCommunity.id, id), eq(siteCommunity.siteId, s.id)));
      if (!f) throw new HttpError(404, "No encontrado");
      return f;
    };

    app.get("/api/sitios/:id/comunidad", leer, async (request) => {
      const s = await sitioDe(request);
      const filas = await db.select().from(siteCommunity).where(eq(siteCommunity.siteId, s.id)).orderBy(asc(siteCommunity.status), desc(siteCommunity.createdAt)).limit(1000);
      return { ...ajustesComunidad(s), elementos: filas.map(vistaDueno) };
    });

    app.post("/api/sitios/:id/comunidad/:item/estado", escribir, async (request) => {
      const s = await sitioDe(request);
      const f = await filaDe(s, request);
      const { estado } = z.object({ estado: z.enum(["aprobado", "rechazado", "pendiente"]) }).parse(request.body);
      if (estado === "aprobado" && f.kind === "proyecto" && f.scan !== "limpio") {
        throw new HttpError(409, f.scan === "infectado" ? "El antivirus encontró un virus: no se puede aprobar." : "Primero el antivirus tiene que revisarlo sin encontrar nada.");
      }
      await db.update(siteCommunity).set({ status: estado }).where(eq(siteCommunity.id, f.id));
      return { ok: true };
    });

    app.post("/api/sitios/:id/comunidad/:item/revisar", escribir, async (request) => {
      const s = await sitioDe(request);
      const f = await filaDe(s, request);
      if (f.kind !== "proyecto") throw new HttpError(400, "Solo los proyectos se revisan con antivirus");
      if (f.scan === "infectado") throw new HttpError(409, "Tenía virus y ya se borró el archivo");
      return revisar(f);
    });

    app.get("/api/sitios/:id/comunidad/:item/archivo", leer, async (request, reply) => {
      const s = await sitioDe(request);
      const f = await filaDe(s, request);
      if (!f.storedName || f.scan === "infectado") throw new HttpError(404, "No hay archivo");
      return enviarZip(reply, f);
    });

    app.delete("/api/sitios/:id/comunidad/:item", escribir, async (request) => {
      const s = await sitioDe(request);
      const f = await filaDe(s, request);
      const hijos = await db.delete(siteCommunity).where(and(eq(siteCommunity.siteId, s.id), inArray(siteCommunity.parentId, [f.id]))).returning();
      await db.delete(siteCommunity).where(eq(siteCommunity.id, f.id));
      for (const x of [f, ...hijos]) if (x.storedName) await unlink(join(dir(s.id), x.storedName)).catch(() => undefined);
      return { ok: true };
    });

    /** Respuesta oficial: sale con el nombre reservado y la marca de oficial. */
    app.post("/api/sitios/:id/comunidad/responder", escribir, async (request) => {
      const s = await sitioDe(request, true);
      const d = z.object({ texto: textoLimpio(2000).pipe(z.string().min(1)), proyecto: z.string().uuid().nullish() }).parse(request.body);
      if (d.proyecto) {
        const [p] = await db.select({ id: siteCommunity.id }).from(siteCommunity).where(and(eq(siteCommunity.id, d.proyecto), eq(siteCommunity.siteId, s.id), eq(siteCommunity.kind, "proyecto")));
        if (!p) throw new HttpError(404, "Ese proyecto no existe");
      }
      const [c] = await db.insert(siteCommunity).values({ siteId: s.id, kind: "comentario", parentId: d.proyecto ?? null, author: ajustesComunidad(s).oficial, official: true, body: d.texto, status: "aprobado" }).returning();
      return vistaDueno(c!);
    });
  }

  return { publicas, privadas, revisar, listaPublica };
}

export type ServicioComunidad = ReturnType<typeof servicioComunidad>;
