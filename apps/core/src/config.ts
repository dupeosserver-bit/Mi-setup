/**
 * Configuración de core, leída solo de variables de entorno y validada con Zod.
 * Nunca se escriben secretos en el código: los valores por defecto son seguros
 * y vacíos para todo lo sensible.
 */
import { fileURLToPath } from "node:url";
import { z } from "zod";

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== "" ? v : undefined));

/** Forma de cada variable (también la usa Ajustes → Servicios para validar un valor suelto). */
export const envBase = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    /** Edición: "personal" (todo) o "publica" (la de la comunidad). La fija la imagen de Docker al compilar. */
    EDICION: z.enum(["personal", "publica"]).default("personal"),

    DOMAIN: z.string().default("mexicanland.net"),
    APP_HOST: z.string().default("setup.mexicanland.net"),
    NTFY_HOST: z.string().default("ntfy.mexicanland.net"),
    RD_HOST: z.string().default("rd.mexicanland.net"),
    /** Clave pública del servidor RustDesk (id_ed25519.pub de hbbs). No es secreta; se muestra para configurar el cliente. */
    RD_PUBLIC_KEY: optionalString,

    POSTGRES_HOST: z.string().default("localhost"),
    POSTGRES_PORT: z.coerce.number().int().default(5432),
    POSTGRES_USER: optionalString.transform((v) => v ?? "misetup"),
    POSTGRES_DB: optionalString.transform((v) => v ?? "misetup"),
    POSTGRES_PASSWORD: optionalString,

    JWT_SECRET: optionalString,
    SERVER_ENC_KEY: optionalString,

    NTFY_TOPIC: optionalString,
    /** URL a la que core publica avisos. En Docker: http://ntfy (red interna). */
    NTFY_URL: optionalString,

    PTERO_URL: z.string().url().default("https://panel.mexicanland.org"),
    PTERO_CLIENT_KEY: optionalString,
    PTERO_APP_KEY: optionalString,
    /** Carpeta (montada de solo lectura) con los respaldos de la base que hace el script del VPS. */
    BACKUP_DIR: optionalString,
    /** Carpeta privada para archivos compartidos, música y videos. */
    ARCHIVOS_DIR: optionalString,
    /** Clave gratis de TMDB (películas y series). */
    TMDB_API_KEY: optionalString,
    GEMINI_API_KEY: optionalString,
    /** Token de Cloudflare (permiso Zone → DNS → Edit) para crear los registros DNS de los sitios. */
    CLOUDFLARE_API_TOKEN: optionalString,
    /** Antivirus ClamAV (clamd) para revisar lo que sube la comunidad del sitio oficial. */
    CLAMAV_HOST: optionalString,
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
    /** App de TikTok (developers.tiktok.com) para publicar clips. */
    TIKTOK_CLIENT_KEY: optionalString,
    /** Modelo de Gemini para pasar voz a texto (dictado en PC). */
    GEMINI_TEXT_MODEL: z.string().default("gemini-2.5-flash"),
    TIKTOK_CLIENT_SECRET: optionalString,
    CURSEFORGE_API_KEY: optionalString,
    // Token gratis del SIE de Banxico (CETES y tasa objetivo para Rendimientos).
    BANXICO_TOKEN: optionalString,
    GEMINI_IMAGE_MODEL: z.string().default("gemini-2.5-flash-image"),
    MERCADOLIBRE_CLIENT_ID: optionalString,
    MERCADOLIBRE_CLIENT_SECRET: optionalString,
    SPOTIFY_CLIENT_ID: optionalString,
    SPOTIFY_CLIENT_SECRET: optionalString,
    /** Carpeta con las apps para descargar (APK y EXE). */
    DESCARGAS_DIR: optionalString,
    /** Secreto compartido con el Email Worker de Cloudflare (firma HMAC-SHA256). */
    MAIL_INBOUND_SECRET: optionalString,
    /** Socket Unix del servicio del host que ejecuta /usr/local/sbin/mi-setup-wg. */
    ANTHROPIC_API_KEY: optionalString,
    AI_MODEL: optionalString.transform((v) => v ?? "claude-sonnet-5-5"),
    AI_MONTHLY_BUDGET_USD: z.coerce.number().positive().max(10_000).default(10),
    IA_CONTEXTO_MAX_ARCHIVOS: z.coerce.number().int().min(1).max(500).default(20),
    IA_CONTEXTO_MAX_MB: z.coerce.number().int().min(1).max(5000).default(100),
    /** IA gratuita local (Ollama en el VPS), p. ej. http://misetup-ollama:11434. */
    OLLAMA_URL: optionalString,
    OLLAMA_MODEL: optionalString.transform((v) => v ?? "llama3.2:3b"),
    DISCORD_BOT_TOKEN: optionalString,
    X_CLIENT_ID: optionalString,
    X_CLIENT_SECRET: optionalString,
    X_BEARER_TOKEN: optionalString,
    /** Costo estimado (USD) por publicación y por cada mención leída en X (pago por uso). */
    X_COSTO_PUBLICAR_USD: z.coerce.number().min(0).default(0.01),
    X_COSTO_LECTURA_USD: z.coerce.number().min(0).default(0.005),
    TWITCH_CLIENT_ID: optionalString,
    TWITCH_CLIENT_SECRET: optionalString,
    GOOGLE_CLIENT_ID: optionalString,
    GOOGLE_CLIENT_SECRET: optionalString,
    KICK_CLIENT_ID: optionalString,
    KICK_CLIENT_SECRET: optionalString,
    /** Carpeta de la UI compilada. En Docker: /app/public. */
    UI_DIR: optionalString,
    /** Demo pública compilada (apps/ui con --mode demo); se sirve en /demo/. */
    DEMO_DIR: optionalString,
    /** Versión web de la página oficial (apps/ui con --mode web); se sirve en misetup.DOMINIO/app/. */
    WEB_DIR: optionalString,
    /**
     * Página desde la que la gente usa Mi Setup en el navegador sin descargar nada
     * (misetup.mexicanland.net/app). Se permite por CORS en cualquier instalación;
     * vacío = no se permite.
     */
    APP_WEB_ORIGEN: z.string().default("https://misetup.mexicanland.net"),
    /** Carpeta de imágenes subidas. En Docker: /data/uploads (volumen). */
    UPLOADS_DIR: optionalString,
    /** Solo desarrollo: "1" usa Postgres embebido en .data/pglite (sin Docker). */
    DB_EMBEBIDA: z
      .string()
      .optional()
      .transform((v) => v === "1" || v === "true"),
  });

