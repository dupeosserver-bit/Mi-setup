/**
 * Ciberseguridad:
 * - Revisar un sitio: certificado HTTPS (cuándo vence), cabeceras de seguridad
 *   y protección del correo del dominio (SPF y DMARC).
 * - ¿Mi contraseña se filtró? Con "k-anonimato": solo viajan los primeros 5
 *   caracteres del hash SHA-1; la contraseña nunca sale de tu equipo.
 */
import { resolveTxt } from "node:dns/promises";
import { connect, type PeerCertificate } from "node:tls";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../http-error.js";
import type { ModuleDeps } from "./common.js";
import { validarDestino } from "./red-segura.js";

type Estado = "ok" | "aviso" | "mal";
export interface Revision {
  id: string;
  titulo: string;
  estado: Estado;
  detalle: string;
}

const CABECERAS: { nombre: string; titulo: string; explicacion: string; peso: Estado }[] = [
  { nombre: "strict-transport-security", titulo: "HSTS", explicacion: "Obliga al navegador a usar siempre HTTPS.", peso: "mal" },
  { nombre: "content-security-policy", titulo: "Política de contenido (CSP)", explicacion: "Frena que inyecten scripts en tu página.", peso: "aviso" },
  { nombre: "x-content-type-options", titulo: "X-Content-Type-Options", explicacion: "Evita que el navegador adivine tipos de archivo.", peso: "aviso" },
  { nombre: "x-frame-options", titulo: "Protección contra marcos (clickjacking)", explicacion: "Impide que metan tu página dentro de otra para engañar clics.", peso: "aviso" },
  { nombre: "referrer-policy", titulo: "Referrer-Policy", explicacion: "Controla qué dirección se comparte al salir de tu sitio.", peso: "aviso" },
];

/** Evalúa las cabeceras HTTP de seguridad. */
export function revisarCabeceras(h: Headers): Revision[] {
  return CABECERAS.map((c) => {
    const valor = h.get(c.nombre);
    const conCsp = c.nombre === "x-frame-options" && /frame-ancestors/i.test(h.get("content-security-policy") ?? "");
    return valor || conCsp
      ? { id: c.nombre, titulo: c.titulo, estado: "ok" as const, detalle: conCsp && !valor ? "Cubierto por frame-ancestors en la CSP." : `${c.explicacion} Valor: ${valor!.slice(0, 120)}` }
      : { id: c.nombre, titulo: c.titulo, estado: c.peso, detalle: `Falta. ${c.explicacion}` };
  });
}

/** Evalúa SPF y DMARC a partir de los registros TXT. */
export function revisarCorreo(txt: string[], dmarc: string[]): Revision[] {
  const spf = txt.find((t) => /^v=spf1\b/i.test(t));
  const dm = dmarc.find((t) => /^v=dmarc1\b/i.test(t));
  const politica = dm?.match(/\bp=(\w+)/i)?.[1]?.toLowerCase();
  return [
    spf
      ? { id: "spf", titulo: "SPF (quién puede mandar correo con tu dominio)", estado: /[-~]all\b/.test(spf) ? "ok" : "aviso", detalle: spf.slice(0, 200) }
      : { id: "spf", titulo: "SPF (quién puede mandar correo con tu dominio)", estado: "aviso", detalle: "No hay registro SPF: cualquiera podría mandar correos haciéndose pasar por tu dominio." },
    dm
      ? {
          id: "dmarc",
          titulo: "DMARC (qué hacer con correos falsos)",
          estado: politica === "reject" || politica === "quarantine" ? "ok" : "aviso",
          detalle: politica === "none" ? "Existe pero en modo solo observar (p=none). Cuando todo funcione, súbelo a quarantine." : dm.slice(0, 200),
        }
      : { id: "dmarc", titulo: "DMARC (qué hacer con correos falsos)", estado: "aviso", detalle: "No hay registro DMARC en _dmarc de tu dominio." },
  ];
}

function certificado(host: string): Promise<{ cert: PeerCertificate; protocolo: string | null; autorizado: boolean; error?: string }> {
  return new Promise((resolve, reject) => {
    const s = connect({ host, port: 443, servername: host, rejectUnauthorized: false, timeout: 8_000 }, () => {
      resolve({ cert: s.getPeerCertificate(), protocolo: s.getProtocol(), autorizado: s.authorized, error: s.authorizationError ? String(s.authorizationError) : undefined });
      s.end();
    });
    s.on("timeout", () => {
      s.destroy();
      reject(new HttpError(502, "El sitio no respondió en el puerto 443 (HTTPS)"));
    });
    s.on("error", () => reject(new HttpError(502, "No se pudo conectar por HTTPS")));
  });
}

