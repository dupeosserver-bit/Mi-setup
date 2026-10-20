CREATE TABLE "finance_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_split_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"split_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"due_on" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "finance_split_members" (
	"split_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "finance_split_members_split_id_person_id_pk" PRIMARY KEY("split_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "finance_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"cycle" text DEFAULT 'mensual' NOT NULL,
	"next_due" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_movements" ADD COLUMN "tax" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "personal_movements" ADD COLUMN "receipt" text;--> statement-breakpoint
ALTER TABLE "finance_people" ADD CONSTRAINT "finance_people_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_split_charges" ADD CONSTRAINT "finance_split_charges_split_id_finance_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."finance_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_split_charges" ADD CONSTRAINT "finance_split_charges_person_id_finance_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."finance_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_split_members" ADD CONSTRAINT "finance_split_members_split_id_finance_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."finance_splits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_split_members" ADD CONSTRAINT "finance_split_members_person_id_finance_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."finance_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_splits" ADD CONSTRAINT "finance_splits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_people_nombre" ON "finance_people" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "finance_cargo_unico" ON "finance_split_charges" USING btree ("split_id","person_id","due_on");--> statement-breakpoint
CREATE INDEX "finance_cargos_persona" ON "finance_split_charges" USING btree ("person_id","due_on");--> statement-breakpoint
CREATE INDEX "finance_splits_usuario" ON "finance_splits" USING btree ("user_id");