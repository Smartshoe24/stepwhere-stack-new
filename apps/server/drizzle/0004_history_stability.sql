DROP INDEX IF EXISTS "history_events_stable_source_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "history_events_stable_source_unique"
  ON "history_events" USING btree ("child_id", "kind", "first_location_event_id")
  WHERE "first_location_event_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "history_events"
  DROP CONSTRAINT IF EXISTS "history_events_kind_fields_check";--> statement-breakpoint
ALTER TABLE "history_events"
  ADD CONSTRAINT "history_events_kind_fields_check" CHECK (
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
  );
