/**
 * Clips de tus streams (estilo NexxusClip): traes una transmisión o un clip por enlace (Twitch, Kick o YouTube,
 * con yt-dlp) o subes un video; la IA propone los mejores momentos (los picos de ruido y emoción, con título y
 * hashtags); cortas a mano o con la propuesta, en formato original, vertical 9:16 (TikTok) o cuadrado; y lo
 * publicas en TikTok. Para clips en vivo también puedes pedirle uno a Twitch.
 * Usa SOLO tus propios streams. Necesita ffmpeg y yt-dlp en el servidor (la imagen de Docker los trae).
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { can } from "@mi-setup/shared";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { aiUsage, studioProjects } from "../db/schema.js";
import { HttpError } from "../http-error.js";
import { currentUser } from "../security/rbac.js";
import { idParams, type ModuleDeps } from "./common.js";
import { carpetaArchivos, disposicion } from "./herramientas.js";
import { calcularCosto, clienteAnthropic, clienteOllama, type ClienteIa } from "./ia/servicio.js";
import { firmarEstudio } from "./estudio.js";
import { pedirJson, tokenVigente } from "./redes/oauth.js";

const HOSTS = /^(?:www\.|m\.|clips\.)?(?:twitch\.tv|kick\.com|youtube\.com|youtu\.be)$/;
const CUOTA = 2 * 1024 ** 3;
const DOS_DIAS = 2 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- funciones puras (con pruebas)

/** Solo enlaces https de Twitch, Kick y YouTube (nada de direcciones internas ni archivos). */
export function validarUrlClip(texto: string): URL {
  let u: URL;
  try {
    u = new URL(texto.trim());
  } catch {
    throw new HttpError(400, "Pega el enlace completo (https://…)");
  }
  if (u.protocol !== "https:" || u.username || u.password || texto.length > 400 || !HOSTS.test(u.hostname.toLowerCase())) {
    throw new HttpError(400, "Solo se aceptan enlaces de Twitch, Kick o YouTube (tus propios streams)");
  }
  return u;
}

export function argsYtDlp(url: string, plantillaSalida: string, rango?: { inicio: number; fin: number }): string[] {
  return [
    "--no-playlist",
    "--no-warnings",
    "--newline",
    "--max-filesize",
    "3G",
    "-f",
    "bv*[height<=1080]+ba/b[height<=1080]/b",
    "--merge-output-format",
    "mp4",
    ...(rango ? ["--download-sections", `*${rango.inicio}-${rango.fin}`, "--force-keyframes-at-cuts"] : []),
    "-o",
    plantillaSalida,
    url,
  ];
}

export type FormatoClip = "original" | "vertical" | "cuadrado";

/** Fondo desenfocado + el video completo al centro (como se ven los clips en TikTok y Reels). */
const sobreFondo = (w: number, h: number) =>
  `[0:v]split=2[a][b];[a]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},boxblur=25:5[bg];[b]scale=${w}:${h}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]`;

export function argsCorte(entrada: string, salida: string, o: { inicio: number; fin: number; formato: FormatoClip }): string[] {
  const duracion = Math.max(0.5, o.fin - o.inicio);
  const base = ["-hide_banner", "-nostats", "-loglevel", "error", "-progress", "pipe:1", "-y", "-ss", String(o.inicio), "-i", entrada, "-t", String(duracion)];
  const video =
    o.formato === "vertical"
      ? ["-filter_complex", sobreFondo(1080, 1920), "-map", "[v]", "-map", "0:a?"]
      : o.formato === "cuadrado"
        ? ["-filter_complex", sobreFondo(1080, 1080), "-map", "[v]", "-map", "0:a?"]
        : ["-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p"];
  return [...base, ...video, "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", salida];
}

export const argsMomentos = (entrada: string): string[] => [
  "-hide_banner",
  "-nostats",
  "-loglevel",
  "error",
  "-i",
  entrada,
  "-vn",
  "-af",
  "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-",
  "-f",
  "null",
  "-",
];

