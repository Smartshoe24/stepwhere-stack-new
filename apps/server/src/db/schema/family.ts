import { relations } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { users } from "./auth";

export const organizationInvitationStatusEnum = pgEnum("organization_invitation_status", [
  "pending",
  "accepted",
  "rejected",
  "canceled",
]);

export const organizations = pgTable("organization", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  logo: text("logo"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => ({
  slugUnique: uniqueIndex("organization_slug_unique").on(table.slug),
}));

export const members = pgTable("member", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index("member_organization_id_idx").on(table.organizationId),
  userIdIdx: index("member_user_id_idx").on(table.userId),
  organizationUserUnique: uniqueIndex("member_organization_user_unique").on(table.organizationId, table.userId),
}));

export const organizationInvitations = pgTable("invitation", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull(),
  status: organizationInvitationStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  inviterId: uuid("inviter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index("invitation_organization_id_idx").on(table.organizationId),
  emailIdx: index("invitation_email_idx").on(table.email),
}));

export const familyJoinCodes = pgTable("family_join_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  inviteKind: text("invite_kind").notNull().default("phone"),
  invitedPhoneNumber: text("invited_phone_number"),
  tokenHash: text("token_hash").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  consumedByUserId: uuid("consumed_by_user_id").references(() => users.id, { onDelete: "set null" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  organizationIdIdx: index("family_join_codes_organization_id_idx").on(table.organizationId),
  invitedPhoneNumberIdx: index("family_join_codes_invited_phone_number_idx").on(table.invitedPhoneNumber),
  tokenHashUnique: uniqueIndex("family_join_codes_token_hash_unique").on(table.tokenHash),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  members: many(members),
  invitations: many(organizationInvitations),
  joinCodes: many(familyJoinCodes),
}));

export const membersRelations = relations(members, ({ one }) => ({
  organization: one(organizations, {
    fields: [members.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [members.userId],
    references: [users.id],
  }),
}));

export const organizationInvitationsRelations = relations(organizationInvitations, ({ one }) => ({
  organization: one(organizations, {
    fields: [organizationInvitations.organizationId],
    references: [organizations.id],
  }),
  inviter: one(users, {
    fields: [organizationInvitations.inviterId],
    references: [users.id],
  }),
}));

export const familyJoinCodesRelations = relations(familyJoinCodes, ({ one }) => ({
  organization: one(organizations, {
    fields: [familyJoinCodes.organizationId],
    references: [organizations.id],
  }),
  createdByUser: one(users, {
    fields: [familyJoinCodes.createdByUserId],
    references: [users.id],
  }),
  consumedByUser: one(users, {
    fields: [familyJoinCodes.consumedByUserId],
    references: [users.id],
  }),
}));
