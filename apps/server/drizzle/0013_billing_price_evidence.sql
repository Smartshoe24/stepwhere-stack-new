ALTER TABLE "billing_transactions" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "billing_transactions" ADD COLUMN "amount_minor" integer;