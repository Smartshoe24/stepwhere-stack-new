ALTER TABLE "devices" ADD COLUMN "firmware_version" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "firmware_status" jsonb;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "firmware_reported_at" timestamp with time zone;