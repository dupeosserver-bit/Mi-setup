/**
 * Hash de contraseñas y PIN con Argon2id (algoritmo por defecto de
 * @node-rs/argon2), con los parámetros mínimos recomendados por OWASP.
 */
import { hash, verify } from "@node-rs/argon2";

const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashSecret(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifySecret(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;

/** Hash de relleno para que un correo inexistente tarde lo mismo que uno real. */
export function dummyHash(): Promise<string> {
  dummy ??= hashSecret("mi-setup-relleno-sin-uso");
  return dummy;
}
