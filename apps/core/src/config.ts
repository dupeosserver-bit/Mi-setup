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

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

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
    /** Secreto compartido con el Email Worker de Cloudflare (firma HMAC-SHA256). */
    MAIL_INBOUND_SECRET: optionalString,
    /** Socket Unix del servicio del host que ejecuta /usr/local/sbin/mi-setup-wg. */
    VPN_SOCKET: z.string().default("/run/mi-setup/wg.sock"),
    ANTHROPIC_API_KEY: optionalString,
    AI_MODEL: optionalString.transform((v) => v ?? "claude-sonnet-5-5"),
    AI_MONTHLY_BUDGET_USD: z.coerce.number().positive().max(10_000).default(10),
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
    /** Carpeta de imágenes subidas. En Docker: /data/uploads (volumen). */
    UPLOADS_DIR: optionalString,
    /** Solo desarrollo: "1" usa Postgres embebido en .data/pglite (sin Docker). */
    DB_EMBEBIDA: z
      .string()
      .optional()
      .transform((v) => v === "1" || v === "true"),
  })
  .superRefine((env, ctx) => {
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
  if (!isProduction) corsOrigins.push("http://localhost:5173", "http://127.0.0.1:5173");

  const ntfyUrl = env.NTFY_URL ?? `https://${env.NTFY_HOST}`;

  // src/ y dist/ están a la misma profundidad: ../../ui/dist es apps/ui/dist.
  const uiDir = env.UI_DIR ?? (isProduction ? null : fileURLToPath(new URL("../../ui/dist", import.meta.url)));
  const uploadsDir =
    env.UPLOADS_DIR ??
    (isProduction ? "/data/uploads" : fileURLToPath(new URL("../../../.data/uploads", import.meta.url)));

  return { env, isProduction, databaseUrl: url.toString(), corsOrigins, ntfyUrl, uiDir, uploadsDir };
}
