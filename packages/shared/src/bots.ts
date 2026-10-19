/**
 * Configuración y lógica de los bots de Discord que Mi Setup mantiene encendidos (creador estilo BotGhost):
 * bienvenida, moderación y filtros (Sapphire), niveles (MEE6), economía (UnbelievaBoat), tickets (Ticket Tool),
 * roles con botones, comandos propios, registros, mensajes programados y respaldo del servidor (Xenon).
 * El esquema se comparte entre el servidor (valida y guarda) y la app (formularios); las funciones puras
 * (plantillas, XP, filtros) tienen pruebas.
 */
import { z } from "zod";

const idDiscord = z.string().regex(/^\d{15,22}$/, "ID de Discord inválido");
const idOVacio = idDiscord.or(z.literal("")).default("");
const ids = (max = 25) => z.array(idDiscord).max(max).default([]);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const urlHttps = z.string().max(500).regex(/^(https:\/\/[^\s]+)?$/, "Debe empezar con https://").default("");
const accion = z.enum(["borrar", "advertir", "timeout"]);
const slug = z.string().regex(/^[a-z0-9_-]{1,32}$/, "Solo minúsculas, números, guion y guion bajo");

export const botConfigSchema = z.object({
  general: z
    .object({
      estado: z.enum(["online", "idle", "dnd", "invisible"]).default("online"),
      actividad: z
        .object({
          tipo: z.enum(["jugando", "viendo", "escuchando", "compitiendo", "personalizado"]).default("jugando"),
          texto: z.string().max(100).default(""),
        })
        .default({}),
      colorEmbeds: color.default("#5865F2"),
    })
    .default({}),
  utilidades: z.object({ activo: z.boolean().default(true) }).default({}),
  bienvenida: z
    .object({
      activa: z.boolean().default(false),
      canalId: idOVacio,
      mensaje: z.string().max(1000).default("¡Bienvenido {usuario} a **{servidor}**! Ya somos {miembros}."),
      conEmbed: z.boolean().default(true),
      imagen: urlHttps,
      md: z.object({ activo: z.boolean().default(false), mensaje: z.string().max(1000).default("¡Hola {usuario}! Gracias por unirte a {servidor}.") }).default({}),
      rolesAlEntrar: ids(),
      despedida: z.object({ activa: z.boolean().default(false), canalId: idOVacio, mensaje: z.string().max(1000).default("{usuario} salió de {servidor}.") }).default({}),
    })
    .default({}),
  moderacion: z
    .object({
      activa: z.boolean().default(false),
      canalLogs: idOVacio,
      inmunes: ids(),
      antispam: z.object({ activo: z.boolean().default(false), mensajes: z.number().int().min(3).max(30).default(5), segundos: z.number().int().min(2).max(60).default(6), accion: accion.default("timeout"), timeoutMin: z.number().int().min(1).max(10080).default(5) }).default({}),
      antienlaces: z.object({ activo: z.boolean().default(false), permitidos: z.array(z.string().max(100)).max(50).default([]), accion: accion.default("borrar") }).default({}),
      palabras: z.object({ activo: z.boolean().default(false), lista: z.array(z.string().trim().min(2).max(40)).max(200).default([]), accion: accion.default("borrar") }).default({}),
      menciones: z.object({ activo: z.boolean().default(false), maximo: z.number().int().min(2).max(50).default(5), accion: accion.default("timeout") }).default({}),
      advertencias: z.object({ activo: z.boolean().default(false), cantidad: z.number().int().min(2).max(20).default(3), accion: z.enum(["timeout", "kick", "ban"]).default("timeout"), timeoutMin: z.number().int().min(1).max(10080).default(60) }).default({}),
    })
    .default({}),
  niveles: z
    .object({
      activo: z.boolean().default(false),
      xpMin: z.number().int().min(1).max(100).default(15),
      xpMax: z.number().int().min(1).max(200).default(25),
      enfriamiento: z.number().int().min(5).max(600).default(60),
      canalAviso: idOVacio,
      mensaje: z.string().max(500).default("🎉 {usuario} subió al nivel **{nivel}**"),
      recompensas: z.array(z.object({ nivel: z.number().int().min(1).max(500), rolId: idDiscord })).max(25).default([]),
      ignorados: ids(50),
    })
    .default({}),
  economia: z
    .object({
      activa: z.boolean().default(false),
      moneda: z.object({ nombre: z.string().trim().min(1).max(20).default("monedas"), simbolo: z.string().trim().min(1).max(8).default("🪙") }).default({}),
      diario: z.object({ min: z.number().int().min(1).max(1_000_000).default(100), max: z.number().int().min(1).max(1_000_000).default(200), horas: z.number().int().min(1).max(168).default(24) }).default({}),
      trabajo: z.object({ min: z.number().int().min(1).max(1_000_000).default(30), max: z.number().int().min(1).max(1_000_000).default(120), minutos: z.number().int().min(1).max(1440).default(60) }).default({}),
      tienda: z.array(z.object({ id: slug, nombre: z.string().trim().min(1).max(60), precio: z.number().int().min(1).max(1_000_000_000), descripcion: z.string().max(200).default(""), rolId: idOVacio })).max(25).default([]),
    })
    .default({}),
  tickets: z
    .object({
      activo: z.boolean().default(false),
      categoriaId: idOVacio,
      soporteIds: ids(10),
      panel: z.object({ titulo: z.string().max(100).default("Soporte"), texto: z.string().max(1000).default("Toca el botón para abrir un ticket y te atendemos."), boton: z.string().max(40).default("Abrir ticket") }).default({}),
      bienvenida: z.string().max(1000).default("Hola {usuario}, cuéntanos en qué podemos ayudarte. Un miembro del equipo te atenderá pronto."),
      maximo: z.number().int().min(1).max(5).default(1),
      canalLogs: idOVacio,
    })
    .default({}),
  roles: z
    .object({
      paneles: z
        .array(
          z.object({
            id: slug,
            titulo: z.string().max(100).default("Elige tus roles"),
            texto: z.string().max(1000).default("Toca un botón para ponerte o quitarte el rol."),
            roles: z.array(z.object({ rolId: idDiscord, etiqueta: z.string().trim().min(1).max(40), emoji: z.string().max(16).default("") })).min(1).max(25),
          }),
        )
        .max(5)
        .default([]),
    })
    .default({}),
  comandos: z.array(z.object({ nombre: slug, descripcion: z.string().trim().min(1).max(100), respuesta: z.string().min(1).max(2000), conEmbed: z.boolean().default(false), privado: z.boolean().default(false) })).max(25).default([]),
  registros: z
    .object({
      canalId: idOVacio,
      borrados: z.boolean().default(true),
      editados: z.boolean().default(true),
      entradas: z.boolean().default(true),
      salidas: z.boolean().default(true),
      sanciones: z.boolean().default(true),
    })
    .default({}),
  programados: z.array(z.object({ id: slug, canalId: idDiscord, texto: z.string().min(1).max(2000), cadaMinutos: z.number().int().min(5).max(10080) })).max(10).default([]),
});

