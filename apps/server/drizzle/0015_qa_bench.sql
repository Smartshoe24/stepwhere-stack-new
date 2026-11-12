CREATE TYPE "public"."qa_bench_job_kind" AS ENUM('identify', 'flash');--> statement-breakpoint
CREATE TYPE "public"."qa_bench_job_status" AS ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."qa_connect_mode" AS ENUM('normal', 'underReset', 'hotPlug');--> statement-breakpoint
CREATE TYPE "public"."qa_firmware_format" AS ENUM('bin', 'hex');--> statement-breakpoint
CREATE TABLE "qa_bench_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"kind" "qa_bench_job_kind" NOT NULL,
	"status" "qa_bench_job_status" DEFAULT 'queued' NOT NULL,
	"probe_serial" text,
	"connect_mode" "qa_connect_mode" DEFAULT 'normal' NOT NULL,
	"firmware_upload_id" uuid,
	"address" text,
	"phase" text,
	"percent" smallint,
	"result" jsonb,
	"log" text DEFAULT '' NOT NULL,
	"log_truncated" boolean DEFAULT false NOT NULL,
	"requested_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "qa_firmware_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"format" "qa_firmware_format" NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"content" "bytea" NOT NULL,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qa_stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_hash" text,
	"pairing_code_hash" text,
	"pairing_expires_at" timestamp with time zone,
	"paired_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"agent_info" jsonb,
	"created_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "qa_stations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "qa_stations_pairing_code_hash_unique" UNIQUE("pairing_code_hash")
);
--> statement-breakpoint
ALTER TABLE "qa_bench_jobs" ADD CONSTRAINT "qa_bench_jobs_station_id_qa_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."qa_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_bench_jobs" ADD CONSTRAINT "qa_bench_jobs_firmware_upload_id_qa_firmware_uploads_id_fk" FOREIGN KEY ("firmware_upload_id") REFERENCES "public"."qa_firmware_uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_bench_jobs" ADD CONSTRAINT "qa_bench_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_firmware_uploads" ADD CONSTRAINT "qa_firmware_uploads_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qa_stations" ADD CONSTRAINT "qa_stations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "qa_bench_jobs_station_created_idx" ON "qa_bench_jobs" USING btree ("station_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "qa_bench_jobs_station_active_unique" ON "qa_bench_jobs" USING btree ("station_id") WHERE "qa_bench_jobs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "qa_firmware_uploads_created_idx" ON "qa_firmware_uploads" USING btree ("created_at");