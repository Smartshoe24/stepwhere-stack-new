CREATE TYPE "public"."qa_firmware_channel" AS ENUM('qa', 'production');--> statement-breakpoint
CREATE TYPE "public"."qa_unit_event_kind" AS ENUM('registered', 'identified', 'flashed', 'flash_failed', 'imei_linked', 'imei_conflict', 'stage_changed', 'note');--> statement-breakpoint
CREATE TYPE "public"."qa_unit_stage" AS ENUM('registered', 'qa_firmware', 'board_tests', 'production_firmware', 'functional_tests', 'assembled', 'final_test', 'ready_to_ship', 'shipped', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."qa_unit_stage_status" AS ENUM('pending', 'passed', 'failed', 'scrapped');--> statement-breakpoint
CREATE TABLE "qa_unit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"kind" "qa_unit_event_kind" NOT NULL,
	"stage" "qa_unit_stage",
	"stage_status" "qa_unit_stage_status",
	"message" text NOT NULL,
	"data" jsonb,
	"job_id" uuid,
	"station_id" uuid,
	"actor_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chip_uid" text NOT NULL,
	"imei" text,
	"device_id" uuid,
	"stage" "qa_unit_stage" DEFAULT 'registered' NOT NULL,
	"stage_status" "qa_unit_stage_status" DEFAULT 'pending' NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firmware_upload_id" uuid,
	"last_station_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qa_units_chip_uid_unique" UNIQUE("chip_uid"),
	CONSTRAINT "qa_units_imei_unique" UNIQUE("imei")
);
--> statement-breakpoint
ALTER TABLE "qa_bench_jobs" ADD COLUMN "unit_id" uuid;--> statement-breakpoint
ALTER TABLE "qa_firmware_uploads" ADD COLUMN "channel" "qa_firmware_channel" DEFAULT 'production' NOT NULL;--> statement-breakpoint
ALTER TABLE "qa_firmware_uploads" ADD COLUMN "version" text;--> statement-breakpoint
ALTER TABLE "qa_unit_events" ADD CONSTRAINT "qa_unit_events_unit_id_qa_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."qa_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_unit_events" ADD CONSTRAINT "qa_unit_events_job_id_qa_bench_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."qa_bench_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_unit_events" ADD CONSTRAINT "qa_unit_events_station_id_qa_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."qa_stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_unit_events" ADD CONSTRAINT "qa_unit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_units" ADD CONSTRAINT "qa_units_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_units" ADD CONSTRAINT "qa_units_firmware_upload_id_qa_firmware_uploads_id_fk" FOREIGN KEY ("firmware_upload_id") REFERENCES "public"."qa_firmware_uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_units" ADD CONSTRAINT "qa_units_last_station_id_qa_stations_id_fk" FOREIGN KEY ("last_station_id") REFERENCES "public"."qa_stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qa_unit_events_unit_created_idx" ON "qa_unit_events" USING btree ("unit_id","created_at");--> statement-breakpoint
CREATE INDEX "qa_unit_events_created_idx" ON "qa_unit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "qa_units_stage_idx" ON "qa_units" USING btree ("stage","stage_status");--> statement-breakpoint
CREATE INDEX "qa_units_updated_idx" ON "qa_units" USING btree ("updated_at");--> statement-breakpoint
ALTER TABLE "qa_bench_jobs" ADD CONSTRAINT "qa_bench_jobs_unit_id_qa_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."qa_units"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qa_bench_jobs_unit_created_idx" ON "qa_bench_jobs" USING btree ("unit_id","created_at");--> statement-breakpoint
-- Backfill: every chip already identified or flashed on a bench becomes a unit.
-- Uploads before channels were production builds, so a flashed chip is at production_firmware.
WITH seen AS (
	SELECT upper("result"->'target'->>'uid') AS uid, "kind", "firmware_upload_id", "station_id", coalesce("finished_at", "created_at") AS at
	FROM "qa_bench_jobs"
	WHERE "status" = 'succeeded' AND "result"->'target'->>'uid' ~* '^[0-9a-f]{24}$'
), latest AS (
	SELECT DISTINCT ON (uid) uid, "station_id", at FROM seen ORDER BY uid, at DESC
), latest_flash AS (
	SELECT DISTINCT ON (uid) uid, "firmware_upload_id", at FROM seen WHERE "kind" = 'flash' ORDER BY uid, at DESC
), first_seen AS (
	SELECT uid, min(at) AS at FROM seen GROUP BY uid
)
INSERT INTO "qa_units" ("chip_uid", "stage", "stage_status", "stage_changed_at", "firmware_upload_id", "last_station_id", "created_at", "updated_at")
SELECT
	l.uid,
	(CASE WHEN f.uid IS NULL THEN 'registered' ELSE 'production_firmware' END)::"qa_unit_stage",
	(CASE WHEN f.uid IS NULL THEN 'pending' ELSE 'passed' END)::"qa_unit_stage_status",
	coalesce(f.at, l.at),
	f."firmware_upload_id",
	l."station_id",
	s.at,
	l.at
FROM latest l
JOIN first_seen s USING (uid)
LEFT JOIN latest_flash f USING (uid)
ON CONFLICT ("chip_uid") DO NOTHING;--> statement-breakpoint
UPDATE "qa_bench_jobs" j SET "unit_id" = u."id"
FROM "qa_units" u
WHERE upper(j."result"->'target'->>'uid') = u."chip_uid";--> statement-breakpoint
INSERT INTO "qa_unit_events" ("unit_id", "kind", "stage", "stage_status", "message", "station_id", "created_at")
SELECT "id", 'registered', "stage", "stage_status", 'Registered from earlier bench jobs.', "last_station_id", "created_at"
FROM "qa_units";
