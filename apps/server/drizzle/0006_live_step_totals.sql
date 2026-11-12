-- Live step totals for the Activity screen.
--
-- `steps_today` is a running counter maintained on every telemetry ingest so the
-- Activity metrics can update in realtime without re-aggregating minute buckets.
-- It is stored next to the local date and timezone it was accumulated in, because
-- the day has to roll over at the child's local midnight rather than the server's.
--
-- `device_timezone` is the IANA zone derived from the device's last known
-- coordinate; it is the source of that local date.
--
-- No backfill: both are populated by the next ingest per child. Reads reconcile
-- against the authoritative minute/hourly aggregates, so a zero here degrades to
-- the aggregate value rather than displaying zero steps.
ALTER TABLE "child_status_snapshots"
  ADD COLUMN "steps_today" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "child_status_snapshots"
  ADD COLUMN "steps_today_date" date;--> statement-breakpoint
ALTER TABLE "child_status_snapshots"
  ADD COLUMN "steps_today_timezone" text;--> statement-breakpoint
ALTER TABLE "child_status_snapshots"
  ADD COLUMN "device_timezone" text;--> statement-breakpoint

-- Supports the per-child, per-local-date read in the activity service.
CREATE INDEX IF NOT EXISTS "child_status_snapshots_steps_today_date_idx"
  ON "child_status_snapshots" ("steps_today_date");