const envSchema = envBase.superRefine((env, ctx) => {
    for (const key of ["JWT_SECRET", "SERVER_ENC_KEY"] as const) {
      const value = env[key];
      if (value && value.length < 32) {
        ctx.addIssue({ code: "custom", path: [key], message: `${key} debe tener al menos 32 caracteres` });
      }
    }
    if (env.NODE_ENV !== "production") return;
    if (env.DB_EMBEBIDA) {
      ctx.addIssue({ code: "custom", path: ["DB_EMBEBIDA"], message: "DB_EMBEBIDA solo se permite en desarrollo" });
    }
    for (const key of ["POSTGRES_PASSWORD", "JWT_SECRET", "SERVER_ENC_KEY"] as const) {
      if (!env[key]) {
        ctx.addIssue({ code: "custom", path: [key], message: `Falta configurar: ${key}` });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export interface Config {
  readonly env: Env;
  readonly isProduction: boolean;
  readonly databaseUrl: string;
  /** Orígenes permitidos por CORS (lista cerrada). */
  readonly corsOrigins: readonly string[];
  readonly ntfyUrl: string;
  /** Carpeta de la UI compilada (null = no se sirve UI). */
  readonly uiDir: string | null;
  readonly demoDir: string | null;
  readonly webDir: string | null;
  readonly uploadsDir: string;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detalle = parsed.error.issues.map((i) => i.message).join("; ");
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  const env = parsed.data;
  const isProduction = env.NODE_ENV === "production";

  const url = new URL("postgres://placeholder");
  url.hostname = env.POSTGRES_HOST;
  url.port = String(env.POSTGRES_PORT);
  url.username = env.POSTGRES_USER;
  url.password = env.POSTGRES_PASSWORD ?? "";
  url.pathname = `/${env.POSTGRES_DB}`;

  // La app de Android (Capacitor) carga la UI desde https://localhost.
  const corsOrigins = [`https://${env.APP_HOST}`, "https://localhost", "capacitor://localhost"];
  if (/^https:\/\/[a-z0-9.-]+$/.test(env.APP_WEB_ORIGEN)) corsOrigins.push(env.APP_WEB_ORIGEN);
  if (!isProduction) corsOrigins.push("http://localhost:5173", "http://127.0.0.1:5173");

  const ntfyUrl = env.NTFY_URL ?? `https://${env.NTFY_HOST}`;

  // src/ y dist/ están a la misma profundidad: ../../ui/dist es apps/ui/dist.
  const uiDir = env.UI_DIR ?? (isProduction ? null : fileURLToPath(new URL("../../ui/dist", import.meta.url)));
  const uploadsDir =
    env.UPLOADS_DIR ??
    (isProduction ? "/data/uploads" : fileURLToPath(new URL("../../../.data/uploads", import.meta.url)));

  const demoDir = env.DEMO_DIR ?? (isProduction ? null : fileURLToPath(new URL("../../ui/dist-demo", import.meta.url)));

  const webDir = env.WEB_DIR ?? (isProduction ? null : fileURLToPath(new URL("../../ui/dist-web", import.meta.url)));

  return { env, isProduction, databaseUrl: url.toString(), corsOrigins, ntfyUrl, uiDir, demoDir, webDir, uploadsDir };
}
