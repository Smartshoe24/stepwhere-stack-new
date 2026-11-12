CREATE TYPE "public"."history_event_kind" AS ENUM('stay', 'trip', 'gap');--> statement-breakpoint
CREATE TYPE "public"."history_event_status" AS ENUM('ongoing', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."history_trip_mode" AS ENUM('walking', 'vehicle', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."history_mode_confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."history_gap_reason" AS ENUM('telemetry_gap', 'offline', 'moved_while_sleeping');--> statement-breakpoint
CREATE TYPE "public"."history_place_match_type" AS ENUM('saved', 'exact', 'near', 'address', 'pending', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."history_place_enrichment_status" AS ENUM('pending', 'completed', 'failed', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."history_enrichment_job_type" AS ENUM('place', 'roads');--> statement-breakpoint
CREATE TYPE "public"."history_enrichment_job_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'rejected');--> statement-breakpoint
CREATE TABLE "history_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"device_id" uuid,
	"kind" "history_event_kind" NOT NULL,
	"status" "history_event_status" DEFAULT 'finalized' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"first_location_event_id" uuid,
	"last_location_event_id" uuid,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"algorithm_version" integer NOT NULL,
	"representative_latitude" numeric(9, 6),
	"representative_longitude" numeric(9, 6),
	"stay_radius_meters" integer,
	"trip_mode" "history_trip_mode",
	"mode_confidence" "history_mode_confidence",
	"distance_meters" integer,
	"filtered_path" jsonb,
	"gap_reason" "history_gap_reason",
	"gap_before_latitude" numeric(9, 6),
	"gap_before_longitude" numeric(9, 6),
	"gap_after_latitude" numeric(9, 6),
	"gap_after_longitude" numeric(9, 6),
	"place_provider" text,
	"provider_place_id" text,
	"place_match_type" "history_place_match_type",
	"place_distance_meters" integer,
	"place_label" text,
	"formatted_address" text,
	"place_content_fetched_at" timestamp with time zone,
	"place_content_expires_at" timestamp with time zone,
	"place_enrichment_status" "history_place_enrichment_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "history_events_kind_fields_check" CHECK (
    (
      kind = 'stay'
      and representative_latitude is not null
      and representative_longitude is not null
      and stay_radius_meters is not null
      and trip_mode is null
      and mode_confidence is null
      and distance_meters is null
      and filtered_path is null
      and gap_reason is null
      and gap_before_latitude is null
      and gap_before_longitude is null
      and gap_after_latitude is null
      and gap_after_longitude is null
    )
    or (
      kind = 'trip'
      and trip_mode is not null
      and distance_meters is not null
      and filtered_path is not null
      and representative_latitude is null
      and representative_longitude is null
      and stay_radius_meters is null
      and gap_reason is null
      and gap_before_latitude is null
      and gap_before_longitude is null
      and gap_after_latitude is null
      and gap_after_longitude is null
      and place_provider is null
      and provider_place_id is null
      and place_match_type is null
      and place_label is null
    )
    or (
      kind = 'gap'
      and gap_reason is not null
      and representative_latitude is null
      and representative_longitude is null
      and trip_mode is null
      and mode_confidence is null
      and distance_meters is null
      and filtered_path is null
      and stay_radius_meters is null
      and place_provider is null
      and provider_place_id is null
      and place_match_type is null
      and place_label is null
    )
  )
);
--> statement-breakpoint
CREATE TABLE "history_processing_states" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"device_id" uuid,
	"processing_started_at" timestamp with time zone NOT NULL,
	"processed_location_event_id" uuid,
	"processed_through_at" timestamp with time zone,
	"dirty_through_location_event_id" uuid,
	"dirty_through_at" timestamp with time zone,
	"open_stay_id" uuid,
	"open_trip_id" uuid,
	"candidate_state" jsonb,
	"current_session_state" jsonb,
	"current_sleep_offline_state" jsonb,
	"algorithm_version" integer NOT NULL,
	"is_processing" boolean DEFAULT false NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history_enrichment_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"history_event_id" uuid NOT NULL,
	"type" "history_enrichment_job_type" NOT NULL,
	"status" "history_enrichment_job_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"lease_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "history_route_geometry_cache" (
	"history_event_id" uuid PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'google_roads' NOT NULL,
	"geometry" jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "history_events" ADD CONSTRAINT "history_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_events" ADD CONSTRAINT "history_events_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_events" ADD CONSTRAINT "history_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_events" ADD CONSTRAINT "history_events_first_location_event_id_location_events_id_fk" FOREIGN KEY ("first_location_event_id") REFERENCES "public"."location_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_events" ADD CONSTRAINT "history_events_last_location_event_id_location_events_id_fk" FOREIGN KEY ("last_location_event_id") REFERENCES "public"."location_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_processing_states" ADD CONSTRAINT "history_processing_states_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_processing_states" ADD CONSTRAINT "history_processing_states_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_processing_states" ADD CONSTRAINT "history_processing_states_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_processing_states" ADD CONSTRAINT "history_processing_states_processed_location_event_id_location_events_id_fk" FOREIGN KEY ("processed_location_event_id") REFERENCES "public"."location_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_processing_states" ADD CONSTRAINT "history_processing_states_dirty_through_location_event_id_location_events_id_fk" FOREIGN KEY ("dirty_through_location_event_id") REFERENCES "public"."location_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_enrichment_jobs" ADD CONSTRAINT "history_enrichment_jobs_history_event_id_history_events_id_fk" FOREIGN KEY ("history_event_id") REFERENCES "public"."history_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_route_geometry_cache" ADD CONSTRAINT "history_route_geometry_cache_history_event_id_history_events_id_fk" FOREIGN KEY ("history_event_id") REFERENCES "public"."history_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_events_child_started_at_idx" ON "history_events" USING btree ("child_id","started_at");--> statement-breakpoint
CREATE INDEX "history_events_child_ended_at_idx" ON "history_events" USING btree ("child_id","ended_at");--> statement-breakpoint
CREATE INDEX "history_events_child_status_idx" ON "history_events" USING btree ("child_id","status");--> statement-breakpoint
CREATE INDEX "history_events_org_child_started_at_idx" ON "history_events" USING btree ("organization_id","child_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "history_events_stable_source_unique" ON "history_events" USING btree ("child_id","kind","first_location_event_id") WHERE "first_location_event_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "history_enrichment_jobs_event_type_unique" ON "history_enrichment_jobs" USING btree ("history_event_id","type");--> statement-breakpoint
CREATE INDEX "history_enrichment_jobs_status_next_attempt_idx" ON "history_enrichment_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "history_route_geometry_cache_expires_at_idx" ON "history_route_geometry_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "location_events_child_occurred_at_id_idx" ON "location_events" USING btree ("child_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "geofence_events_child_occurred_at_idx" ON "geofence_events" USING btree ("child_id","occurred_at");
