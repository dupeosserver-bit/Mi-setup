CREATE TYPE "public"."tipo_actor" AS ENUM('usuario', 'ia', 'sistema');--> statement-breakpoint
CREATE TYPE "public"."resultado_auditoria" AS ENUM('ok', 'denegado', 'error', 'propuesto', 'aprobado', 'rechazado');--> statement-breakpoint
CREATE TYPE "public"."nivel_permiso" AS ENUM('lectura', 'escritura', 'administrar');--> statement-breakpoint
CREATE TYPE "public"."rol_usuario" AS ENUM('maestra', 'usuario');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "tipo_actor" NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"module" text,
	"target" text,
	"outcome" "resultado_auditoria" NOT NULL,
	"ip" text,
	"user_agent" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_module_permissions" (
	"user_id" uuid NOT NULL,
	"module" text NOT NULL,
	"level" "nivel_permiso" NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_module_permissions_user_id_module_pk" PRIMARY KEY("user_id","module")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "rol_usuario" DEFAULT 'usuario' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"totp_secret_enc" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_module_permissions" ADD CONSTRAINT "user_module_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_module_permissions" ADD CONSTRAINT "user_module_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_fecha" ON "audit_log" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unico" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_una_maestra" ON "users" USING btree ("role") WHERE "users"."role" = 'maestra';