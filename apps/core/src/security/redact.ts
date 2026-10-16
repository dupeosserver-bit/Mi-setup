/**
 * Redacción de secretos para logs y auditoría. Cualquier clave que parezca
 * contener un secreto se reemplaza por "[REDACTADO]", a cualquier profundidad.
 */

export const REDACTED = "[REDACTADO]";

const SECRET_KEY_PATTERN =
  /pass|secret|token|key|authorization|cookie|totp|otp|private|credential|pin|signature|hmac/i;

/** Rutas que pino debe ocultar en los logs de peticiones. */
export const LOG_REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "*.password",
  "*.token",
  "*.secret",
];

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 10) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      result[key] = isSecretKey(key) ? REDACTED : redactSecrets(inner, depth + 1);
    }
    return result;
  }
  return value;
}
