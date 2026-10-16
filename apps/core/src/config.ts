/**
 * Configuración de core, leída solo de variables de entorno y validada con Zod.
 * Nunca se escriben secretos en el código: los valores por defecto son seguros
 * y vacíos para todo lo sensible.
 */
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

    POSTGRES_HOST: z.string().default("localhost"),
    POSTGRES_PORT: z.coerce.number().int().default(5432),
    POSTGRES_USER: optionalString.transform((v) => v ?? "misetup"),
    POSTGRES_DB: optionalString.transform((v) => v ?? "misetup"),
    POSTGRES_PASSWORD: optionalString,

    JWT_SECRET: optionalString,
    SERVER_ENC_KEY: optionalString,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
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

  const corsOrigins = [`https://${env.APP_HOST}`];
  if (!isProduction) corsOrigins.push("http://localhost:5173", "http://127.0.0.1:5173");

  return { env, isProduction, databaseUrl: url.toString(), corsOrigins };
}
