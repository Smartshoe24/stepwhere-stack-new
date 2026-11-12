CREATE TYPE "public"."account_deletion_scope" AS ENUM('user_only', 'family');--> statement-breakpoint
CREATE TYPE "public"."account_deletion_status" AS ENUM('pending', 'purging', 'cancelled', 'completed');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "is_play_review_account" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "account_deletion_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone_number" text NOT NULL,
	"code_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"request_ip_hash" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resend_available_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "account_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"organization_id" uuid,
	"admin_transferred_to_user_id" uuid,
	"scope" "account_deletion_scope" NOT NULL,
	"status" "account_deletion_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone NOT NULL,
	"undo_until" timestamp with time zone NOT NULL,
	"purge_by" timestamp with time zone NOT NULL,
	"next_attempt_at" timestamp with time zone NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "account_deletion_challenges" ADD CONSTRAINT "account_deletion_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_admin_transferred_to_user_id_users_id_fk" FOREIGN KEY ("admin_transferred_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_challenges_token_hash_unique" ON "account_deletion_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "account_deletion_challenges_user_id_idx" ON "account_deletion_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "account_deletion_challenges_request_ip_hash_idx" ON "account_deletion_challenges" USING btree ("request_ip_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_requests_active_user_unique" ON "account_deletion_requests" USING btree ("user_id") WHERE "account_deletion_requests"."user_id" IS NOT NULL AND "account_deletion_requests"."status" IN ('pending', 'purging');--> statement-breakpoint
CREATE INDEX "account_deletion_requests_status_next_attempt_idx" ON "account_deletion_requests" USING btree ("status", "next_attempt_at");--> statement-breakpoint
CREATE INDEX "account_deletion_requests_organization_id_idx" ON "account_deletion_requests" USING btree ("organization_id");