/** Promedio de volumen (dB) por segundo a partir de lo que imprime ffmpeg. */
export function volumenPorSegundo(salida: string): number[] {
  const suma = new Map<number, { s: number; n: number }>();
  let t = 0;
  for (const linea of salida.split("\n")) {
    const m = /pts_time:([\d.]+)/.exec(linea);
    if (m) {
      t = Number(m[1]);
      continue;
    }
    const r = /RMS_level=(-?[\d.]+|-inf|inf)/.exec(linea);
    if (!r) continue;
    const db = Number.isFinite(Number(r[1])) ? Math.max(-90, Number(r[1])) : -90;
    const seg = Math.floor(t);
    const f = suma.get(seg) ?? { s: 0, n: 0 };
    f.s += db;
    f.n += 1;
    suma.set(seg, f);
  }
  const largo = suma.size ? Math.max(...suma.keys()) + 1 : 0;
  return Array.from({ length: largo }, (_, i) => (suma.get(i) ? suma.get(i)!.s / suma.get(i)!.n : -90));
}

export interface Momento {
  inicio: number;
  fin: number;
  /** Cuántos dB por encima del volumen normal de la transmisión. */
  puntaje: number;
  titulo?: string;
  hashtags?: string[];
}

/** Los picos de volumen sostenido (risas, gritos, momentos intensos) separados al menos 45 s entre sí. */
export function elegirMomentos(porSegundo: number[], cantidad: number, duracion: number): Momento[] {
  if (porSegundo.length < 10) return [];
  const suave = porSegundo.map((_, i) => {
    const v = porSegundo.slice(Math.max(0, i - 2), i + 3);
    return v.reduce((a, b) => a + b, 0) / v.length;
  });
  const ordenado = [...porSegundo].sort((a, b) => a - b);
  const normal = ordenado[Math.floor(ordenado.length * 0.5)]!;
  const candidatos = suave.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
  const elegidos: { i: number; v: number }[] = [];
  for (const c of candidatos) {
    if (elegidos.length >= cantidad) break;
    if (elegidos.every((e) => Math.abs(e.i - c.i) >= 45)) elegidos.push(c);
  }
  return elegidos
    .map((e) => ({ inicio: Math.max(0, e.i - 12), fin: Math.min(Math.floor(duracion), e.i + 18), puntaje: Math.round((e.v - normal) * 10) / 10 }))
    .filter((m) => m.fin - m.inicio >= 8)
    .sort((a, b) => a.inicio - b.inicio);
}

// ---------------------------------------------------------------- ejecución de programas

async function correr(bin: string, args: string[], opciones: { timeoutMs?: number; alSalida?: (linea: string) => void; guardarSalida?: boolean; binario?: boolean } = {}) {
  return new Promise<{ codigo: number | null; salida: string; error: string; bytes?: Buffer }>((ok, mal) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    let error = "";
    const trozos: Buffer[] = [];
    const limite = setTimeout(() => p.kill("SIGKILL"), opciones.timeoutMs ?? 30 * 60_000);
    let resto = "";
    p.stdout.on("data", (d: Buffer) => {
      if (opciones.binario) {
        trozos.push(d);
        return;
      }
      const texto = d.toString("utf8");
      if (opciones.guardarSalida) salida += texto;
      if (opciones.alSalida) {
        resto += texto;
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";
        lineas.forEach((l) => opciones.alSalida!(l));
      }
    });
    p.stderr.on("data", (d: Buffer) => (error = (error + d.toString("utf8")).slice(-4000)));
    p.on("error", (err) => {
      clearTimeout(limite);
      mal(
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? new HttpError(501, `Falta instalar ${bin} en el servidor (se instala solo al actualizar el VPS con Docker).`)
          : new HttpError(500, `No se pudo correr ${bin}: ${err.message}`),
      );
    });
    p.on("close", (codigo) => {
      clearTimeout(limite);
      ok({ codigo, salida, error, ...(opciones.binario ? { bytes: Buffer.concat(trozos) } : {}) });
    });
  });
}

async function duracionDe(ruta: string): Promise<number> {
  const r = await correr("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", ruta], { timeoutMs: 60_000, guardarSalida: true });
  const d = Number(r.salida.trim());
  if (r.codigo !== 0 || !Number.isFinite(d) || d <= 0) throw new HttpError(400, "No pude leer ese video (¿está dañado o no es un video?)");
  return d;
}

// ---------------------------------------------------------------- trabajos en segundo plano