export type BotConfig = z.infer<typeof botConfigSchema>;
export const CONFIG_BOT_INICIAL: BotConfig = botConfigSchema.parse({});

// ---------------------------------------------------------------- funciones puras

/** Reemplaza {usuario}, {servidor}, {miembros}, {nivel}, {moneda}… en un texto. Lo desconocido se queda igual. */
export function rellenar(plantilla: string, vars: Record<string, string | number>): string {
  return plantilla.replace(/\{([a-z_]{2,20})\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** XP necesaria para pasar del nivel `n` al siguiente (la fórmula de MEE6). */
export const xpParaSubir = (n: number): number => 5 * n * n + 50 * n + 100;

/** Suma XP y devuelve el nivel y la XP que queda hacia el siguiente (puede subir varios niveles). */
export function sumarXp(nivel: number, xp: number, ganada: number): { nivel: number; xp: number; subio: boolean } {
  let n = nivel;
  let x = xp + ganada;
  while (x >= xpParaSubir(n)) {
    x -= xpParaSubir(n);
    n++;
  }
  return { nivel: n, xp: x, subio: n > nivel };
}

const sinAcentos = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** ¿Algún enlace del mensaje NO está en la lista de permitidos? (discord.gg también cuenta como enlace) */
export function enlaceNoPermitido(texto: string, permitidos: readonly string[]): string | null {
  const encontrados = texto.match(/(?:https?:\/\/|www\.|discord\.gg\/)[^\s<>]+/gi) ?? [];
  for (const e of encontrados) {
    let host = "";
    try {
      host = new URL(/^https?:/i.test(e) ? e : `https://${e}`).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      host = e.toLowerCase();
    }
    const ok = permitidos.some((p) => {
      const d = p.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
      return d && (host === d || host.endsWith(`.${d}`));
    });
    if (!ok) return e;
  }
  return null;
}

/** Palabra prohibida (sin importar mayúsculas ni acentos, y como palabra completa). */
export function palabraProhibida(texto: string, lista: readonly string[]): string | null {
  const t = ` ${sinAcentos(texto).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  for (const p of lista) {
    const w = sinAcentos(p).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (w && t.includes(` ${w} `)) return p;
  }
  return null;
}

/** Anti-spam: guarda las marcas de tiempo recientes y dice si ya pasó el límite en la ventana. */
export function revisarSpam(marcas: readonly number[], ahora: number, limite: number, segundos: number): { excede: boolean; marcas: number[] } {
  const vigentes = [...marcas.filter((m) => ahora - m < segundos * 1000), ahora];
  return { excede: vigentes.length > limite, marcas: vigentes };
}

/** Nombres de comandos que el bot ya trae (los tuyos no pueden repetirlos). */
export const COMANDOS_RESERVADOS = [
  "ping", "ayuda", "avatar", "servidor", "usuario", "ban", "kick", "timeout", "quitar-timeout", "advertir", "advertencias", "limpiar",
  "rango", "top-niveles", "balance", "diario", "trabajar", "pagar", "tienda", "comprar", "top-monedas", "dar-monedas", "panel-tickets", "cerrar-ticket", "panel-roles", "respaldo-servidor",
] as const;

export function validarCommandosPropios(comandos: BotConfig["comandos"]): string | null {
  const vistos = new Set<string>();
  for (const c of comandos) {
    if ((COMANDOS_RESERVADOS as readonly string[]).includes(c.nombre)) return `«${c.nombre}» ya es un comando del bot`;
    if (vistos.has(c.nombre)) return `«${c.nombre}» está repetido`;
    vistos.add(c.nombre);
  }
  return null;
}

/** Enlace para invitar el bot al servidor con los permisos que necesita (no pide Administrador). */
export function enlaceInvitacion(applicationId: string): string {
  const permisos =
    1n << 1n /* expulsar */ |
    1n << 2n /* banear */ |
    1n << 4n /* canales */ |
    1n << 6n /* reacciones */ |
    1n << 10n /* ver canales */ |
    1n << 11n /* enviar mensajes */ |
    1n << 13n /* gestionar mensajes */ |
    1n << 14n /* insertar enlaces */ |
    1n << 15n /* adjuntar archivos */ |
    1n << 16n /* leer historial */ |
    1n << 28n /* gestionar roles */ |
    1n << 40n; /* aislar miembros */
  return `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot%20applications.commands&permissions=${permisos.toString()}`;
}
