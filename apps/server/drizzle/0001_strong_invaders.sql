ALTER TABLE "family_join_codes" ALTER COLUMN "invited_phone_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "family_join_codes" ADD COLUMN "invite_kind" text DEFAULT 'phone' NOT NULL;