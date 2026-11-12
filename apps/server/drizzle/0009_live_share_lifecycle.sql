ALTER TABLE "child_share_links" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
UPDATE "child_share_links"
SET "status" = 'revoked', "revoked_at" = NOW(), "updated_at" = NOW()
WHERE "status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "child_share_links_active_child_unique"
ON "child_share_links" USING btree ("child_id")
WHERE "child_share_links"."status" = 'active';
