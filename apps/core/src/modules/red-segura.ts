/**
 * Descargas a URLs que escribe el usuario (vigilante de precios) sin abrir
 * la puerta a la red interna (SSRF): solo http/https, se rechazan IPs
 * privadas, de loopback, link-local y reservadas en cada salto de
 * redirección, con tiempo y tamaño máximos.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "../http-error.js";

function v4Privada(ip: string): boolean {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

export function ipNoPermitida(ip: string): boolean {
  const tipo = isIP(ip);
  if (tipo === 4) return v4Privada(ip);
  if (tipo !== 6) return true;
  const x = ip.toLowerCase();
  const mapeada = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x);
  if (mapeada?.[1]) return v4Privada(mapeada[1]);
  return x === "::" || x === "::1" || /^f[cd]/.test(x) || /^fe[89ab]/.test(x) || x.startsWith("ff");
}

export async function validarDestino(url: URL): Promise<void> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new HttpError(400, "Solo se permiten URLs http o https");
  if (url.username || url.password) throw new HttpError(400, "La URL no puede llevar usuario ni contraseña");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const direcciones = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (direcciones.length === 0) throw new HttpError(400, "No se pudo resolver el dominio");
  if (direcciones.some((d) => ipNoPermitida(d.address))) throw new HttpError(400, "Dirección no permitida (red interna)");
}

export interface OpcionesDescarga {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirecciones?: number;
  /** Si la página pasa del límite, devuelve lo que alcanzó a leer en vez de fallar. */
  cortar?: boolean;
}

/** Descarga texto (HTML) de una URL pública. */
export async function descargarTextoSeguro(urlTexto: string, opciones: OpcionesDescarga = {}): Promise<string> {
  const { timeoutMs = 15_000, maxBytes = 2_000_000, maxRedirecciones = 3, cortar = false } = opciones;
  let url = new URL(urlTexto);
  for (let salto = 0; ; salto++) {
    await validarDestino(url);
    const r = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "Mozilla/5.0 (MiSetup vigilante de precios)", accept: "text/html,*/*;q=0.8" },
    });
    if (r.status >= 300 && r.status < 400) {
      const destino = r.headers.get("location");
      if (!destino || salto >= maxRedirecciones) throw new HttpError(502, "Demasiadas redirecciones");
      url = new URL(destino, url);
      continue;
    }
    if (!r.ok) throw new HttpError(502, `La página respondió ${r.status}`);
    if (!r.body) return "";
    const lector = r.body.getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await lector.cancel();
        if (cortar) break;
        throw new HttpError(502, "La página es demasiado grande");
      }
      partes.push(value);
    }
    return Buffer.concat(partes).toString("utf8");
  }
}
