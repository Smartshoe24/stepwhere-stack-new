import { sql } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { organizations } from "./family";

export const accountDeletionStatusEnum = pgEnum("account_deletion_status", [
  "pending",
  "purging",
  "cancelled",
  "completed",
]);

export const accountDeletionScopeEnum = pgEnum("account_deletion_scope", [
  "user_only",
  "family",
]);

export const accountDeletionChallenges = pgTable("account_deletion_challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phoneNumber: text("phone_number").notNull(),
  codeHash: text("code_hash").notNull(),
  tokenHash: text("token_hash").notNull(),
  requestIpHash: text("request_ip_hash").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  resendAvailableAt: timestamp("resend_available_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("account_deletion_challenges_token_hash_unique").on(table.tokenHash),
  userIdIdx: index("account_deletion_challenges_user_id_idx").on(table.userId),
  requestIpHashIdx: index("account_deletion_challenges_request_ip_hash_idx").on(table.requestIpHash),
}));

export const accountDeletionRequests = pgTable("account_deletion_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  adminTransferredToUserId: uuid("admin_transferred_to_user_id").references(() => users.id, { onDelete: "set null" }),
  scope: accountDeletionScopeEnum("scope").notNull(),
  status: accountDeletionStatusEnum("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  undoUntil: timestamp("undo_until", { withTimezone: true }).notNull(),
  purgeBy: timestamp("purge_by", { withTimezone: true }).notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull(),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastError: text("last_error"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  activeUserUnique: uniqueIndex("account_deletion_requests_active_user_unique")
    .on(table.userId)
    .where(sql`${table.userId} IS NOT NULL AND ${table.status} IN ('pending', 'purging')`),
  statusNextAttemptIdx: index("account_deletion_requests_status_next_attempt_idx")
    .on(table.status, table.nextAttemptAt),
  organizationIdIdx: index("account_deletion_requests_organization_id_idx").on(table.organizationId),
}));
