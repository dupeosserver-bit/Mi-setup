CREATE TABLE "ai_debt_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'debo' NOT NULL,
	"counterpart" text DEFAULT '' NOT NULL,
	"amount" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'abierto' NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"chance" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_debt_messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_debt_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"case_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"ready" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_project_chunks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ai_project_chunks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"file_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"search" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_memories" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_projects" ADD COLUMN "shared_memory" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_debt_cases" ADD CONSTRAINT "ai_debt_cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_debt_messages" ADD CONSTRAINT "ai_debt_messages_case_id_ai_debt_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."ai_debt_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_project_chunks" ADD CONSTRAINT "ai_project_chunks_file_id_ai_project_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."ai_project_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_project_chunks" ADD CONSTRAINT "ai_project_chunks_project_id_ai_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."ai_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_project_files" ADD CONSTRAINT "ai_project_files_project_id_ai_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."ai_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_project_files" ADD CONSTRAINT "ai_project_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_debt_cases_usuario" ON "ai_debt_cases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_debt_messages_caso" ON "ai_debt_messages" USING btree ("case_id","id");--> statement-breakpoint
CREATE INDEX "ai_project_chunks_proyecto" ON "ai_project_chunks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ai_project_files_proyecto" ON "ai_project_files" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "ai_memories" ADD CONSTRAINT "ai_memories_project_id_ai_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."ai_projects"("id") ON DELETE cascade ON UPDATE no action;