interface Trabajo {
  id: string;
  userId: string;
  tipo: "descarga" | "momentos" | "corte";
  estado: "esperando" | "trabajando" | "listo" | "error";
  progreso: number;
  detalle: string;
  resultado?: unknown;
  creado: number;
}

export function clipsRoutes(deps: ModuleDeps, clienteIa?: ClienteIa) {
  const { db } = deps;
  const trabajos = new Map<string, Trabajo>();
  let cola: Promise<unknown> = Promise.resolve();
  const dirFuentes = (u: string) => join(carpetaArchivos(deps), "clips", u);
  const dirEstudio = (u: string) => join(carpetaArchivos(deps), "estudio", u);
  const secreto = () => deps.config.env.JWT_SECRET ?? deps.config.env.SERVER_ENC_KEY ?? "desarrollo-sin-secreto";
  const leer = { config: { acceso: { modulo: "streams" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "streams" as const, nivel: "escritura" as const } } };

  function nuevoTrabajo(userId: string, tipo: Trabajo["tipo"], tarea: (t: Trabajo) => Promise<unknown>): Trabajo {
    // Se limpian los trabajos viejos para no crecer sin fin.
    for (const [k, v] of trabajos) if (Date.now() - v.creado > 6 * 3600_000) trabajos.delete(k);
    const t: Trabajo = { id: randomUUID(), userId, tipo, estado: "esperando", progreso: 0, detalle: "En cola…", creado: Date.now() };
    trabajos.set(t.id, t);
    cola = cola.then(async () => {
      t.estado = "trabajando";
      t.detalle = "Trabajando…";
      try {
        t.resultado = await tarea(t);
        t.estado = "listo";
        t.progreso = 100;
        t.detalle = "Listo";
      } catch (err) {
        t.estado = "error";
        t.detalle = err instanceof HttpError ? err.message : err instanceof Error ? err.message : "Error desconocido";
      }
    });
    return t;
  }

  function iaDisponible(): ClienteIa | null {
    if (clienteIa) return clienteIa;
    if (deps.config.env.ANTHROPIC_API_KEY) return clienteAnthropic(deps.config.env.ANTHROPIC_API_KEY);
    if (deps.config.env.OLLAMA_URL) return clienteOllama(deps.config.env.OLLAMA_URL, deps.config.env.OLLAMA_MODEL);
    return null;
  }

  /** Títulos y hashtags para cada momento (si no hay IA se usan títulos simples). */
  async function titularConIa(userId: string, momentos: Momento[], contexto: string): Promise<Momento[]> {
    const cliente = iaDisponible();
    const simples = momentos.map((m, i) => ({ ...m, titulo: `Momento ${i + 1}`, hashtags: ["#stream", "#clips"] }));
    if (!cliente || !momentos.length) return simples;
    try {
      const r = await cliente.mensajes({
        modelo: deps.config.env.AI_MODEL,
        sistema:
          "Eres editor de clips para TikTok de un streamer. Recibes momentos de una transmisión con su minuto y qué tan fuerte fue el audio. Para cada uno escribe un título corto, llamativo y en español (máximo 60 caracteres, sin comillas) y 3 hashtags. Responde SOLO un arreglo JSON: [{\"titulo\":\"…\",\"hashtags\":[\"#a\",\"#b\",\"#c\"]}] en el mismo orden.",
        mensajes: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Contexto: ${contexto.slice(0, 200)}\n${momentos.map((m, i) => `${i + 1}. minuto ${Math.floor(m.inicio / 60)}:${String(Math.floor(m.inicio % 60)).padStart(2, "0")}, ${Math.round(m.fin - m.inicio)} s, audio +${m.puntaje} dB`).join("\n")}`,
              },
            ],
          },
        ],
        herramientas: [],
      });
      await db.insert(aiUsage).values({
        userId,
        model: r.model,
        inputTokens: r.usage.input_tokens,
        outputTokens: r.usage.output_tokens,
        cacheReadTokens: r.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: r.usage.cache_creation_input_tokens ?? 0,
        costUsd: calcularCosto(r.model, r.usage).toFixed(6),
        createdAt: deps.now(),
      });
      const texto = r.content.map((b) => (b.type === "text" ? (b.text ?? "") : "")).join("\n");
      const arreglo = JSON.parse(/\[[\s\S]*\]/.exec(texto)?.[0] ?? "[]") as { titulo?: unknown; hashtags?: unknown }[];
      return momentos.map((m, i) => ({
        ...m,
        titulo: typeof arreglo[i]?.titulo === "string" ? (arreglo[i]!.titulo as string).slice(0, 80) : simples[i]!.titulo!,
        hashtags: Array.isArray(arreglo[i]?.hashtags) ? (arreglo[i]!.hashtags as unknown[]).filter((h): h is string => typeof h === "string").slice(0, 5) : simples[i]!.hashtags!,
      }));
    } catch {
      return simples;
    }
  }

  // ---- fuentes (videos grandes de los que se sacan clips)
  interface Fuente {
    id: string;
    nombre: string;
    origen: string;
    duracion: number;
    bytes: number;
    creada: string;
  }
  const rutaFuente = (u: string, id: string) => join(dirFuentes(u), `${id}.mp4`);
  async function leerFuentes(u: string): Promise<Fuente[]> {
    const nombres = await readdir(dirFuentes(u)).catch(() => [] as string[]);
    const salida: Fuente[] = [];
    for (const n of nombres.filter((x) => x.endsWith(".json"))) {
      try {
        salida.push(JSON.parse(await readFile(join(dirFuentes(u), n), "utf8")) as Fuente);
      } catch {
        /* ficha dañada: se ignora */
      }
    }
    return salida.sort((a, b) => b.creada.localeCompare(a.creada));
  }
  const fuenteDto = (f: Fuente) => ({ ...f, url: `/api/clips/archivo/${f.id}/${firmarEstudio(secreto(), f.id)}` });
  async function fuentePropia(u: string, id: string): Promise<Fuente> {
    const f = (await leerFuentes(u)).find((x) => x.id === id);
    if (!f || !existsSync(rutaFuente(u, id))) throw new HttpError(404, "Esa fuente ya no existe");
    return f;
  }
  async function guardarFicha(u: string, f: Fuente) {
    await writeFile(join(dirFuentes(u), `${f.id}.json`), JSON.stringify(f));
  }

  /** Sirve un archivo con soporte de Range (para poder adelantar el video en la vista previa). */
  async function enviar(request: FastifyRequest, reply: FastifyReply, ruta: string, mime: string, nombre: string) {
    const s = await stat(ruta).catch(() => null);
    if (!s?.isFile()) throw new HttpError(404, "No encontrado");
    const rango = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range ?? ""));
    reply.header("content-type", mime).header("accept-ranges", "bytes").header("content-disposition", disposicion(nombre, "inline")).header("x-content-type-options", "nosniff");
    if (rango && (rango[1] || rango[2])) {
      const inicio = rango[1] ? Number(rango[1]) : Math.max(0, s.size - Number(rango[2]));
      const fin = rango[1] && rango[2] ? Math.min(Number(rango[2]), s.size - 1) : s.size - 1;
      if (inicio > fin || inicio >= s.size) return reply.code(416).header("content-range", `bytes */${s.size}`).send();
      return reply.code(206).header("content-range", `bytes ${inicio}-${fin}/${s.size}`).header("content-length", String(fin - inicio + 1)).send(createReadStream(ruta, { start: inicio, end: fin }));
    }
    return reply.header("content-length", String(s.size)).send(createReadStream(ruta));
  }

  return async function (app: FastifyInstance): Promise<void> {
    app.get("/api/clips/herramientas", leer, async () => {
      const hay = async (bin: string) => (await correr(bin, ["-version"], { timeoutMs: 8000, guardarSalida: true }).catch(() => null))?.codigo === 0;
      return { ffmpeg: await hay("ffmpeg"), ytdlp: await correr("yt-dlp", ["--version"], { timeoutMs: 8000, guardarSalida: true }).then((r) => r.codigo === 0).catch(() => false), ia: Boolean(iaDisponible()) };
    });

    app.get("/api/clips/fuentes", leer, async (request) => (await leerFuentes(currentUser(request).id)).map(fuenteDto));

    /** Traer una transmisión o clip por enlace. Para VODs largos conviene decir desde y hasta qué segundo. */
    app.post("/api/clips/fuentes/url", escribir, async (request) => {
      const user = currentUser(request);
      const d = z
        .object({ url: z.string().min(10).max(400), inicio: z.number().int().min(0).max(86_400).optional(), fin: z.number().int().min(1).max(86_400).optional(), nombre: z.string().trim().max(80).optional() })
        .refine((x) => (x.inicio === undefined) === (x.fin === undefined), "Pon el inicio y el fin juntos")
        .refine((x) => x.inicio === undefined || x.fin! - x.inicio >= 5, "El fragmento debe durar al menos 5 segundos")
        .refine((x) => x.inicio === undefined || x.fin! - x.inicio <= 7200, "Máximo 2 horas por fragmento")
        .parse(request.body);
      const u = validarUrlClip(d.url);
      const esVod = /twitch\.tv\/videos\//.test(u.href) || /kick\.com\/.+\/videos\//.test(u.href);
      if (esVod && d.inicio === undefined) throw new HttpError(400, "Es una transmisión completa: elige desde qué segundo y hasta cuál bajar (si no, serían horas de video).");
      const t = nuevoTrabajo(user.id, "descarga", async (job) => {
        const id = randomUUID();
        await mkdir(dirFuentes(user.id), { recursive: true });
        const plantilla = join(dirFuentes(user.id), `${id}.%(ext)s`);
        const r = await correr("yt-dlp", argsYtDlp(u.href, plantilla, d.inicio !== undefined ? { inicio: d.inicio, fin: d.fin! } : undefined), {
          alSalida: (l) => {
            const m = /\[download\]\s+([\d.]+)%/.exec(l);
            if (m) {
              job.progreso = Math.min(95, Math.round(Number(m[1])));
              job.detalle = `Descargando ${job.progreso}%`;
            }
          },
        });
        if (r.codigo !== 0 || !existsSync(rutaFuente(user.id, id))) throw new HttpError(502, `No se pudo bajar el video: ${r.error.split("\n").filter(Boolean).pop() ?? "yt-dlp falló"}. Si tarda en funcionar, actualiza yt-dlp en el VPS.`);
        const duracion = await duracionDe(rutaFuente(user.id, id));
        const ficha: Fuente = { id, nombre: d.nombre || `${u.hostname.replace(/^www\./, "")}${u.pathname.slice(0, 40)}`, origen: u.href, duracion, bytes: (await stat(rutaFuente(user.id, id))).size, creada: deps.now().toISOString() };
        await guardarFicha(user.id, ficha);
        return fuenteDto(ficha);
      });
      return { trabajo: t.id };
    });

    /** Subir un video (hasta 100 MB; para más usa el enlace). */
    app.post("/api/clips/fuentes/subir", escribir, async (request) => {
      const user = currentUser(request);
      const archivo = await request.file({ limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
      if (!archivo) throw new HttpError(400, "Falta el archivo");
      const buf = await archivo.toBuffer();
      if (archivo.file.truncated) throw new HttpError(413, "Pasa de 100 MB: usa el enlace de Twitch/Kick/YouTube");
      const esMp4 = buf.subarray(4, 8).toString("ascii") === "ftyp";
      const esWebm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
      if (!esMp4 && !esWebm) throw new HttpError(415, "Sube un video MP4, MOV o WebM");
      const id = randomUUID();
      await mkdir(dirFuentes(user.id), { recursive: true });
      await writeFile(rutaFuente(user.id, id), buf);
      try {
        const duracion = await duracionDe(rutaFuente(user.id, id));
        const ficha: Fuente = { id, nombre: basename(archivo.filename || "video").replace(/\.[^.]+$/, "").slice(0, 80), origen: "subido", duracion, bytes: buf.length, creada: deps.now().toISOString() };
        await guardarFicha(user.id, ficha);
        return fuenteDto(ficha);
      } catch (err) {
        await rm(rutaFuente(user.id, id), { force: true });
        throw err;
      }
    });

    app.delete("/api/clips/fuentes/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await rm(rutaFuente(user.id, id), { force: true });
      await rm(join(dirFuentes(user.id), `${id}.json`), { force: true });
      return { ok: true };
    });

    app.get("/api/clips/archivo/:id/:firma", { config: { acceso: { publico: true } } }, async (request, reply) => {
      const { id, firma } = z.object({ id: z.string().uuid(), firma: z.string().max(40) }).parse(request.params);
      if (firmarEstudio(secreto(), id) !== firma) throw new HttpError(404, "No encontrado");
      // La fuente puede ser de cualquier cuenta: se busca por id dentro de la carpeta de clips.
      const cuentas = await readdir(join(carpetaArchivos(deps), "clips")).catch(() => [] as string[]);
      for (const c of cuentas) {
        const ruta = join(carpetaArchivos(deps), "clips", c, `${id}.mp4`);
        if (existsSync(ruta)) return enviar(request, reply, ruta, "video/mp4", `${id}.mp4`);
      }
      throw new HttpError(404, "No encontrado");
    });

    /** La IA propone los mejores momentos (picos de audio) con título y hashtags. */
    app.post("/api/clips/fuentes/:id/momentos", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const { cantidad } = z.object({ cantidad: z.number().int().min(1).max(10).default(5) }).parse(request.body ?? {});
      const f = await fuentePropia(user.id, id);
      const t = nuevoTrabajo(user.id, "momentos", async (job) => {
        job.detalle = "Escuchando la transmisión…";
        const r = await correr("ffmpeg", argsMomentos(rutaFuente(user.id, id)), { guardarSalida: true, timeoutMs: 20 * 60_000 });
        if (r.codigo !== 0) throw new HttpError(502, `No pude analizar el audio: ${r.error.slice(-200)}`);
        const momentos = elegirMomentos(volumenPorSegundo(r.salida), cantidad, f.duracion);
        if (!momentos.length) throw new HttpError(400, "No encontré momentos destacados (¿el video no tiene audio o es muy corto?)");
        job.detalle = "Escribiendo títulos…";
        return titularConIa(user.id, momentos, f.nombre);
      });
      return { trabajo: t.id };
    });

    /** Cortar un clip (a mano o con un momento propuesto). Queda en tu estudio. */
    app.post("/api/clips/cortar", escribir, async (request) => {
      const user = currentUser(request);
      const d = z
        .object({ fuenteId: z.string().uuid(), inicio: z.number().min(0), fin: z.number().min(1), formato: z.enum(["original", "vertical", "cuadrado"]).default("vertical"), nombre: z.string().trim().min(1).max(80) })
        .refine((x) => x.fin - x.inicio >= 1, "El clip debe durar al menos 1 segundo")
        .refine((x) => x.fin - x.inicio <= 600, "Máximo 10 minutos por clip")
        .parse(request.body);
      const f = await fuentePropia(user.id, d.fuenteId);
      if (d.inicio >= f.duracion) throw new HttpError(400, "El inicio está después del final del video");
      const fin = Math.min(d.fin, f.duracion);
      const [{ usado } = { usado: 0 }] = await db.select({ usado: sql<number>`coalesce(sum(${studioProjects.size}), 0)::float8` }).from(studioProjects).where(eq(studioProjects.userId, user.id));
      if (usado > CUOTA) throw new HttpError(413, "Llegaste al límite de 2 GB del estudio: borra clips viejos.");
      const t = nuevoTrabajo(user.id, "corte", async (job) => {
        await mkdir(dirEstudio(user.id), { recursive: true });
        const guardado = `${randomUUID()}.mp4`;
        const salida = join(dirEstudio(user.id), guardado);
        const total = fin - d.inicio;
        const r = await correr("ffmpeg", argsCorte(rutaFuente(user.id, d.fuenteId), salida, { inicio: d.inicio, fin, formato: d.formato }), {
          alSalida: (l) => {
            const m = /^out_time_ms=(\d+)/.exec(l);
            if (m) {
              job.progreso = Math.min(98, Math.round((Number(m[1]) / 1_000_000 / total) * 100));
              job.detalle = `Cortando ${job.progreso}%`;
            }
          },
        });
        if (r.codigo !== 0) {
          await rm(salida, { force: true });
          throw new HttpError(502, `ffmpeg no pudo cortar: ${r.error.slice(-200)}`);
        }
        const foto = await correr("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", salida, "-frames:v", "1", "-vf", "scale=180:-2", "-f", "image2pipe", "-vcodec", "mjpeg", "-"], { binario: true, timeoutMs: 60_000 }).catch(() => null);
        const miniatura = foto?.bytes?.length && foto.bytes.length < 60_000 ? `data:image/jpeg;base64,${foto.bytes.toString("base64")}` : "";
        const tam = (await stat(salida)).size;
        const [p] = await db.insert(studioProjects).values({ userId: user.id, kind: "video", name: d.nombre, storedName: guardado, mime: "video/mp4", size: tam, thumb: miniatura }).returning();
        return { id: p!.id, nombre: p!.name, tamano: tam, url: `/api/estudio/archivo/${p!.id}/${firmarEstudio(secreto(), p!.id)}`, miniatura };
      });
      return { trabajo: t.id };
    });

    app.get("/api/clips/trabajos/:id", leer, async (request) => {
      const { id } = idParams.parse(request.params);
      const t = trabajos.get(id);
      if (!t || t.userId !== currentUser(request).id) throw new HttpError(404, "Ese trabajo ya no existe");
      return { id: t.id, tipo: t.tipo, estado: t.estado, progreso: t.progreso, detalle: t.detalle, resultado: t.resultado ?? null };
    });

    // ---------------------------------------------------------------- Twitch
    /** Pide un clip del directo ahora mismo (necesita el permiso clips:edit: reconecta Twitch una vez). */
    app.post("/api/clips/twitch/crear", escribir, async () => {
      const { token, externalId, clientId } = await tokenVigente(deps, "twitch");
      const r = await pedirJson<{ data?: { id: string; edit_url: string }[] }>("Twitch", `https://api.twitch.tv/helix/clips?broadcaster_id=${externalId}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "client-id": clientId },
      }).catch((err: unknown) => {
        if (err instanceof HttpError && /401|403|scope|permission|offline/i.test(err.message)) throw new HttpError(409, "Twitch no dejó crear el clip: reconecta tu cuenta de Twitch (ahora pide el permiso de clips) y asegúrate de estar en directo.");
        throw err;
      });
      const c = r.data?.[0];
      if (!c) throw new HttpError(502, "Twitch no devolvió el clip");
      return { id: c.id, url: `https://clips.twitch.tv/${c.id}`, editar: c.edit_url };
    });

    /** Tus clips recientes de Twitch ordenados por vistas (los más vistos suelen ser los mejores momentos). */
    app.get("/api/clips/twitch/recientes", leer, async () => {
      const { token, externalId, clientId } = await tokenVigente(deps, "twitch");
      const desde = new Date(deps.now().getTime() - 14 * 86_400_000).toISOString();
      const r = await pedirJson<{ data: { id: string; url: string; title: string; view_count: number; created_at: string; duration: number; thumbnail_url: string }[] }>(
        "Twitch",
        `https://api.twitch.tv/helix/clips?broadcaster_id=${externalId}&first=30&started_at=${encodeURIComponent(desde)}`,
        { headers: { authorization: `Bearer ${token}`, "client-id": clientId } },
      );
      return r.data
        .map((c) => ({ id: c.id, url: c.url, titulo: c.title, vistas: c.view_count, creado: c.created_at, duracion: c.duration, miniatura: c.thumbnail_url }))
        .sort((a, b) => b.vistas - a.vistas);
    });

    // ---------------------------------------------------------------- TikTok
    async function tiktok<T>(ruta: string, cuerpo: unknown): Promise<T> {
      const { token } = await tokenVigente(deps, "tiktok");
      const r = await pedirJson<{ data?: T; error?: { code: string; message: string } }>("TikTok", `https://open.tiktokapis.com${ruta}`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
        body: JSON.stringify(cuerpo),
      });
      if (r.error && r.error.code !== "ok") throw new HttpError(502, `TikTok: ${r.error.message || r.error.code}`);
      return (r.data ?? {}) as T;
    }

    app.get("/api/clips/tiktok/info", leer, async () => {
      const info = await tiktok<{ creator_username?: string; creator_nickname?: string; privacy_level_options?: string[]; max_video_post_duration_sec?: number }>("/v2/post/publish/creator_info/query/", {});
      return { usuario: info.creator_username ?? info.creator_nickname ?? "", privacidad: info.privacy_level_options ?? ["SELF_ONLY"], maxSegundos: info.max_video_post_duration_sec ?? 600 };
    });

    app.post("/api/clips/tiktok/publicar", escribir, async (request) => {
      const user = currentUser(request);
      const d = z
        .object({
          proyectoId: z.string().uuid(),
          titulo: z.string().trim().min(1, "Escribe el texto del video").max(2200),
          privacidad: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]).default("SELF_ONLY"),
        })
        .parse(request.body);
      const [p] = await db.select().from(studioProjects).where(and(eq(studioProjects.id, d.proyectoId), eq(studioProjects.userId, user.id), eq(studioProjects.kind, "video")));
      if (!p) throw new HttpError(404, "Ese clip no existe");
      if (!can(user, "streams", "escritura")) throw new HttpError(403, "Sin permiso", "sin_permiso");
      const ruta = join(dirEstudio(user.id), basename(p.storedName));
      const tam = (await stat(ruta).catch(() => null))?.size;
      if (!tam) throw new HttpError(404, "El archivo del clip ya no está");
      const MB = 1024 * 1024;
      const trozo = tam <= 64 * MB ? tam : 32 * MB;
      const cuantos = Math.max(1, Math.floor(tam / trozo));
      const iniciar = await tiktok<{ publish_id: string; upload_url: string }>("/v2/post/publish/video/init/", {
        post_info: { title: d.titulo, privacy_level: d.privacidad, disable_duet: false, disable_comment: false, disable_stitch: false },
        source_info: { source: "FILE_UPLOAD", video_size: tam, chunk_size: trozo, total_chunk_count: cuantos },
      });
      if (!iniciar.upload_url) throw new HttpError(502, "TikTok no dio dónde subir el video");
      const tipo = p.mime.includes("webm") ? "video/webm" : "video/mp4";
      for (let i = 0; i < cuantos; i++) {
        const inicio = i * trozo;
        const fin = i === cuantos - 1 ? tam - 1 : inicio + trozo - 1;
        const r = await fetch(iniciar.upload_url, {
          method: "PUT",
          headers: { "content-type": tipo, "content-length": String(fin - inicio + 1), "content-range": `bytes ${inicio}-${fin}/${tam}` },
          body: Readable.toWeb(createReadStream(ruta, { start: inicio, end: fin })) as never,
          duplex: "half",
        } as RequestInit).catch(() => null);
        if (!r || !(r.status === 201 || r.status === 206 || r.status === 200)) throw new HttpError(502, `TikTok rechazó la subida (${r?.status ?? "sin respuesta"})`);
      }
      await deps.audit.record({ actorType: "usuario", actorUserId: user.id, action: "tiktok_publicado", module: "streams", target: p.name, outcome: "ok", details: { privacidad: d.privacidad } });
      return { publishId: iniciar.publish_id };
    });

    app.get("/api/clips/tiktok/estado/:publishId", leer, async (request) => {
      const { publishId } = z.object({ publishId: z.string().regex(/^[\w.:-]{6,120}$/) }).parse(request.params);
      const r = await tiktok<{ status?: string; fail_reason?: string }>("/v2/post/publish/status/fetch/", { publish_id: publishId });
      return { estado: r.status ?? "PROCESSING_UPLOAD", motivo: r.fail_reason ?? null };
    });

    /** Los clips que ya cortaste (se pueden ver, bajar, subir a TikTok o abrir en el editor de video). */
    app.get("/api/clips/mis-clips", leer, async (request) => {
      const user = currentUser(request);
      const filas = await db.select().from(studioProjects).where(and(eq(studioProjects.userId, user.id), eq(studioProjects.kind, "video"))).orderBy(desc(studioProjects.createdAt)).limit(100);
      return filas.map((p) => ({ id: p.id, nombre: p.name, tamano: p.size, miniatura: p.thumb, creado: p.createdAt.toISOString(), url: `/api/estudio/archivo/${p.id}/${firmarEstudio(secreto(), p.id)}` }));
    });
  };
}

/** Las fuentes (videos grandes) se borran a los 2 días: lo bueno ya quedó en los clips. */
export async function limpiarFuentes(deps: ModuleDeps): Promise<void> {
  const raiz = join(carpetaArchivos(deps), "clips");
  const cuentas = await readdir(raiz).catch(() => [] as string[]);
  for (const c of cuentas) {
    const dir = join(raiz, c);
    for (const n of await readdir(dir).catch(() => [] as string[])) {
      const s = await stat(join(dir, n)).catch(() => null);
      if (s && Date.now() - s.mtimeMs > DOS_DIAS) await rm(join(dir, n), { force: true });
    }
  }
}
