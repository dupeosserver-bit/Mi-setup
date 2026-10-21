/**
 * Modelo de permisos (RBAC por módulo).
 *
 * - La cuenta "maestra" tiene acceso total a todos los módulos.
 * - Las cuentas "usuario" solo tienen el nivel asignado explícitamente por
 *   módulo; si no hay asignación, el nivel es "ninguno" (denegar por defecto).
 * - Los módulos marcados como masterOnly nunca se conceden a otras cuentas,
 *   aunque exista una asignación guardada.
 */
import { moduloEnEdicion } from "./edicion.js";
import { isModuleId, MODULES, type ModuleId } from "./modules.js";

export const ROLES = ["maestra", "usuario"] as const;
export type Role = (typeof ROLES)[number];

/** Niveles ordenados de menor a mayor. Cada nivel incluye a los anteriores. */
export const PERMISSION_LEVELS = ["ninguno", "lectura", "escritura", "administrar"] as const;
export type PermissionLevel = (typeof PERMISSION_LEVELS)[number];

export type PermissionMap = Partial<Record<ModuleId, PermissionLevel>>;

export interface PermissionSubject {
  readonly role: Role;
  readonly isActive: boolean;
  readonly permissions: PermissionMap;
}

export function levelRank(level: PermissionLevel): number {
  return PERMISSION_LEVELS.indexOf(level);
}

/** Nivel efectivo de un sujeto sobre un módulo. */
export function effectiveLevel(subject: PermissionSubject, module: ModuleId): PermissionLevel {
  if (!subject.isActive) return "ninguno";
  // En la edición pública esos apartados no existen, ni para la maestra.
  if (!moduloEnEdicion(module)) return "ninguno";
  if (subject.role === "maestra") return "administrar";
  if (MODULES[module].masterOnly) return "ninguno";
  return subject.permissions[module] ?? "ninguno";
}

/** ¿El sujeto tiene al menos el nivel pedido sobre el módulo? */
export function can(subject: PermissionSubject, module: ModuleId, required: PermissionLevel): boolean {
  if (required === "ninguno") return true;
  return levelRank(effectiveLevel(subject, module)) >= levelRank(required);
}

/**
 * Limpia una asignación de permisos antes de guardarla: quita módulos
 * desconocidos o masterOnly y niveles "ninguno" (equivalen a no tener fila).
 */
export function sanitizePermissionMap(map: PermissionMap): PermissionMap {
  const result: PermissionMap = {};
  for (const [module, level] of Object.entries(map)) {
    if (!isModuleId(module) || MODULES[module].masterOnly || !moduloEnEdicion(module)) continue;
    if (level === undefined || level === "ninguno") continue;
    result[module] = level;
  }
  return result;
}
