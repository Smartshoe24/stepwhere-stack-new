CREATE TYPE "public"."location_source" AS ENUM('gps', 'cell', 'none');--> statement-breakpoint
CREATE TYPE "public"."cell_lookup_mode" AS ENUM('normal', 'fast');--> statement-breakpoint
ALTER TABLE "location_events" ADD COLUMN "location_source" "location_source" DEFAULT 'gps' NOT NULL;--> statement-breakpoint
UPDATE "location_events"
SET "location_source" = CASE WHEN "gps_connected" THEN 'gps'::"location_source" ELSE 'none'::"location_source" END;--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "last_location_source" "location_source";--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "last_location_accuracy_meters" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "last_location_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "gps_outage_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "cell_lookup_mode" "cell_lookup_mode" DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "next_cell_lookup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "cell_lookup_lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "cell_outage_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "cell_stable_sample_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "last_cell_latitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "last_cell_longitude" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "last_cell_accuracy_meters" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "last_cell_estimate_at" timestamp with time zone;--> statement-breakpoint
UPDATE "child_status_snapshots"
SET
  "last_location_source" = CASE WHEN "last_location_event_id" IS NULL THEN NULL ELSE 'gps'::"location_source" END,
  "last_location_at" = "last_gps_fix_at";--> statement-breakpoint
UPDATE "child_status_snapshots" AS snapshot
SET "last_location_accuracy_meters" = event."accuracy_meters"
FROM "location_events" AS event
WHERE event."id" = snapshot."last_location_event_id";--> statement-breakpoint
CREATE TABLE "cell_location_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_event_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"lookup_mode" "cell_lookup_mode" NOT NULL,
	"tower_observation" jsonb NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"accuracy_meters" numeric(10, 2) NOT NULL,
	"distance_from_previous_meters" numeric(10, 2),
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "cell_location_estimates" ADD CONSTRAINT "cell_location_estimates_location_event_id_location_events_id_fk" FOREIGN KEY ("location_event_id") REFERENCES "public"."location_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_location_estimates" ADD CONSTRAINT "cell_location_estimates_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_location_estimates" ADD CONSTRAINT "cell_location_estimates_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cell_location_estimates_location_event_unique" ON "cell_location_estimates" USING btree ("location_event_id");--> statement-breakpoint
CREATE INDEX "cell_location_estimates_child_observed_at_idx" ON "cell_location_estimates" USING btree ("child_id", "observed_at");--> statement-breakpoint
CREATE INDEX "cell_location_estimates_device_observed_at_idx" ON "cell_location_estimates" USING btree ("device_id", "observed_at");
