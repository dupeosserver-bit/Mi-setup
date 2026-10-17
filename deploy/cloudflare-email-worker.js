/* global crypto, fetch, TextEncoder */
/**
 * Email Worker de Cloudflare para los correos temporales de Mi Setup.
 *
 * Cloudflare Email Routing (catch-all de mexicanland.net) → este Worker →
 * POST https://setup.mexicanland.net/api/mail/inbound firmado con HMAC-SHA256.
 *
 * Despliegue (ver docs/USO.md):
 *   npm i postal-mime
 *   wrangler secret put MAIL_INBOUND_SECRET   (el mismo valor que en el .env del VPS)
 *   variable MI_SETUP_URL = https://setup.mexicanland.net
 *
 * Firma: hex(HMAC-SHA256(MAIL_INBOUND_SECRET, "<unix_segundos>.<cuerpo JSON>"))
 * en las cabeceras x-mi-setup-fecha y x-mi-setup-firma.
 */
import PostalMime from "postal-mime";

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_TEXTO = 400_000;
const MAX_HTML = 800_000;

async function hmacHex(secreto, mensaje) {
  const codificador = new TextEncoder();
  const llave = await crypto.subtle.importKey("raw", codificador.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const firma = await crypto.subtle.sign("HMAC", llave, codificador.encode(mensaje));
  return [...new Uint8Array(firma)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async email(message, env) {
    if (message.rawSize > MAX_BYTES) {
      message.setReject("Mensaje demasiado grande");
      return;
    }
    const correo = await PostalMime.parse(message.raw);
    const remitente = correo.from?.address ? `${correo.from.name ? `${correo.from.name} ` : ""}<${correo.from.address}>` : message.from;
    const cuerpo = JSON.stringify({
      para: message.to,
      de: remitente,
      asunto: correo.subject ?? "",
      texto: (correo.text ?? "").slice(0, MAX_TEXTO),
      html: correo.html ? correo.html.slice(0, MAX_HTML) : null,
      messageId: correo.messageId ?? undefined,
      tamano: message.rawSize,
    });
    const fecha = String(Math.floor(Date.now() / 1000));
    const firma = await hmacHex(env.MAIL_INBOUND_SECRET, `${fecha}.${cuerpo}`);
    const respuesta = await fetch(`${env.MI_SETUP_URL}/api/mail/inbound`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mi-setup-fecha": fecha, "x-mi-setup-firma": firma },
      body: cuerpo,
    });
    // Si Mi Setup no lo acepta, Cloudflare reintenta la entrega.
    if (!respuesta.ok) throw new Error(`Mi Setup respondió ${respuesta.status}`);
  },
};
