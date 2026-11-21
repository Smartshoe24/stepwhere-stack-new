ALTER TYPE "public"."notification_type" ADD VALUE 'billing';--> statement-breakpoint
CREATE TABLE "billing_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"mandate_id" uuid,
	"organization_id" uuid,
	"customer_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"due_on" text NOT NULL,
	"period_starts_at" timestamp with time zone NOT NULL,
	"amount_minor" integer NOT NULL,
	"base_minor" integer NOT NULL,
	"credit_minor" integer DEFAULT 0 NOT NULL,
	"breakdown" jsonb NOT NULL,
	"provider_payment_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_on" text,
	"submitted_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"refunded_minor" integer DEFAULT 0 NOT NULL,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_charges_amounts" CHECK ("billing_charges"."amount_minor" > 0 and "billing_charges"."refunded_minor" >= 0 and "billing_charges"."refunded_minor" <= "billing_charges"."amount_minor")
);
--> statement-breakpoint
CREATE TABLE "billing_checkout_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"organization_id" uuid,
	"customer_id" uuid NOT NULL,
	"quote_id" uuid,
	"subscription_id" uuid,
	"mandate_id" uuid NOT NULL,
	"snapshot" jsonb,
	"checkout_token" jsonb,
	"idempotency_key" uuid NOT NULL,
	"state" text DEFAULT 'awaiting_authorization' NOT NULL,
	"failure_reason" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_fake_objects" (
	"ref" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoice_sequences" (
	"financial_year" text PRIMARY KEY NOT NULL,
	"last_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charge_id" uuid NOT NULL,
	"number" text NOT NULL,
	"financial_year" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"amount_minor" integer NOT NULL,
	"taxable_minor" integer NOT NULL,
	"cgst_minor" integer NOT NULL,
	"sgst_minor" integer NOT NULL,
	"igst_minor" integer NOT NULL,
	"buyer" jsonb NOT NULL,
	"lines" jsonb NOT NULL,
	"pdf_key" text
);
--> statement-breakpoint
CREATE TABLE "billing_mandates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"organization_id" uuid,
	"provider_mandate_id" text,
	"status" text DEFAULT 'pending_authorization' NOT NULL,
	"method" text,
	"method_label" text,
	"max_amount_minor" integer NOT NULL,
	"failure_reason" text,
	"authorized_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "billing_price_book" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"currency" text NOT NULL,
	"term_months" integer NOT NULL,
	"per_shoe_minor" integer NOT NULL,
	"active_from" timestamp with time zone NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_price_book_values" CHECK ("billing_price_book"."term_months" in (3,6,12) and "billing_price_book"."per_shoe_minor" > 0 and "billing_price_book"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "billing_refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"charge_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_refund_id" text,
	"actor_user_id" uuid,
	"revoke_coverage" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_refunds_amount" CHECK ("billing_refunds"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "family_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"customer_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"environment" text NOT NULL,
	"mandate_id" uuid NOT NULL,
	"currency" text NOT NULL,
	"price_book_version" integer NOT NULL,
	"per_shoe_minor" integer NOT NULL,
	"shoe_count" integer NOT NULL,
	"term_months" integer NOT NULL,
	"device_ids" jsonb NOT NULL,
	"next_device_ids" jsonb,
	"next_term_months" integer,
	"state" text NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"period_starts_at" timestamp with time zone NOT NULL,
	"period_ends_at" timestamp with time zone NOT NULL,
	"grace_ends_at" timestamp with time zone NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "family_subscriptions_dimensions" CHECK ("family_subscriptions"."shoe_count" between 1 and 5 and "family_subscriptions"."term_months" in (3,6,12) and "family_subscriptions"."period_ends_at" > "family_subscriptions"."period_starts_at")
);
--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_subscription_id_family_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."family_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_mandate_id_billing_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."billing_mandates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_charges" ADD CONSTRAINT "billing_charges_customer_id_billing_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_customer_id_billing_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_quote_id_billing_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."billing_quotes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_subscription_id_family_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."family_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_checkout_intents" ADD CONSTRAINT "billing_checkout_intents_mandate_id_billing_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."billing_mandates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_charge_id_billing_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."billing_charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_mandates" ADD CONSTRAINT "billing_mandates_customer_id_billing_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_mandates" ADD CONSTRAINT "billing_mandates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_price_book" ADD CONSTRAINT "billing_price_book_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_refunds" ADD CONSTRAINT "billing_refunds_charge_id_billing_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."billing_charges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_refunds" ADD CONSTRAINT "billing_refunds_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_subscriptions" ADD CONSTRAINT "family_subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_subscriptions" ADD CONSTRAINT "family_subscriptions_customer_id_billing_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."billing_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "family_subscriptions" ADD CONSTRAINT "family_subscriptions_mandate_id_billing_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."billing_mandates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_charges_period_unique" ON "billing_charges" USING btree ("subscription_id","kind","period_starts_at") WHERE "billing_charges"."kind" in ('first','renewal') and "billing_charges"."status" <> 'cancelled';--> statement-breakpoint
CREATE INDEX "billing_charges_due_idx" ON "billing_charges" USING btree ("status","due_on");--> statement-breakpoint
CREATE INDEX "billing_charges_subscription_idx" ON "billing_charges" USING btree ("subscription_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_idempotency_unique" ON "billing_checkout_intents" USING btree ("customer_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_checkout_family_open_unique" ON "billing_checkout_intents" USING btree ("organization_id") WHERE "billing_checkout_intents"."state" in ('awaiting_authorization','bank_pending');--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoices_charge_unique" ON "billing_invoices" USING btree ("charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_invoices_number_unique" ON "billing_invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "billing_mandates_customer_idx" ON "billing_mandates" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "billing_mandates_status_idx" ON "billing_mandates" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_price_book_entry_unique" ON "billing_price_book" USING btree ("version","currency","term_months");--> statement-breakpoint
CREATE INDEX "billing_refunds_charge_idx" ON "billing_refunds" USING btree ("charge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "family_subscriptions_family_live_unique" ON "family_subscriptions" USING btree ("organization_id") WHERE "family_subscriptions"."state" in ('scheduled','active','past_due','cancelled');--> statement-breakpoint
CREATE UNIQUE INDEX "family_subscriptions_purchaser_live_unique" ON "family_subscriptions" USING btree ("customer_id") WHERE "family_subscriptions"."state" in ('scheduled','active','past_due','cancelled');--> statement-breakpoint
ALTER TABLE "device_coverage_intervals" ADD CONSTRAINT "device_coverage_intervals_subscription_id_family_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."family_subscriptions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Launch prices per shoe, GST included: 3 months ₹397, 6 months ₹549, 12 months ₹899.
INSERT INTO "billing_price_book" ("version", "currency", "term_months", "per_shoe_minor", "active_from") VALUES
  (1, 'INR', 3, 39700, '2026-01-01T00:00:00Z'),
  (1, 'INR', 6, 54900, '2026-01-01T00:00:00Z'),
  (1, 'INR', 12, 89900, '2026-01-01T00:00:00Z')
ON CONFLICT DO NOTHING;
