ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verification_provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_subject" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_subject_unique" ON "users" USING btree ("google_subject") WHERE "users"."google_subject" is not null;