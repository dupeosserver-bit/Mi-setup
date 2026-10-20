CREATE TABLE "note_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"token_cifrado" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_shares" ADD CONSTRAINT "note_shares_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_shares" ADD CONSTRAINT "note_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "note_shares_token" ON "note_shares" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "note_shares_nota" ON "note_shares" USING btree ("note_id");