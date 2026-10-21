/**
 * Dos ediciones de Mi Setup que se eligen al compilar:
 * - "personal": todo.
 * - "publica": la de la comunidad, sin los apartados de abajo (ni su código
 *   ni sus pantallas: el build los quita y aquí se niegan por si acaso).
 */
import type { ModuleCategory, ModuleId } from "./modules.js";

export const EDICIONES = ["personal", "publica"] as const;
export type Edicion = (typeof EDICIONES)[number];

export const MODULOS_SOLO_PERSONAL = [
  "pterodactyl",
  "streams",
  "x",
  "discord",
  "bots_discord",
  "vps_bots",
  "streamer",
  "host_local",
  "casa",
  "control_remoto",
] as const satisfies readonly ModuleId[];

export const CATEGORIAS_SOLO_PERSONAL: readonly ModuleCategory[] = ["redes", "host_local", "casa", "control_remoto"];

let actual: Edicion = "personal";

/** La fija el arranque del servidor (variable EDICION) y la interfaz (VITE_EDICION). */
export function fijarEdicion(edicion: Edicion): void {
  actual = edicion;
}

export function edicionActual(): Edicion {
  return actual;
}

export function moduloEnEdicion(modulo: ModuleId, edicion: Edicion = actual): boolean {
  return edicion === "personal" || !(MODULOS_SOLO_PERSONAL as readonly ModuleId[]).includes(modulo);
}
