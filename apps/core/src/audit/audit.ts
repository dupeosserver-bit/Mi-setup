/**
 * Escritura del registro de auditoría. Solo se insertan filas; la base de datos
 * impide modificarlas o borrarlas. Los detalles se redactan antes de guardar.
 */
import type { AuditActorType, AuditOutcome, ModuleId } from "@mi-setup/shared";
import type { Database } from "../db/client.js";
import { auditLog } from "../db/schema.js";
import { redactSecrets } from "../security/redact.js";

export interface AuditEntry {
  actorType: AuditActorType;
  actorUserId?: string | null;
  action: string;
  module?: ModuleId | null;
  target?: string | null;
  outcome: AuditOutcome;
  ip?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
}

export interface AuditWriter {
  record(entry: AuditEntry): Promise<void>;
}

export function prepareAuditRow(entry: AuditEntry): typeof auditLog.$inferInsert {
  return {
    actorType: entry.actorType,
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    module: entry.module ?? null,
    target: entry.target ?? null,
    outcome: entry.outcome,
    ip: entry.ip ?? null,
    userAgent: entry.userAgent?.slice(0, 512) ?? null,
    details: redactSecrets(entry.details ?? {}) as Record<string, unknown>,
  };
}

export function createDbAuditWriter(db: Database): AuditWriter {
  return {
    async record(entry) {
      await db.insert(auditLog).values(prepareAuditRow(entry));
    },
  };
}
