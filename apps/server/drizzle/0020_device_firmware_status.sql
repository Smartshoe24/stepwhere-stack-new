ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "firmware_version" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "firmware_status" jsonb;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "firmware_reported_at" timestamp with time zone;