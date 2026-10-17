/**
 * Cifrado de la bóveda en el cliente (libsodium):
 * - Clave maestra → Argon2id (crypto_pwhash) → clave de 32 bytes.
 * - Cada elemento: XChaCha20-Poly1305 con nonce aleatorio de 24 bytes y el
 *   tipo como dato asociado. Formato: v1.<nonce>.<cifrado> (base64url).
 * El servidor solo recibe texto cifrado, la sal y los parámetros.
 */
import sodium from "libsodium-wrappers-sumo";

export interface ParametrosKdf {
  alg: "argon2id13";
  opslimit: number;
  memlimit: number;
}

/** 3 pasadas y 64 MiB: seguro y razonable también en el celular. */
export const KDF_POR_DEFECTO: ParametrosKdf = { alg: "argon2id13", opslimit: 3, memlimit: 64 * 1024 * 1024 };
const TEXTO_VERIFICADOR = "mi-setup-boveda-v1";

async function listo(): Promise<typeof sodium> {
  await sodium.ready;
  return sodium;
}

export async function nuevaSal(): Promise<string> {
  const s = await listo();
  return s.to_base64(s.randombytes_buf(s.crypto_pwhash_SALTBYTES));
}

export async function derivarClave(claveMaestra: string, sal: string, kdf: ParametrosKdf = KDF_POR_DEFECTO): Promise<Uint8Array> {
  const s = await listo();
  return s.crypto_pwhash(32, claveMaestra, s.from_base64(sal), kdf.opslimit, kdf.memlimit, s.crypto_pwhash_ALG_ARGON2ID13);
}

export const contextoDe = (tipo: string) => `mi-setup:${tipo}`;

export async function cifrar(clave: Uint8Array, valor: unknown, contexto: string): Promise<string> {
  const s = await listo();
  const nonce = s.randombytes_buf(s.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const cifrado = s.crypto_aead_xchacha20poly1305_ietf_encrypt(s.from_string(JSON.stringify(valor)), contexto, null, nonce, clave);
  return `v1.${s.to_base64(nonce)}.${s.to_base64(cifrado)}`;
}

export async function descifrar<T>(clave: Uint8Array, dato: string, contexto: string): Promise<T> {
  const s = await listo();
  const [version, nonce, cifrado] = dato.split(".");
  if (version !== "v1" || !nonce || !cifrado) throw new Error("Formato de dato desconocido");
  const plano = s.crypto_aead_xchacha20poly1305_ietf_decrypt(null, s.from_base64(cifrado), contexto, s.from_base64(nonce), clave);
  return JSON.parse(s.to_string(plano)) as T;
}

export function crearVerificador(clave: Uint8Array): Promise<string> {
  return cifrar(clave, TEXTO_VERIFICADOR, "verificador");
}

export async function claveCorrecta(clave: Uint8Array, verificador: string): Promise<boolean> {
  try {
    return (await descifrar<string>(clave, verificador, "verificador")) === TEXTO_VERIFICADOR;
  } catch {
    return false;
  }
}

/** Borra la clave de la memoria al bloquear. */
export async function olvidar(clave: Uint8Array): Promise<void> {
  (await listo()).memzero(clave);
}
