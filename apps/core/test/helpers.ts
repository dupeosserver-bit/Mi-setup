import type { AuditEntry, AuditWriter } from "../src/audit/audit.js";
import { loadConfig } from "../src/config.js";

/** Registro de auditoría en memoria para pruebas. */
export function memoryAudit(): AuditWriter & { entries: AuditEntry[] } {
  const entries: AuditEntry[] = [];
  return {
    entries,
    async record(entry) {
      entries.push(entry);
    },
  };
}

export const testConfig = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "error" });
