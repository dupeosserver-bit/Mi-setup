CREATE TABLE "site_community" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"parent_id" uuid,
	"author" text DEFAULT '' NOT NULL,
	"official" boolean DEFAULT false NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"link" text,
	"file_name" text,
	"stored_name" text,
	"file_size" integer,
	"scan" text DEFAULT 'sin_archivo' NOT NULL,
	"scan_detail" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pendiente' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_community" ADD CONSTRAINT "site_community_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_community_sitio" ON "site_community" USING btree ("site_id","kind","status");