CREATE INDEX "location_events_device_ingested_at_idx" ON "location_events" USING btree ("device_id", "ingested_at");
