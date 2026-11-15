CREATE TABLE "qa_unit_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"firmware" text,
	"stage" "qa_unit_stage" NOT NULL,
	"gps_fix" boolean DEFAULT false NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"satellite_count" integer,
	"cell" text,
	"tower_count" integer DEFAULT 0 NOT NULL,
	"wifi_count" integer DEFAULT 0 NOT NULL,
	"battery_voltage_mv" integer,
	"step_counter" integer,
	"network_lookup" boolean DEFAULT false NOT NULL,
	"network_latitude" numeric(9, 6),
	"network_longitude" numeric(9, 6),
	"network_accuracy_meters" numeric(10, 2),
	"network_error" text,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qa_units" ADD COLUMN "network_lookups" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "qa_units" ADD COLUMN "last_network_lookup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "qa_units" ADD COLUMN "network_located_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "qa_unit_reports" ADD CONSTRAINT "qa_unit_reports_unit_id_qa_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."qa_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qa_unit_reports_unit_idx" ON "qa_unit_reports" USING btree ("unit_id","received_at");