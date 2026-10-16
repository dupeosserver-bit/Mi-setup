-- El registro de auditoría es inmutable: se rechaza cualquier UPDATE, DELETE o TRUNCATE.
CREATE OR REPLACE FUNCTION auditoria_inmutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El registro de auditoría es inmutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_log_sin_cambios
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION auditoria_inmutable();
--> statement-breakpoint
CREATE TRIGGER audit_log_sin_truncate
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_inmutable();
