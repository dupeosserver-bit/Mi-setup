/** Peticiones JSON a APIs externas y una página HTML simple para respuestas de navegador. */
import { HttpError } from "../http-error.js";

/** Petición JSON a una API externa con errores en español. */
export async function pedirJson<T>(servicio: string, url: string, init: RequestInit = {}): Promise<T> {
  // Algunas APIs (p. ej. CheapShark) rechazan peticiones sin un User-Agent descriptivo.
  const headers = { "user-agent": "MiSetup/0.1 (+https://setup.mexicanland.net)", ...(init.headers as Record<string, string> | undefined) };
  const r = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(15_000) });
  const texto = await r.text();
  if (!r.ok) {
    if (r.status === 401) throw new HttpError(502, `${servicio}: la sesión expiró o fue revocada. Vuelve a conectar la cuenta.`, "token_invalido");
    throw new HttpError(502, `${servicio} respondió ${r.status}: ${texto.slice(0, 200)}`);
  }
  return (texto ? JSON.parse(texto) : {}) as T;
}

/** Página mínima (fin de una conexión OAuth, avisos). */
export function pagina(titulo: string, texto: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title></head><body style="font-family:system-ui;background:#1c1c1e;color:#f2f2f7;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:420px;padding:24px;text-align:center"><h1 style="font-size:20px">${esc(titulo)}</h1><p style="color:#a1a1aa">${esc(texto)}</p></main></body></html>`;
}
