ALTER TABLE "qa_stations" ADD COLUMN "automation_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "qa_units" ADD COLUMN "functional_checks" jsonb;
