CREATE TYPE "public"."qa_test_run_status" AS ENUM('running', 'passed', 'failed', 'aborted');--> statement-breakpoint
ALTER TYPE "public"."qa_unit_event_kind" ADD VALUE 'test_run';--> statement-breakpoint
CREATE TABLE "qa_test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid,
	"station_id" uuid,
	"chip_uid" text NOT NULL,
	"firmware_version" text NOT NULL,
	"run_number" integer NOT NULL,
	"status" "qa_test_run_status" DEFAULT 'running' NOT NULL,
	"results" jsonb NOT NULL,
	"passed" smallint DEFAULT 0 NOT NULL,
	"failed" smallint DEFAULT 0 NOT NULL,
	"skipped" smallint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "qa_test_runs" ADD CONSTRAINT "qa_test_runs_unit_id_qa_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."qa_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_test_runs" ADD CONSTRAINT "qa_test_runs_station_id_qa_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."qa_stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qa_test_runs_unit_started_idx" ON "qa_test_runs" USING btree ("unit_id","started_at");--> statement-breakpoint
CREATE INDEX "qa_test_runs_station_started_idx" ON "qa_test_runs" USING btree ("station_id","started_at");