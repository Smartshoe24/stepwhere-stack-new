CREATE TYPE "public"."phone_auth_challenge_intent" AS ENUM('signin', 'signup');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."child_geofence_status" AS ENUM('enabled', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."child_lifecycle_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."child_tracking_status" AS ENUM('safe', 'transit', 'alert', 'offline');--> statement-breakpoint
CREATE TYPE "public"."content_status" AS ENUM('draft', 'active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('android', 'ios', 'embedded', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('fresh', 'active', 'inactive', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."device_telemetry_state" AS ENUM('active', 'sleep', 'offline');--> statement-breakpoint
CREATE TYPE "public"."geofence_containment_state" AS ENUM('unknown', 'inside', 'outside');--> statement-breakpoint
CREATE TYPE "public"."geofence_event_type" AS ENUM('breached', 'reentered', 'reset');--> statement-breakpoint
CREATE TYPE "public"."notification_priority" AS ENUM('general', 'child_safety');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('geofence_breached', 'geofence_reentered');--> statement-breakpoint
CREATE TYPE "public"."place_kind" AS ENUM('school');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."push_delivery_status" AS ENUM('pending', 'ticketed', 'delivered', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."push_installation_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TYPE "public"."push_installation_status" AS ENUM('active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."share_status" AS ENUM('active', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."subscription_source" AS ENUM('admin', 'purchase', 'promo');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."organization_invitation_status" AS ENUM('pending', 'accepted', 'rejected', 'canceled');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_number" text NOT NULL,
	"intent" "phone_auth_challenge_intent" NOT NULL,
	"normalized_email" text,
	"token_hash" text NOT NULL,
	"request_ip_hash" text NOT NULL,
	"send_count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resend_available_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"active_organization_id" text,
	"impersonated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signin_recovery_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone_number" text NOT NULL,
	"email" text NOT NULL,
	"code_hash" text NOT NULL,
	"token_hash" text NOT NULL,
	"request_ip_hash" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"resend_available_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"phone_number" text NOT NULL,
	"phone_number_verified" boolean DEFAULT false NOT NULL,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"current_address" text,
	"date_of_birth" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_location_label_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rounded_latitude" numeric(9, 4) NOT NULL,
	"rounded_longitude" numeric(9, 4) NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"display_label" text NOT NULL,
	"formatted_address" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_geofence_event_acknowledgments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geofence_event_id" uuid NOT NULL,
	"acknowledged_by_user_id" uuid NOT NULL,
	"acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_activity_minute_buckets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"minute_start" timestamp with time zone NOT NULL,
	"event_date" date NOT NULL,
	"total_steps" integer DEFAULT 0 NOT NULL,
	"active_steps" integer DEFAULT 0 NOT NULL,
	"active_seconds" integer DEFAULT 0 NOT NULL,
	"sample_count" integer DEFAULT 0 NOT NULL,
	"representative_latitude" numeric(9, 6),
	"representative_longitude" numeric(9, 6),
	"source_location_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_device_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"bound_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unbound_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_geofences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "child_geofence_status" DEFAULT 'enabled' NOT NULL,
	"containment_state" "geofence_containment_state" DEFAULT 'unknown' NOT NULL,
	"candidate_state" "geofence_containment_state" DEFAULT 'unknown' NOT NULL,
	"candidate_sample_count" integer DEFAULT 0 NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"last_distance_meters" numeric(10, 2),
	"last_evaluated_at" timestamp with time zone,
	"breached_at" timestamp with time zone,
	"last_reentered_at" timestamp with time zone,
	"center_latitude" numeric(9, 6),
	"center_longitude" numeric(9, 6),
	"radius_meters" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_plan_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"source" "subscription_source" DEFAULT 'admin' NOT NULL,
	"external_order_id" text,
	"external_purchase_id" text,
	"status" "subscription_status" DEFAULT 'active' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" "share_status" DEFAULT 'active' NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_status_snapshots" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"last_location_event_id" uuid,
	"last_latitude" numeric(9, 6),
	"last_longitude" numeric(9, 6),
	"last_location_label" text,
	"last_battery_percent" integer,
	"last_battery_voltage_mv" integer,
	"last_signal_strength" smallint,
	"last_satellite_count" smallint,
	"last_raw_step_counter" integer,
	"last_step_delta" integer DEFAULT 0 NOT NULL,
	"steps_this_hour" integer DEFAULT 0 NOT NULL,
	"current_hour_bucket_start" timestamp with time zone,
	"last_device_state" "device_telemetry_state" DEFAULT 'active' NOT NULL,
	"status" "child_tracking_status" DEFAULT 'offline' NOT NULL,
	"status_label" text,
	"last_seen_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_step_counts_hourly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"step_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "child_trail_geometry_cache" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"latest_location_event_id" uuid,
	"distance_meters" integer NOT NULL,
	"geometry_source" text NOT NULL,
	"segments" jsonb NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"refresh_after" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_lease_until" timestamp with time zone,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_user_id" uuid,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"avatar_url" text,
	"school_name" text,
	"school_place_id" uuid,
	"gender" text,
	"date_of_birth" date,
	"creation_idempotency_key" uuid,
	"status" "child_lifecycle_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hardware_identifier" text NOT NULL,
	"display_name" text,
	"platform" "device_platform" DEFAULT 'unknown' NOT NULL,
	"status" "device_status" DEFAULT 'fresh' NOT NULL,
	"auth_token_hash" text,
	"reserved_by_user_id" uuid,
	"reserved_by_organization_id" uuid,
	"reservation_token_hash" text,
	"reserved_until" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"phone_number" text,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geofence_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"geofence_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_event_id" uuid,
	"event_type" "geofence_event_type" NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"distance_meters" numeric(10, 2),
	"radius_meters" integer,
	"dedup_key" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"location_label" text,
	"accuracy_meters" numeric(8, 2),
	"battery_percent" integer,
	"battery_voltage_mv" integer,
	"signal_strength" smallint,
	"satellite_count" smallint,
	"step_counter" integer DEFAULT 0 NOT NULL,
	"device_state" "device_telemetry_state" DEFAULT 'active' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"image_url" text,
	"target_role" text,
	"target_user_id" uuid,
	"status" "content_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "place_kind" DEFAULT 'school' NOT NULL,
	"provider" text DEFAULT 'google' NOT NULL,
	"provider_place_id" text NOT NULL,
	"label" text NOT NULL,
	"formatted_address" text,
	"latitude" numeric(9, 6) NOT NULL,
	"longitude" numeric(9, 6) NOT NULL,
	"raw" jsonb,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"duration_months" integer NOT NULL,
	"amount_minor" integer,
	"currency_code" text,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_delivery_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_notification_id" uuid NOT NULL,
	"push_installation_id" uuid NOT NULL,
	"status" "push_delivery_status" DEFAULT 'pending' NOT NULL,
	"expo_ticket_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"receipt_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid,
	"installation_id" text NOT NULL,
	"expo_push_token" text NOT NULL,
	"platform" "push_installation_platform" NOT NULL,
	"app_version" text,
	"status" "push_installation_status" DEFAULT 'active' NOT NULL,
	"last_registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_counts_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"event_date" date NOT NULL,
	"step_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"child_id" uuid,
	"geofence_event_id" uuid,
	"type" "notification_type" NOT NULL,
	"priority" "notification_priority" DEFAULT 'general' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "family_join_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"invited_phone_number" text NOT NULL,
	"token_hash" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"consumed_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"status" "organization_invitation_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone,
	"inviter_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signin_recovery_challenges" ADD CONSTRAINT "signin_recovery_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_geofence_event_acknowledgments" ADD CONSTRAINT "admin_geofence_event_acknowledgments_geofence_event_id_geofence_events_id_fk" FOREIGN KEY ("geofence_event_id") REFERENCES "public"."geofence_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_geofence_event_acknowledgments" ADD CONSTRAINT "admin_geofence_event_acknowledgments_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_activity_minute_buckets" ADD CONSTRAINT "child_activity_minute_buckets_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_activity_minute_buckets" ADD CONSTRAINT "child_activity_minute_buckets_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_activity_minute_buckets" ADD CONSTRAINT "child_activity_minute_buckets_source_location_event_id_location_events_id_fk" FOREIGN KEY ("source_location_event_id") REFERENCES "public"."location_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_device_bindings" ADD CONSTRAINT "child_device_bindings_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_device_bindings" ADD CONSTRAINT "child_device_bindings_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_geofences" ADD CONSTRAINT "child_geofences_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_geofences" ADD CONSTRAINT "child_geofences_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_plan_subscriptions" ADD CONSTRAINT "child_plan_subscriptions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_plan_subscriptions" ADD CONSTRAINT "child_plan_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_share_links" ADD CONSTRAINT "child_share_links_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_share_links" ADD CONSTRAINT "child_share_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD CONSTRAINT "child_status_snapshots_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_status_snapshots" ADD CONSTRAINT "child_status_snapshots_last_location_event_id_location_events_id_fk" FOREIGN KEY ("last_location_event_id") REFERENCES "public"."location_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_step_counts_hourly" ADD CONSTRAINT "child_step_counts_hourly_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_step_counts_hourly" ADD CONSTRAINT "child_step_counts_hourly_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_trail_geometry_cache" ADD CONSTRAINT "child_trail_geometry_cache_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "child_trail_geometry_cache" ADD CONSTRAINT "child_trail_geometry_cache_latest_location_event_id_location_events_id_fk" FOREIGN KEY ("latest_location_event_id") REFERENCES "public"."location_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_parent_user_id_users_id_fk" FOREIGN KEY ("parent_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_school_place_id_places_id_fk" FOREIGN KEY ("school_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_reserved_by_user_id_users_id_fk" FOREIGN KEY ("reserved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_reserved_by_organization_id_organization_id_fk" FOREIGN KEY ("reserved_by_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_geofence_id_child_geofences_id_fk" FOREIGN KEY ("geofence_id") REFERENCES "public"."child_geofences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geofence_events" ADD CONSTRAINT "geofence_events_location_event_id_location_events_id_fk" FOREIGN KEY ("location_event_id") REFERENCES "public"."location_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_events" ADD CONSTRAINT "location_events_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_events" ADD CONSTRAINT "location_events_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_delivery_jobs" ADD CONSTRAINT "push_delivery_jobs_user_notification_id_user_notifications_id_fk" FOREIGN KEY ("user_notification_id") REFERENCES "public"."user_notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_delivery_jobs" ADD CONSTRAINT "push_delivery_jobs_push_installation_id_push_installations_id_fk" FOREIGN KEY ("push_installation_id") REFERENCES "public"."push_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_installations" ADD CONSTRAINT "push_installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_installations" ADD CONSTRAINT "push_installations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_counts_daily" ADD CONSTRAINT "step_counts_daily_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_counts_daily" ADD CONSTRAINT "step_counts_daily_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_geofence_event_id_geofence_events_id_fk" FOREIGN KEY ("geofence_event_id") REFERENCES "public"."geofence_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_join_codes" ADD CONSTRAINT "family_join_codes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_join_codes" ADD CONSTRAINT "family_join_codes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_join_codes" ADD CONSTRAINT "family_join_codes_consumed_by_user_id_users_id_fk" FOREIGN KEY ("consumed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_users_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_unique" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "phone_auth_challenges_token_hash_unique" ON "phone_auth_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "phone_auth_challenges_phone_number_idx" ON "phone_auth_challenges" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "phone_auth_challenges_request_ip_hash_idx" ON "phone_auth_challenges" USING btree ("request_ip_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "signin_recovery_challenges_token_hash_unique" ON "signin_recovery_challenges" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "signin_recovery_challenges_user_id_idx" ON "signin_recovery_challenges" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "signin_recovery_challenges_phone_number_idx" ON "signin_recovery_challenges" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "signin_recovery_challenges_request_ip_hash_idx" ON "signin_recovery_challenges" USING btree ("request_ip_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_phone_number_unique" ON "users" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "activity_location_label_cache_expires_idx" ON "activity_location_label_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_location_label_cache_unique" ON "activity_location_label_cache" USING btree ("provider","rounded_latitude","rounded_longitude");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_geofence_ack_geofence_event_unique" ON "admin_geofence_event_acknowledgments" USING btree ("geofence_event_id");--> statement-breakpoint
CREATE INDEX "admin_geofence_ack_acknowledged_by_user_id_idx" ON "admin_geofence_event_acknowledgments" USING btree ("acknowledged_by_user_id");--> statement-breakpoint
CREATE INDEX "admin_geofence_ack_acknowledged_at_idx" ON "admin_geofence_event_acknowledgments" USING btree ("acknowledged_at");--> statement-breakpoint
CREATE INDEX "child_activity_minute_child_date_idx" ON "child_activity_minute_buckets" USING btree ("child_id","event_date");--> statement-breakpoint
CREATE INDEX "child_activity_minute_child_minute_idx" ON "child_activity_minute_buckets" USING btree ("child_id","minute_start");--> statement-breakpoint
CREATE UNIQUE INDEX "child_activity_minute_unique" ON "child_activity_minute_buckets" USING btree ("child_id","device_id","minute_start");--> statement-breakpoint
CREATE INDEX "child_device_bindings_child_id_idx" ON "child_device_bindings" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "child_device_bindings_device_id_idx" ON "child_device_bindings" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "child_device_bindings_active_child_unique" ON "child_device_bindings" USING btree ("child_id") WHERE "child_device_bindings"."unbound_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "child_device_bindings_active_device_unique" ON "child_device_bindings" USING btree ("device_id") WHERE "child_device_bindings"."unbound_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "child_geofences_child_id_unique" ON "child_geofences" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "child_geofences_organization_id_idx" ON "child_geofences" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "child_plan_subscriptions_child_id_idx" ON "child_plan_subscriptions" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "child_plan_subscriptions_plan_id_idx" ON "child_plan_subscriptions" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "child_plan_subscriptions_active_child_unique" ON "child_plan_subscriptions" USING btree ("child_id") WHERE "child_plan_subscriptions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "child_share_links_token_hash_unique" ON "child_share_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "child_share_links_child_id_idx" ON "child_share_links" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "child_share_links_expires_at_idx" ON "child_share_links" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "child_step_counts_hourly_child_id_idx" ON "child_step_counts_hourly" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "child_step_counts_hourly_device_id_idx" ON "child_step_counts_hourly" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "child_step_counts_hourly_bucket_start_idx" ON "child_step_counts_hourly" USING btree ("bucket_start");--> statement-breakpoint
CREATE UNIQUE INDEX "child_step_counts_hourly_child_device_hour_unique" ON "child_step_counts_hourly" USING btree ("child_id","device_id","bucket_start");--> statement-breakpoint
CREATE INDEX "child_trail_geometry_cache_latest_location_event_id_idx" ON "child_trail_geometry_cache" USING btree ("latest_location_event_id");--> statement-breakpoint
CREATE INDEX "child_trail_geometry_cache_expires_at_idx" ON "child_trail_geometry_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "child_trail_geometry_cache_refresh_after_idx" ON "child_trail_geometry_cache" USING btree ("refresh_after");--> statement-breakpoint
CREATE INDEX "children_parent_user_id_idx" ON "children" USING btree ("parent_user_id");--> statement-breakpoint
CREATE INDEX "children_organization_id_idx" ON "children" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "children_creation_idempotency_key_unique" ON "children" USING btree ("creation_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_pages_slug_unique" ON "cms_pages" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "cms_pages_status_idx" ON "cms_pages" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "devices_hardware_identifier_unique" ON "devices" USING btree ("hardware_identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "geofence_events_dedup_key_unique" ON "geofence_events" USING btree ("dedup_key");--> statement-breakpoint
CREATE INDEX "geofence_events_child_id_idx" ON "geofence_events" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "geofence_events_organization_id_idx" ON "geofence_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "geofence_events_occurred_at_idx" ON "geofence_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "location_events_child_id_idx" ON "location_events" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "location_events_device_id_idx" ON "location_events" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "location_events_occurred_at_idx" ON "location_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "notifications_target_user_id_idx" ON "notifications" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "places_provider_place_unique" ON "places" USING btree ("provider","provider_place_id");--> statement-breakpoint
CREATE INDEX "places_kind_label_idx" ON "places" USING btree ("kind","label");--> statement-breakpoint
CREATE INDEX "push_delivery_jobs_status_next_attempt_idx" ON "push_delivery_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "push_delivery_jobs_notification_id_idx" ON "push_delivery_jobs" USING btree ("user_notification_id");--> statement-breakpoint
CREATE INDEX "push_delivery_jobs_installation_id_idx" ON "push_delivery_jobs" USING btree ("push_installation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_installations_expo_push_token_unique" ON "push_installations" USING btree ("expo_push_token");--> statement-breakpoint
CREATE UNIQUE INDEX "push_installations_user_installation_unique" ON "push_installations" USING btree ("user_id","installation_id");--> statement-breakpoint
CREATE INDEX "push_installations_user_id_idx" ON "push_installations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_installations_status_idx" ON "push_installations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "step_counts_daily_child_id_idx" ON "step_counts_daily" USING btree ("child_id");--> statement-breakpoint
CREATE INDEX "step_counts_daily_device_id_idx" ON "step_counts_daily" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "step_counts_daily_event_date_idx" ON "step_counts_daily" USING btree ("event_date");--> statement-breakpoint
CREATE UNIQUE INDEX "step_counts_daily_child_device_date_unique" ON "step_counts_daily" USING btree ("child_id","device_id","event_date");--> statement-breakpoint
CREATE INDEX "user_notifications_user_id_idx" ON "user_notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_notifications_organization_id_idx" ON "user_notifications" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_notifications_occurred_at_idx" ON "user_notifications" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "user_notifications_read_at_idx" ON "user_notifications" USING btree ("read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_notifications_user_geofence_event_unique" ON "user_notifications" USING btree ("user_id","geofence_event_id") WHERE "user_notifications"."geofence_event_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "family_join_codes_organization_id_idx" ON "family_join_codes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "family_join_codes_invited_phone_number_idx" ON "family_join_codes" USING btree ("invited_phone_number");--> statement-breakpoint
CREATE UNIQUE INDEX "family_join_codes_token_hash_unique" ON "family_join_codes" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_organization_user_unique" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_unique" ON "organization" USING btree ("slug");