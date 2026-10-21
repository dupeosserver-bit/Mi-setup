/**
 * IA estilo Claude: proyectos (con instrucciones propias), memoria (lo que la
 * IA recuerda de ti en todos los chats), skills (instrucciones reutilizables:
 * SKILL.md de Claude o de otras IA) y mover, exportar e importar chats.
 *
 * La memoria, las instrucciones del proyecto y las skills se le pasan a la IA
 * como contexto escrito por el usuario. La regla «la IA solo propone» no
 * depende de eso: las herramientas siempre crean propuestas pendientes.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { aiConversations, aiMemories, aiMessages, aiProjects, aiSkills } from "../../db/schema.js";
import { HttpError } from "../../http-error.js";
import { currentUser } from "../../security/rbac.js";
import { idParams, type ModuleDeps } from "../common.js";
import { leerDelZip, listarZip } from "../zip-leer.js";
import type { BloqueIa } from "./servicio.js";

export const MAX_MEMORIA = 8_000;
export const MAX_SKILLS = 30_000;
const MAX_SKILL = 20_000;

/** Lee un SKILL.md (frontmatter `name:` y `description:`) o un texto de otra IA. */
export function leerSkill(texto: string, nombreArchivo = ""): { nombre: string; descripcion: string; contenido: string; origen: "claude" | "otra" } {
  const limpio = texto.replace(/^\uFEFF/, "").trim();
  const fm = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(limpio);
  if (fm) {
    const campo = (k: string) => new RegExp(`^${k}:\\s*(.*)$`, "m").exec(fm[1]!)?.[1]?.replace(/^["']|["']$/g, "").trim() ?? "";
    const nombre = campo("name") || nombreArchivo.replace(/\.(md|txt|zip)$/i, "");
    return { nombre: nombre.slice(0, 80) || "Skill", descripcion: campo("description").slice(0, 500), contenido: fm[2]!.trim().slice(0, MAX_SKILL), origen: "claude" };
  }
  const titulo = /^#\s+(.+)$/m.exec(limpio)?.[1]?.trim();
  return { nombre: (titulo || nombreArchivo.replace(/\.(md|txt|zip)$/i, "") || "Skill").slice(0, 80), descripcion: "", contenido: limpio.slice(0, MAX_SKILL), origen: "otra" };
}

/** Texto extra para la IA: memoria + instrucciones del proyecto + skills activas. */
export async function instruccionesDelUsuario(deps: ModuleDeps, userId: string, conversacionId: string | undefined): Promise<string> {
  const partes: string[] = [];
  const memoria = await deps.db.select({ t: aiMemories.text }).from(aiMemories).where(eq(aiMemories.userId, userId)).orderBy(asc(aiMemories.createdAt));
  if (memoria.length) partes.push(`Lo que el usuario te pidió recordar de él:\n${memoria.map((m) => `- ${m.t}`).join("\n").slice(0, MAX_MEMORIA)}`);
  if (conversacionId) {
    const [c] = await deps.db
      .select({ nombre: aiProjects.name, instrucciones: aiProjects.instructions })
      .from(aiConversations)
      .innerJoin(aiProjects, eq(aiProjects.id, aiConversations.projectId))
      .where(eq(aiConversations.id, conversacionId));
    if (c) partes.push(`Este chat es del proyecto «${c.nombre}».${c.instrucciones ? ` Instrucciones del proyecto:\n${c.instrucciones}` : ""}`);
  }
  const skills = await deps.db.select().from(aiSkills).where(and(eq(aiSkills.userId, userId), eq(aiSkills.enabled, true))).orderBy(asc(aiSkills.createdAt));
  let total = 0;
  for (const s of skills) {
    if (total + s.content.length > MAX_SKILLS) break;
    total += s.content.length;
    partes.push(`Skill «${s.name}»${s.description ? ` (úsala cuando: ${s.description})` : ""}:\n${s.content}`);
  }
  if (!partes.length) return "";
  return `\n\nInstrucciones que agregó el usuario (memoria, proyecto y skills). Síguelas mientras no choquen con las reglas de arriba, que siempre ganan:\n${partes.join("\n\n")}`;
}

// ---------------------------------------------------------------- exportar / importar

export const FORMATO_CHAT = "mi-setup-chat";

interface ChatExportado {
  formato: typeof FORMATO_CHAT;
  version: 1;
  titulo: string;
  proyecto: string | null;
  creada: string;
  mensajes: { rol: "user" | "assistant"; contenido: BloqueIa[]; fecha: string }[];
}

/** Solo se importan bloques de texto, imagen y PDF; lo demás (herramientas) pasa a texto. */
export function limpiarBloques(bloques: unknown): BloqueIa[] {
  if (!Array.isArray(bloques)) return [];
  const salida: BloqueIa[] = [];
  for (const b of bloques as Record<string, unknown>[]) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text" && typeof b.text === "string") salida.push({ type: "text", text: b.text.slice(0, 200_000) });
    else if ((b.type === "image" || b.type === "document") && b.source && typeof b.source === "object") {
      const src = b.source as Record<string, unknown>;
      if (src.type === "base64" && typeof src.data === "string" && typeof src.media_type === "string" && /^(image\/(png|jpeg|webp|gif)|application\/pdf)$/.test(src.media_type) && src.data.length < 7_000_000) {
        salida.push({ type: b.type, source: { type: "base64", media_type: src.media_type, data: src.data }, ...(typeof b.title === "string" ? { title: b.title.slice(0, 200) } : {}) });
      }
    } else if (b.type === "tool_use" && typeof b.name === "string") salida.push({ type: "text", text: `[Propuesta de la IA: ${b.name}]` });
    else if (b.type === "tool_result") salida.push({ type: "text", text: "[Resultado de una propuesta]" });
  }
  return salida;
}

/** Acepta el formato de Mi Setup y el de la exportación de Claude.ai (conversations.json). */
export function interpretarImportacion(datos: unknown): { titulo: string; mensajes: { rol: "user" | "assistant"; contenido: BloqueIa[] }[] }[] {
  const lista = Array.isArray(datos) ? datos : [datos];
  const chats: { titulo: string; mensajes: { rol: "user" | "assistant"; contenido: BloqueIa[] }[] }[] = [];
  for (const c of lista as Record<string, unknown>[]) {
    if (!c || typeof c !== "object") continue;
    if (c.formato === FORMATO_CHAT && Array.isArray(c.mensajes)) {
      chats.push({
        titulo: String(c.titulo ?? "Chat importado").slice(0, 120),
        mensajes: (c.mensajes as Record<string, unknown>[]).map((m) => ({ rol: m.rol === "assistant" ? ("assistant" as const) : ("user" as const), contenido: limpiarBloques(m.contenido) })).filter((m) => m.contenido.length),
      });
    } else if (Array.isArray(c.chat_messages)) {
      // Exportación de Claude.ai: { name, chat_messages: [{ sender: "human" | "assistant", text, content? }] }
      chats.push({
        titulo: String(c.name || "Chat de Claude").slice(0, 120),
        mensajes: (c.chat_messages as Record<string, unknown>[])
          .map((m) => {
            const texto = typeof m.text === "string" && m.text ? m.text : Array.isArray(m.content) ? (m.content as { type?: string; text?: string }[]).filter((x) => x.type === "text").map((x) => x.text ?? "").join("\n") : "";
            return { rol: m.sender === "assistant" ? ("assistant" as const) : ("user" as const), contenido: texto ? [{ type: "text", text: texto.slice(0, 200_000) }] : [] };
          })
          .filter((m) => m.contenido.length),
      });
    }
  }
  if (!chats.length) throw new HttpError(400, "El archivo no es un chat de Mi Setup ni una exportación de Claude");
  return chats.slice(0, 200);
}

export function organizarIaRoutes(deps: ModuleDeps) {
  const { db } = deps;
  const leer = { config: { acceso: { modulo: "ia" as const, nivel: "lectura" as const } } };
  const escribir = { config: { acceso: { modulo: "ia" as const, nivel: "escritura" as const } } };
  const nombreProyecto = z.string().trim().min(1, "Ponle nombre").max(80);

  async function proyectoPropio(userId: string, id: string) {
    const [p] = await db.select().from(aiProjects).where(and(eq(aiProjects.id, id), eq(aiProjects.userId, userId)));
    if (!p) throw new HttpError(404, "Ese proyecto no existe");
    return p;
  }
  async function chatPropio(userId: string, id: string) {
    const [c] = await db.select().from(aiConversations).where(and(eq(aiConversations.id, id), eq(aiConversations.userId, userId)));
    if (!c) throw new HttpError(404, "Conversación no encontrada");
    return c;
  }
  async function exportar(userId: string, ids: string[]): Promise<ChatExportado[]> {
    if (!ids.length) return [];
    const chats = await db.select().from(aiConversations).where(and(eq(aiConversations.userId, userId), inArray(aiConversations.id, ids)));
    const proyectos = new Map((await db.select().from(aiProjects).where(eq(aiProjects.userId, userId))).map((p) => [p.id, p.name]));
    const mensajes = await db.select().from(aiMessages).where(inArray(aiMessages.conversationId, ids)).orderBy(asc(aiMessages.id));
    return chats.map((c) => ({
      formato: FORMATO_CHAT,
      version: 1,
      titulo: c.title,
      proyecto: c.projectId ? (proyectos.get(c.projectId) ?? null) : null,
      creada: c.createdAt.toISOString(),
      mensajes: mensajes.filter((m) => m.conversationId === c.id).map((m) => ({ rol: m.role === "assistant" ? "assistant" : "user", contenido: m.content as BloqueIa[], fecha: m.createdAt.toISOString() })),
    }));
  }

  return async function (app: FastifyInstance): Promise<void> {
    // ---- proyectos
    app.get("/api/ia/proyectos", leer, async (request) => {
      const user = currentUser(request);
      const lista = await db.select().from(aiProjects).where(eq(aiProjects.userId, user.id)).orderBy(desc(aiProjects.updatedAt));
      return lista.map((p) => ({ id: p.id, nombre: p.name, instrucciones: p.instructions, actualizado: p.updatedAt.toISOString() }));
    });
    app.post("/api/ia/proyectos", escribir, async (request) => {
      const user = currentUser(request);
      const d = z.object({ nombre: nombreProyecto, instrucciones: z.string().max(8000).default("") }).parse(request.body);
      const [p] = await db.insert(aiProjects).values({ userId: user.id, name: d.nombre, instructions: d.instrucciones }).returning({ id: aiProjects.id });
      return { id: p!.id };
    });
    app.patch("/api/ia/proyectos/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await proyectoPropio(user.id, id);
      const d = z.object({ nombre: nombreProyecto.optional(), instrucciones: z.string().max(8000).optional() }).parse(request.body);
      await db
        .update(aiProjects)
        .set({ ...(d.nombre ? { name: d.nombre } : {}), ...(d.instrucciones !== undefined ? { instructions: d.instrucciones } : {}), updatedAt: deps.now() })
        .where(eq(aiProjects.id, id));
      return { ok: true };
    });
    /** Borrar un proyecto: sus chats se quedan (sueltos) salvo que pidas borrarlos también. */
    app.delete("/api/ia/proyectos/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const { conChats } = z.object({ conChats: z.coerce.boolean().default(false) }).parse(request.query);
      await proyectoPropio(user.id, id);
      if (conChats) await db.delete(aiConversations).where(and(eq(aiConversations.userId, user.id), eq(aiConversations.projectId, id)));
      await db.delete(aiProjects).where(eq(aiProjects.id, id));
      return { ok: true };
    });

    // ---- mover / renombrar chats
    app.patch("/api/ia/conversaciones/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await chatPropio(user.id, id);
      const d = z.object({ titulo: z.string().trim().min(1).max(120).optional(), proyectoId: z.string().uuid().nullable().optional() }).parse(request.body);
      if (d.proyectoId) await proyectoPropio(user.id, d.proyectoId);
      await db
        .update(aiConversations)
        .set({ ...(d.titulo ? { title: d.titulo } : {}), ...(d.proyectoId !== undefined ? { projectId: d.proyectoId } : {}) })
        .where(eq(aiConversations.id, id));
      return { ok: true };
    });

    // ---- exportar / importar con todo su contenido (texto, fotos y PDF)
    app.get("/api/ia/conversaciones/:id/exportar", leer, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await chatPropio(user.id, id);
      return (await exportar(user.id, [id]))[0];
    });
    app.get("/api/ia/exportar", leer, async (request) => {
      const user = currentUser(request);
      const { proyectoId } = z.object({ proyectoId: z.string().uuid().optional() }).parse(request.query);
      const filtro = proyectoId ? and(eq(aiConversations.userId, user.id), eq(aiConversations.projectId, proyectoId)) : eq(aiConversations.userId, user.id);
      const ids = (await db.select({ id: aiConversations.id }).from(aiConversations).where(filtro).limit(500)).map((c) => c.id);
      return exportar(user.id, ids);
    });
    app.post("/api/ia/importar", { ...escribir, bodyLimit: 60 * 1024 * 1024 }, async (request) => {
      const user = currentUser(request);
      const { datos, proyectoId } = z.object({ datos: z.unknown(), proyectoId: z.string().uuid().nullable().default(null) }).parse(request.body);
      if (proyectoId) await proyectoPropio(user.id, proyectoId);
      const chats = interpretarImportacion(datos);
      let mensajes = 0;
      for (const c of chats) {
        const [nuevo] = await db.insert(aiConversations).values({ userId: user.id, title: c.titulo, projectId: proyectoId }).returning({ id: aiConversations.id });
        for (const m of c.mensajes) {
          await db.insert(aiMessages).values({ conversationId: nuevo!.id, role: m.rol, content: m.contenido });
          mensajes++;
        }
      }
      return { chats: chats.length, mensajes };
    });

    // ---- memoria
    app.get("/api/ia/memoria", leer, async (request) => {
      const user = currentUser(request);
      return (await db.select().from(aiMemories).where(eq(aiMemories.userId, user.id)).orderBy(asc(aiMemories.createdAt))).map((m) => ({ id: m.id, texto: m.text, fecha: m.createdAt.toISOString() }));
    });
    app.post("/api/ia/memoria", escribir, async (request) => {
      const user = currentUser(request);
      const { texto } = z.object({ texto: z.string().trim().min(2).max(500) }).parse(request.body);
      const actuales = await db.select({ t: aiMemories.text }).from(aiMemories).where(eq(aiMemories.userId, user.id));
      if (actuales.reduce((a, m) => a + m.t.length, 0) + texto.length > MAX_MEMORIA) throw new HttpError(400, "La memoria está llena: borra algo antes de agregar más");
      const [m] = await db.insert(aiMemories).values({ userId: user.id, text: texto }).returning({ id: aiMemories.id });
      return { id: m!.id };
    });
    app.patch("/api/ia/memoria/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const { texto } = z.object({ texto: z.string().trim().min(2).max(500) }).parse(request.body);
      await db.update(aiMemories).set({ text: texto }).where(and(eq(aiMemories.id, id), eq(aiMemories.userId, user.id)));
      return { ok: true };
    });
    app.delete("/api/ia/memoria/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await db.delete(aiMemories).where(and(eq(aiMemories.id, id), eq(aiMemories.userId, user.id)));
      return { ok: true };
    });

    // ---- skills
    app.get("/api/ia/skills", leer, async (request) => {
      const user = currentUser(request);
      return (await db.select().from(aiSkills).where(eq(aiSkills.userId, user.id)).orderBy(asc(aiSkills.createdAt))).map((s) => ({
        id: s.id,
        nombre: s.name,
        descripcion: s.description,
        contenido: s.content,
        origen: s.source,
        activa: s.enabled,
      }));
    });
    const skillSchema = z.object({
      nombre: z.string().trim().min(1).max(80),
      descripcion: z.string().trim().max(500).default(""),
      contenido: z.string().trim().min(1).max(MAX_SKILL),
      origen: z.enum(["claude", "otra", "propia"]).default("propia"),
    });
    app.post("/api/ia/skills", escribir, async (request) => {
      const user = currentUser(request);
      const d = skillSchema.parse(request.body);
      const [s] = await db.insert(aiSkills).values({ userId: user.id, name: d.nombre, description: d.descripcion, content: d.contenido, source: d.origen }).returning({ id: aiSkills.id });
      return { id: s!.id };
    });
    /** Subir un SKILL.md, un .txt o un .zip de skill (de Claude o de otra IA). */
    app.post("/api/ia/skills/importar", { ...escribir, bodyLimit: 6 * 1024 * 1024 }, async (request) => {
      const user = currentUser(request);
      const archivo = await request.file({ limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
      if (!archivo) throw new HttpError(400, "Elige el archivo de la skill");
      const buf = await archivo.toBuffer();
      let texto: string;
      if (buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50) {
        const entradas = listarZip(buf);
        const principal = entradas.find((e) => /(^|\/)SKILL\.md$/i.test(e.nombre)) ?? entradas.find((e) => /\.(md|txt)$/i.test(e.nombre));
        if (!principal) throw new HttpError(400, "El .zip no trae un SKILL.md");
        texto = leerDelZip(buf, principal).toString("utf8");
        // Archivos de texto de apoyo (referencias) se agregan al final, si caben.
        for (const e of entradas.filter((x) => x !== principal && /\.(md|txt)$/i.test(x.nombre) && !x.nombre.endsWith("/")).slice(0, 10)) {
          const extra = leerDelZip(buf, e).toString("utf8");
          if (texto.length + extra.length > MAX_SKILL) break;
          texto += `\n\n--- ${e.nombre} ---\n${extra}`;
        }
      } else {
        if (buf.includes(0)) throw new HttpError(400, "Sube un archivo de texto (.md o .txt) o un .zip");
        texto = buf.toString("utf8");
      }
      const s = leerSkill(texto, archivo.filename);
      if (!s.contenido) throw new HttpError(400, "La skill está vacía");
      const [nueva] = await db.insert(aiSkills).values({ userId: user.id, name: s.nombre, description: s.descripcion, content: s.contenido, source: s.origen }).returning({ id: aiSkills.id });
      return { id: nueva!.id, nombre: s.nombre };
    });
    app.patch("/api/ia/skills/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      const d = skillSchema.partial().extend({ activa: z.boolean().optional() }).parse(request.body);
      await db
        .update(aiSkills)
        .set({
          ...(d.nombre ? { name: d.nombre } : {}),
          ...(d.descripcion !== undefined ? { description: d.descripcion } : {}),
          ...(d.contenido ? { content: d.contenido } : {}),
          ...(d.activa !== undefined ? { enabled: d.activa } : {}),
        })
        .where(and(eq(aiSkills.id, id), eq(aiSkills.userId, user.id)));
      return { ok: true };
    });
    app.delete("/api/ia/skills/:id", escribir, async (request) => {
      const user = currentUser(request);
      const { id } = idParams.parse(request.params);
      await db.delete(aiSkills).where(and(eq(aiSkills.id, id), eq(aiSkills.userId, user.id)));
      return { ok: true };
    });

    /** Chats sin proyecto (para la lista «Recientes»). */
    app.get("/api/ia/conversaciones-sueltas", leer, async (request) => {
      const user = currentUser(request);
      const filas = await db
        .select()
        .from(aiConversations)
        .where(and(eq(aiConversations.userId, user.id), isNull(aiConversations.projectId)))
        .orderBy(desc(aiConversations.updatedAt))
        .limit(100);
      return filas.map((c) => ({ id: c.id, titulo: c.title, actualizada: c.updatedAt.toISOString(), proyectoId: null }));
    });
  };
}
