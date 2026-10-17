/** Autenticador 2FA: códigos TOTP (RFC 6238) calculados en el cliente con WebCrypto. */

const ALFABETO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export type Algoritmo = "SHA1" | "SHA256" | "SHA512";

export interface CuentaTotp {
  emisor: string;
  cuenta: string;
  secreto: string;
  algoritmo: Algoritmo;
  digitos: number;
  periodo: number;
}

export function base32Decodificar(entrada: string): Uint8Array<ArrayBuffer> {
  const limpio = entrada.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let valor = 0;
  const salida: number[] = [];
  for (const c of limpio) {
    const i = ALFABETO.indexOf(c);
    if (i === -1) throw new Error("La clave tiene caracteres que no son base32");
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) {
      salida.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  if (salida.length < 10) throw new Error("La clave es demasiado corta");
  return new Uint8Array(salida);
}

const HASH: Record<Algoritmo, string> = { SHA1: "SHA-1", SHA256: "SHA-256", SHA512: "SHA-512" };

export async function hotp(secreto: Uint8Array<ArrayBuffer>, contador: number, algoritmo: Algoritmo = "SHA1", digitos = 6): Promise<string> {
  const llave = await crypto.subtle.importKey("raw", secreto, { name: "HMAC", hash: { name: HASH[algoritmo] } }, false, ["sign"]);
  const mensaje = new Uint8Array(8);
  new DataView(mensaje.buffer).setBigUint64(0, BigInt(contador));
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", llave, mensaje));
  const desplazamiento = (firma[firma.length - 1] ?? 0) & 0x0f;
  const binario =
    (((firma[desplazamiento] ?? 0) & 0x7f) << 24) |
    ((firma[desplazamiento + 1] ?? 0) << 16) |
    ((firma[desplazamiento + 2] ?? 0) << 8) |
    (firma[desplazamiento + 3] ?? 0);
  return String(binario % 10 ** digitos).padStart(digitos, "0");
}

export async function codigoTotp(c: CuentaTotp, ahoraMs = Date.now()): Promise<{ codigo: string; restante: number }> {
  const paso = Math.floor(ahoraMs / 1000 / c.periodo);
  const codigo = await hotp(base32Decodificar(c.secreto), paso, c.algoritmo, c.digitos);
  return { codigo, restante: c.periodo - (Math.floor(ahoraMs / 1000) % c.periodo) };
}

/** Lee un enlace otpauth://totp/Emisor:cuenta?secret=…&issuer=…&algorithm=…&digits=…&period=… */
export function parsearOtpauth(uri: string): CuentaTotp {
  let url: URL;
  try {
    url = new URL(uri.trim());
  } catch {
    throw new Error("No es un enlace otpauth válido");
  }
  if (url.protocol !== "otpauth:") throw new Error("El enlace debe empezar con otpauth://");
  if (url.host.toLowerCase() !== "totp") throw new Error("Solo se admiten códigos TOTP (por tiempo)");
  const etiqueta = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const [antes, despues] = etiqueta.includes(":") ? etiqueta.split(/:(.*)/s) : ["", etiqueta];
  const secreto = url.searchParams.get("secret") ?? "";
  base32Decodificar(secreto);
  const algoritmo = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase() as Algoritmo;
  if (!(algoritmo in HASH)) throw new Error(`Algoritmo no soportado: ${algoritmo}`);
  const digitos = Number(url.searchParams.get("digits") ?? 6);
  const periodo = Number(url.searchParams.get("period") ?? 30);
  if (![6, 7, 8].includes(digitos)) throw new Error("Los dígitos deben ser 6, 7 u 8");
  if (!Number.isInteger(periodo) || periodo < 10 || periodo > 300) throw new Error("Periodo inválido");
  return {
    emisor: url.searchParams.get("issuer") ?? antes ?? "",
    cuenta: (despues ?? "").trim(),
    secreto: secreto.toUpperCase().replace(/[\s=]/g, ""),
    algoritmo,
    digitos,
    periodo,
  };
}
