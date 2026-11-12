CREATE TABLE "qa_station_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"label" text,
	"port_key" text NOT NULL,
	"probe_serial" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "qa_bench_jobs_station_active_unique";--> statement-breakpoint
ALTER TABLE "qa_bench_jobs" ADD COLUMN "slot_id" uuid;--> statement-breakpoint
ALTER TABLE "qa_test_runs" ADD COLUMN "serial_path" text;--> statement-breakpoint
ALTER TABLE "qa_test_runs" ADD COLUMN "slot_id" uuid;--> statement-breakpoint
ALTER TABLE "qa_station_slots" ADD CONSTRAINT "qa_station_slots_station_id_qa_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."qa_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qa_station_slots_position_unique" ON "qa_station_slots" USING btree ("station_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "qa_station_slots_port_unique" ON "qa_station_slots" USING btree ("station_id","port_key");--> statement-breakpoint
ALTER TABLE "qa_bench_jobs" ADD CONSTRAINT "qa_bench_jobs_slot_id_qa_station_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."qa_station_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_test_runs" ADD CONSTRAINT "qa_test_runs_slot_id_qa_station_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."qa_station_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qa_bench_jobs_probe_active_unique" ON "qa_bench_jobs" USING btree ("station_id",coalesce("probe_serial", '')) WHERE "qa_bench_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "qa_test_runs_station_port_started_idx" ON "qa_test_runs" USING btree ("station_id","serial_path","started_at");