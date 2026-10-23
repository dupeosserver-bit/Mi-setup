ALTER TYPE "public"."tipo_dispositivo" ADD VALUE 'tablet';--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "fingerprint" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "reinstalls" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "device_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_huella" ON "devices" USING btree ("user_id","fingerprint") WHERE "devices"."fingerprint" is not null;