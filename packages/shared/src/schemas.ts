/** Esquemas Zod compartidos entre core y ui. */
import { z } from "zod";
import { MODULE_IDS, type ModuleId } from "./modules.js";
import { PERMISSION_LEVELS, ROLES } from "./permissions.js";

export const moduleIdSchema = z.enum(MODULE_IDS as [ModuleId, ...ModuleId[]]);
export const roleSchema = z.enum(ROLES);
export const permissionLevelSchema = z.enum(PERMISSION_LEVELS);

export const permissionMapSchema = z.record(moduleIdSchema, permissionLevelSchema);

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Quién realizó una acción registrada en auditoría. */
export const AUDIT_ACTOR_TYPES = ["usuario", "ia", "sistema"] as const;
export const auditActorTypeSchema = z.enum(AUDIT_ACTOR_TYPES);
export type AuditActorType = z.infer<typeof auditActorTypeSchema>;

export const AUDIT_OUTCOMES = ["ok", "denegado", "error", "propuesto", "aprobado", "rechazado"] as const;
export const auditOutcomeSchema = z.enum(AUDIT_OUTCOMES);
export type AuditOutcome = z.infer<typeof auditOutcomeSchema>;
