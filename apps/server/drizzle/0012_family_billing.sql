-- Billing-only DDL. Earlier hand-written migrations (0003–0011) had no
-- snapshots, so their changes must not be generated/applied again here.
CREATE TABLE "billing_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"organization_id" uuid,
	"action" text NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_catalog" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store" text NOT NULL,
	"environment" text NOT NULL,
	"shoe_count" integer NOT NULL,
	"term_months" integer NOT NULL,
	"product_id" text NOT NULL,
	"base_plan_id" text,
	"offer_id" text,
	"currency" text NOT NULL,
	"storefront" text NOT NULL,
	"trial_credit_band" integer DEFAULT 0 NOT NULL,
	"amount_minor" integer NOT NULL,
	"renewal_amount_minor" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_catalog_dimensions" CHECK ("billing_catalog"."shoe_count" between 1 and 5 and "billing_catalog"."term_months" in (3,6,12) and "billing_catalog"."trial_credit_band" in (0,7,14,21,30) and "billing_catalog"."amount_minor" >= 0 and "billing_catalog"."renewal_amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing_checkout_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"customer_id" uuid NOT NULL,
	"quote_id" uuid,
	"snapshot" jsonb NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_offer_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_id" uuid NOT NULL,
	"encrypted_code" text NOT NULL,
	"code_hash" text NOT NULL,
	"checkout_intent_id" uuid,
	"issued_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_provider_events" (
	"id" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store" text NOT NULL,
	"environment" text NOT NULL,
	"transaction_id" text NOT NULL,
	"original_transaction_id" text NOT NULL,
	"customer_id" uuid,
	"subscription_id" uuid,
	"checkout_intent_id" uuid,
	"product_id" text NOT NULL,
	"purchased_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"offer_id" text,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_trial_credits" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"remaining_days" text NOT NULL,
	"band" integer NOT NULL,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_activations" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"activated_at" timestamp with time zone NOT NULL,
	"trial_ends_at" timestamp with time zone NOT NULL,
	"trial_converted_at" timestamp with time zone,
	"replacement_of_device_id" uuid
);
--> statement-breakpoint
CREATE TABLE "device_coverage_intervals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"organization_id" uuid,
	"subscription_id" uuid,
	"grant_key" text NOT NULL,
	"source" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "device_coverage_order" CHECK ("device_coverage_intervals"."ends_at" >= "device_coverage_intervals"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "device_ownerships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"organization_id" uuid,
	"claimed_by_user_id" uuid,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"release_reason" text
);
--> statement-breakpoint
CREATE TABLE "family_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"customer_id" uuid NOT NULL,
	"store" text NOT NULL,
	"environment" text NOT NULL,
	"original_transaction_id" text NOT NULL,
	"product_id" text NOT NULL,
	"shoe_count" integer NOT NULL,
	"term_months" integer NOT NULL,
	"device_ids" jsonb NOT NULL,
	"next_device_ids" jsonb,
	"state" text NOT NULL,
	"auto_renews" boolean NOT NULL,
	"period_starts_at" timestamp with time zone NOT NULL,
	"period_ends_at" timestamp with time zone NOT NULL,
	"grace_ends_at" timestamp with time zone NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"last_verified_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_audit" ADD CONSTRAINT "billing_audit_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_audit" ADD CONSTRAINT "billing_audit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_customer_id_billing_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_quote_id_billing_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."billing_quotes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_offer_codes" ADD CONSTRAINT "billing_offer_codes_catalog_id_billing_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."billing_catalog"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_offer_codes" ADD CONSTRAINT "billing_offer_codes_checkout_intent_id_billing_checkout_intents_id_fk" FOREIGN KEY ("checkout_intent_id") REFERENCES "public"."billing_checkout_intents"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_quotes" ADD CONSTRAINT "billing_quotes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_quotes" ADD CONSTRAINT "billing_quotes_customer_id_billing_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_customer_id_billing_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_subscription_id_family_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."family_subscriptions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD CONSTRAINT "billing_transactions_checkout_intent_id_billing_checkout_intents_id_fk" FOREIGN KEY ("checkout_intent_id") REFERENCES "public"."billing_checkout_intents"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_trial_credits" ADD CONSTRAINT "billing_trial_credits_device_id_device_activations_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device_activations"("device_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "billing_trial_credits" ADD CONSTRAINT "billing_trial_credits_transaction_id_billing_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."billing_transactions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "device_activations" ADD CONSTRAINT "device_activations_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "device_activations" ADD CONSTRAINT "device_activations_replacement_of_device_id_devices_id_fk" FOREIGN KEY ("replacement_of_device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "device_coverage_intervals" ADD CONSTRAINT "device_coverage_intervals_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "device_coverage_intervals" ADD CONSTRAINT "device_coverage_intervals_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "device_coverage_intervals" ADD CONSTRAINT "device_coverage_intervals_subscription_id_family_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."family_subscriptions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "device_ownerships" ADD CONSTRAINT "device_ownerships_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "device_ownerships" ADD CONSTRAINT "device_ownerships_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "device_ownerships" ADD CONSTRAINT "device_ownerships_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "family_subscriptions" ADD CONSTRAINT "family_subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "family_subscriptions" ADD CONSTRAINT "family_subscriptions_customer_id_billing_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_catalog_variant_unique" ON "billing_catalog" USING btree ("store","environment","shoe_count","term_months","currency","storefront","trial_credit_band");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_idempotency_unique" ON "billing_checkout_intents" USING btree ("customer_id","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_family_pending_unique" ON "billing_checkout_intents" USING btree ("organization_id") WHERE "billing_checkout_intents"."state" in ('pending','needs_review','deferred');
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_customers_user_unique" ON "billing_customers" USING btree ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_offer_codes_hash_unique" ON "billing_offer_codes" USING btree ("code_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_offer_codes_intent_unique" ON "billing_offer_codes" USING btree ("checkout_intent_id");
--> statement-breakpoint
CREATE INDEX "billing_provider_events_queue_idx" ON "billing_provider_events" USING btree ("state","available_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "billing_transactions_provider_unique" ON "billing_transactions" USING btree ("store","environment","transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "device_coverage_grant_unique" ON "device_coverage_intervals" USING btree ("device_id","grant_key","source");
--> statement-breakpoint
CREATE INDEX "device_coverage_lookup_idx" ON "device_coverage_intervals" USING btree ("device_id","starts_at","ends_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "device_ownerships_active_unique" ON "device_ownerships" USING btree ("device_id") WHERE "device_ownerships"."released_at" is null and "device_ownerships"."organization_id" is not null;
--> statement-breakpoint
CREATE INDEX "device_ownerships_family_idx" ON "device_ownerships" USING btree ("organization_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "family_subscriptions_provider_unique" ON "family_subscriptions" USING btree ("store","environment","original_transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "family_subscriptions_family_live_unique" ON "family_subscriptions" USING btree ("organization_id") WHERE "family_subscriptions"."state" in ('active','billing_issue');
--> statement-breakpoint
CREATE UNIQUE INDEX "family_subscriptions_purchaser_live_unique" ON "family_subscriptions" USING btree ("customer_id") WHERE "family_subscriptions"."state" in ('active','billing_issue');
--> statement-breakpoint
-- First-ever successful link, including shoes currently unlinked. Never grant
-- migration-day trials. The immutable dates follow the physical device.
INSERT INTO device_activations (device_id, activated_at, trial_ends_at)
SELECT device_id, min(bound_at), min(bound_at) + interval '30 days'
FROM child_device_bindings GROUP BY device_id ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Preserve the most recent known family ownership even after a child unlink.
INSERT INTO device_ownerships (device_id, organization_id, claimed_by_user_id, claimed_at)
SELECT DISTINCT ON (b.device_id) b.device_id, c.organization_id, c.parent_user_id, b.bound_at
FROM child_device_bindings b JOIN children c ON c.id = b.child_id
ORDER BY b.device_id, (b.unbound_at IS NULL) DESC, b.bound_at DESC
ON CONFLICT DO NOTHING;
--> statement-breakpoint
UPDATE device_activations a SET trial_converted_at = greatest(a.activated_at, paid.first_purchase)
FROM (SELECT b.device_id, min(s.starts_at) AS first_purchase
      FROM child_plan_subscriptions s JOIN child_device_bindings b ON b.child_id = s.child_id
      WHERE s.source = 'purchase' GROUP BY b.device_id) paid
WHERE a.device_id = paid.device_id AND a.trial_converted_at IS NULL;
--> statement-breakpoint
INSERT INTO device_coverage_intervals (device_id, organization_id, grant_key, source, starts_at, ends_at)
SELECT a.device_id, o.organization_id, 'trial:' || a.device_id, 'trial', a.activated_at, least(a.trial_ends_at, coalesce(a.trial_converted_at, a.trial_ends_at))
FROM device_activations a JOIN device_ownerships o ON o.device_id = a.device_id AND o.released_at IS NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO device_coverage_intervals (device_id, organization_id, grant_key, source, starts_at, ends_at)
SELECT a.device_id, o.organization_id, 'trial:' || a.device_id, 'grace', a.trial_ends_at, a.trial_ends_at + interval '3 days'
FROM device_activations a JOIN device_ownerships o ON o.device_id = a.device_id AND o.released_at IS NULL
WHERE a.trial_converted_at IS NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Existing explicit child plans keep their historical coverage. No implicit
-- forever-paid migration grant; enforcement remains off until policy is set.
INSERT INTO device_coverage_intervals (device_id, organization_id, grant_key, source, starts_at, ends_at)
SELECT b.device_id, c.organization_id, 'legacy:' || s.id || ':' || b.id, 'legacy',
       greatest(s.starts_at, b.bound_at), least(s.ends_at, coalesce(b.unbound_at, s.ends_at))
FROM child_plan_subscriptions s JOIN children c ON c.id = s.child_id
JOIN child_device_bindings b ON b.child_id = c.id
WHERE s.status != 'cancelled' AND greatest(s.starts_at, b.bound_at) < least(s.ends_at, coalesce(b.unbound_at, s.ends_at))
ON CONFLICT DO NOTHING;
