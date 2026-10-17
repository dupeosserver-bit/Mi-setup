CREATE TABLE "mail_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alias_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"from_addr" text NOT NULL,
	"to_addr" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"text_body" text DEFAULT '' NOT NULL,
	"html_body" text,
	"size" integer DEFAULT 0 NOT NULL,
	"saved" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vpn_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"public_key" text NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_aliases" ADD CONSTRAINT "mail_aliases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_alias_id_mail_aliases_id_fk" FOREIGN KEY ("alias_id") REFERENCES "public"."mail_aliases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vpn_devices" ADD CONSTRAINT "vpn_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mail_aliases_alias" ON "mail_aliases" USING btree ("alias");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_messages_unico" ON "mail_messages" USING btree ("alias_id","message_id");--> statement-breakpoint
CREATE INDEX "mail_messages_fecha" ON "mail_messages" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vpn_devices_nombre" ON "vpn_devices" USING btree ("name");