import type { Preferencias } from "./preferencias.js";

export const MODOS_ACTUALIZACION = ["auto", "preguntar", "no"] as const;
export type ModoActualizacion = (typeof MODOS_ACTUALIZACION)[number];

export const esModoActualizacion = (v: unknown): v is ModoActualizacion => typeof v === "string" && (MODOS_ACTUALIZACION as readonly string[]).includes(v);

/** Desde 0.11.5b el dueño del VPS también elige (antes se le forzaba «Descargar solas»). */
export const puedeRechazarActualizaciones = (_vinculadoVps: boolean): boolean => true;

export function modoActualizacionEfectivo(elegido: unknown, _vinculadoVps: boolean): ModoActualizacion {
  return esModoActualizacion(elegido) ? elegido : "auto";
}

export type PantallaBienvenida = "tutorial" | "novedades" | null;

export function pantallaBienvenida(datos: { tutorialVisto: boolean; novedadesVistas?: string | null; version: string; vistaEnEsteEquipo?: boolean }): PantallaBienvenida {
  if (!datos.tutorialVisto) return "tutorial";
  if (datos.novedadesVistas === datos.version || datos.vistaEnEsteEquipo) return null;
  return "novedades";
}

export const PREFERENCIAS_BASICAS = ["tema", "fuente", "zoom", "idioma", "vidrio", "lectura", "terminal", "voz"] as const satisfies readonly (keyof Preferencias)[];
export type PreferenciasBasicas = Pick<Preferencias, (typeof PREFERENCIAS_BASICAS)[number]>;

export function extraerBasicas(p: Preferencias): PreferenciasBasicas {
  const salida: Partial<PreferenciasBasicas> = {};
  for (const k of PREFERENCIAS_BASICAS) (salida as Record<string, unknown>)[k] = p[k];
  return salida as PreferenciasBasicas;
}

export function conservarBasicas(nuevas: Preferencias, basicas: Partial<PreferenciasBasicas>): Preferencias {
  const salida = { ...nuevas } as Record<string, unknown>;
  for (const k of PREFERENCIAS_BASICAS) if (basicas[k] !== undefined) salida[k] = basicas[k];
  return salida as Preferencias;
}
