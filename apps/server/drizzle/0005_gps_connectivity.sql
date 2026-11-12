ALTER TABLE "location_events"
  ADD COLUMN "gps_connected" boolean;--> statement-breakpoint
UPDATE "location_events"
  SET "gps_connected" = NOT ("latitude" = 0 AND "longitude" = 0);--> statement-breakpoint
ALTER TABLE "location_events"
  ALTER COLUMN "gps_connected" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "location_events"
  ALTER COLUMN "gps_connected" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "child_status_snapshots"
  ADD COLUMN "last_gps_connected" boolean;--> statement-breakpoint
ALTER TABLE "child_status_snapshots"
  ADD COLUMN "last_gps_fix_at" timestamp with time zone;--> statement-breakpoint
WITH latest AS (
  SELECT DISTINCT ON (event."child_id")
    event."child_id",
    event."gps_connected"
  FROM "location_events" AS event
  ORDER BY event."child_id", event."occurred_at" DESC, event."id" DESC
), valid AS (
  SELECT DISTINCT ON (event."child_id")
    event."child_id",
    event."id",
    event."latitude",
    event."longitude",
    event."location_label",
    event."occurred_at"
  FROM "location_events" AS event
  WHERE event."gps_connected" = true
  ORDER BY event."child_id", event."occurred_at" DESC, event."id" DESC
)
UPDATE "child_status_snapshots" AS snapshot
  SET
    "last_gps_connected" = latest."gps_connected",
    "last_gps_fix_at" = valid."occurred_at",
    "last_location_event_id" = COALESCE(valid."id", snapshot."last_location_event_id"),
    "last_latitude" = COALESCE(valid."latitude", snapshot."last_latitude"),
    "last_longitude" = COALESCE(valid."longitude", snapshot."last_longitude"),
    "last_location_label" = COALESCE(valid."location_label", snapshot."last_location_label")
  FROM latest
  LEFT JOIN valid ON valid."child_id" = latest."child_id"
  WHERE snapshot."child_id" = latest."child_id";
