ALTER TABLE "child_status_snapshots" ADD COLUMN "network_lookup_cells" text[];--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "network_lookup_wifi" text[];--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD COLUMN "last_network_lookup_at" timestamp with time zone;