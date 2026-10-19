CREATE TABLE "bot_members" (
	"bot_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"messages" integer DEFAULT 0 NOT NULL,
	"coins" bigint DEFAULT 0 NOT NULL,
	"bank" bigint DEFAULT 0 NOT NULL,
	"daily_at" timestamp with time zone,
	"work_at" timestamp with time zone,
	"last_xp_at" timestamp with time zone,
	CONSTRAINT "bot_members_bot_id_guild_id_user_id_pk" PRIMARY KEY("bot_id","guild_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "bot_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'abierto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "bot_warns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" uuid NOT NULL,
	"guild_id" text NOT NULL,
	"user_id" text NOT NULL,
	"mod_id" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hosted_bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"client_name" text DEFAULT '' NOT NULL,
	"token_enc" text NOT NULL,
	"application_id" text,
	"bot_name" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"share_hash" text,
	"share_enabled" boolean DEFAULT false NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"stored_name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"brand" text DEFAULT 'otra' NOT NULL,
	"last4" text NOT NULL,
	"kind" text DEFAULT 'real' NOT NULL,
	"color" text DEFAULT '#6d28d9' NOT NULL,
	"bank" text DEFAULT '' NOT NULL,
	"test_number" text,
	"expiry" text,
	"cvv" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "personal_movements" ADD COLUMN "card_id" uuid;--> statement-breakpoint
ALTER TABLE "bot_members" ADD CONSTRAINT "bot_members_bot_id_hosted_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."hosted_bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_tickets" ADD CONSTRAINT "bot_tickets_bot_id_hosted_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."hosted_bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_warns" ADD CONSTRAINT "bot_warns_bot_id_hosted_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."hosted_bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_bots" ADD CONSTRAINT "hosted_bots_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_attachments" ADD CONSTRAINT "note_attachments_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_attachments" ADD CONSTRAINT "note_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_cards" ADD CONSTRAINT "personal_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_tickets_bot" ON "bot_tickets" USING btree ("bot_id","guild_id");--> statement-breakpoint
CREATE INDEX "bot_warns_miembro" ON "bot_warns" USING btree ("bot_id","guild_id","user_id");--> statement-breakpoint
CREATE INDEX "hosted_bots_dueno" ON "hosted_bots" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hosted_bots_enlace" ON "hosted_bots" USING btree ("share_hash");--> statement-breakpoint
CREATE INDEX "note_attachments_nota" ON "note_attachments" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "tarjetas_usuario" ON "personal_cards" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "personal_movements" ADD CONSTRAINT "personal_movements_card_id_personal_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."personal_cards"("id") ON DELETE set null ON UPDATE no action;