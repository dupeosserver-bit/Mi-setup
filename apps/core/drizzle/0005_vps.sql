CREATE TABLE "discord_bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"server_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"port" integer,
	"status" text DEFAULT 'desconocido' NOT NULL,
	"latency_ms" integer,
	"last_check_at" timestamp with time zone,
	"last_change_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"command" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"server_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vps_servers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 22 NOT NULL,
	"username" text NOT NULL,
	"auth_type" text NOT NULL,
	"secret_enc" text NOT NULL,
	"passphrase_enc" text,
	"host_key_fingerprint" text,
	"alerts" boolean DEFAULT true NOT NULL,
	"ram_threshold" integer,
	"disk_threshold" integer,
	"status" text DEFAULT 'desconocido' NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_resource_alert_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discord_bots" ADD CONSTRAINT "discord_bots_server_id_vps_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."vps_servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_commands" ADD CONSTRAINT "saved_commands_server_id_vps_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."vps_servers"("id") ON DELETE set null ON UPDATE no action;