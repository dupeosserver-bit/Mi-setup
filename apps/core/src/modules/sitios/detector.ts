/**
 * ¿Esta petición es para un sitio publicado? (nombre.mexicanland.net o un
 * dominio propio). Fastify lo pregunta antes de buscar la ruta (rewriteUrl):
 * si es un sitio, la petición va a /__sitio/… y la atiende el módulo de sitios.
 */
import type { Config } from "../../config.js";

export interface DetectorSitios {
  esSitio(host: string | undefined): boolean;
  /** "nombre" si el host es nombre.DOMINIO; si no, null. */
  slugDe(host: string): string | null;
  /** Dominios propios publicados (se refrescan al publicar o cambiar ajustes). */
  dominios: Set<string>;
  /** Sube cada vez que se publica o cambia un sitio (invalida cachés). */
  version: number;
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function limpiarHost(host: string | undefined): string {
  return (host ?? "").toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function crearDetectorSitios(config: Config): DetectorSitios {
  const dominio = config.env.DOMAIN.toLowerCase();
  const reservados = new Set([config.env.APP_HOST, config.env.NTFY_HOST, config.env.RD_HOST].map((h) => h.toLowerCase()));
  const dominios = new Set<string>();
  const slugDe = (host: string): string | null => {
    const h = limpiarHost(host);
    if (reservados.has(h)) return null;
    for (const base of [dominio, ...(config.isProduction ? [] : ["localhost"])]) {
      if (h.endsWith(`.${base}`)) {
        const slug = h.slice(0, -(base.length + 1));
        return SLUG.test(slug) ? slug : null;
      }
    }
    return null;
  };
  return {
    dominios,
    version: 0,
    slugDe,
    esSitio: (host) => {
      const h = limpiarHost(host);
      return Boolean(h) && (slugDe(h) !== null || dominios.has(h));
    },
  };
}

export const SLUG_VALIDO = SLUG;
/** Subdominios que no se pueden usar para sitios. */
export const SLUGS_RESERVADOS = new Set(["www", "setup", "ntfy", "rd", "panel", "api", "mail", "admin", "app", "test", "pruebas", "node", "nodetest", "vpn", "status"]);
