ALTER TABLE "finance_people" ADD COLUMN "share_token_hash" text;--> statement-breakpoint
ALTER TABLE "finance_people" ADD COLUMN "share_token_enc" text;--> statement-breakpoint
ALTER TABLE "finance_split_members" ADD COLUMN "percent" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "finance_splits" ADD COLUMN "split_mode" text DEFAULT 'monto' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_people_enlace" ON "finance_people" USING btree ("share_token_hash");