export function ciberseguridadRoutes(deps: ModuleDeps) {
  return async function (app: FastifyInstance): Promise<void> {
    const leer = { config: { acceso: { modulo: "ciberseguridad" as const, nivel: "lectura" as const } } };

    app.post("/api/ciberseguridad/sitio", leer, async (request) => {
      const { sitio } = z.object({ sitio: z.string().trim().min(3).max(300) }).parse(request.body);
      const url = new URL(/^https?:\/\//i.test(sitio) ? sitio : `https://${sitio}`);
      url.protocol = "https:";
      await validarDestino(url);
      const host = url.hostname;
      const dominio = host.replace(/^www\./, "");
      const revisiones: Revision[] = [];

      // Certificado
      try {
        const c = await certificado(host);
        const vence = new Date(c.cert.valid_to);
        const dias = Math.floor((vence.getTime() - deps.now().getTime()) / 86_400_000);
        revisiones.push({
          id: "certificado",
          titulo: "Certificado HTTPS",
          estado: !c.autorizado || dias < 0 ? "mal" : dias < 14 ? "aviso" : "ok",
          detalle: !c.autorizado
            ? `No es válido (${c.error ?? "desconocido"}). Los visitantes verán una advertencia.`
            : `Válido, emitido por ${c.cert.issuer?.O ?? c.cert.issuer?.CN ?? "?"}. Vence en ${dias} días (${vence.toLocaleDateString("es-MX")}).`,
        });
        revisiones.push({
          id: "tls",
          titulo: "Versión de cifrado",
          estado: c.protocolo === "TLSv1.3" || c.protocolo === "TLSv1.2" ? "ok" : "mal",
          detalle: c.protocolo ?? "desconocida",
        });
      } catch (err) {
        revisiones.push({ id: "certificado", titulo: "Certificado HTTPS", estado: "mal", detalle: err instanceof Error ? err.message : "Sin HTTPS" });
      }

      // Cabeceras (sin seguir redirecciones a otros sitios)
      const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0 (MiSetup revisión de seguridad)" } }).catch(() => null);
      if (r) {
        revisiones.push(...revisarCabeceras(r.headers));
        const servidor = r.headers.get("server");
        const powered = r.headers.get("x-powered-by");
        if (powered || (servidor && /\d/.test(servidor))) {
          revisiones.push({ id: "version", titulo: "Muestra versiones del servidor", estado: "aviso", detalle: `Le dice a los atacantes qué usas: ${[servidor, powered].filter(Boolean).join(", ")}` });
        }
      } else revisiones.push({ id: "respuesta", titulo: "Respuesta del sitio", estado: "mal", detalle: "No respondió." });

      // Correo del dominio
      const [txt, dmarc] = await Promise.all([
        resolveTxt(dominio).then((l) => l.map((p) => p.join("")), () => []),
        resolveTxt(`_dmarc.${dominio}`).then((l) => l.map((p) => p.join("")), () => []),
      ]);
      revisiones.push(...revisarCorreo(txt, dmarc));

      const peso = { ok: 1, aviso: 0.5, mal: 0 } as const;
      return { sitio: host, calificacion: Math.round((revisiones.reduce((t, x) => t + peso[x.estado], 0) / revisiones.length) * 100), revisiones };
    });

    /** Proxy de Have I Been Pwned: solo recibe el prefijo de 5 caracteres del hash. */
    app.get("/api/ciberseguridad/contrasena/:prefijo", leer, async (request, reply) => {
      const { prefijo } = z.object({ prefijo: z.string().regex(/^[0-9a-fA-F]{5}$/) }).parse(request.params);
      const r = await fetch(`https://api.pwnedpasswords.com/range/${prefijo.toUpperCase()}`, {
        headers: { "add-padding": "true", "user-agent": "MiSetup" },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      if (!r?.ok) throw new HttpError(502, "El servicio de contraseñas filtradas no respondió");
      return reply.header("cache-control", "no-store").send({ lista: await r.text() });
    });
  };
}
