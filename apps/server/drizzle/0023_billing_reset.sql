-- Store billing (Superwall, App Store, Google Play) is replaced by server-priced
-- autopay. Purchases were never enabled, so these tables hold no customer payments.
ALTER TABLE "device_coverage_intervals" DROP CONSTRAINT IF EXISTS "device_coverage_intervals_subscription_id_family_subscriptions_id_fk";--> statement-breakpoint
UPDATE "device_coverage_intervals" SET "subscription_id" = NULL WHERE "subscription_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_catalog" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_checkout_intents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_offer_codes" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_transactions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_trial_credits" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "family_subscriptions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "billing_catalog" CASCADE;--> statement-breakpoint
DROP TABLE "billing_checkout_intents" CASCADE;--> statement-breakpoint
DROP TABLE "billing_offer_codes" CASCADE;--> statement-breakpoint
DROP TABLE "billing_transactions" CASCADE;--> statement-breakpoint
DROP TABLE "billing_trial_credits" CASCADE;--> statement-breakpoint
DROP TABLE "family_subscriptions" CASCADE;
