import { relations, sql } from "drizzle-orm";
import { boolean, check, date, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "suspended"]);
export const phoneAuthChallengeIntentEnum = pgEnum("phone_auth_challenge_intent", ["signin", "signup"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  emailVerificationProvider: text("email_verification_provider"),
  googleSubject: text("google_subject"),
  image: text("image"),
  phoneNumber: text("phone_number").notNull(),
  phoneNumberVerified: boolean("phone_number_verified").notNull().default(false),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  isPlayReviewAccount: boolean("is_play_review_account").notNull().default(false),
  role: userRoleEnum("role").notNull().default("user"),
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires", { withTimezone: true }),
  status: userStatusEnum("status").notNull().default("active"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  currentAddress: text("current_address"),
  dateOfBirth: date("date_of_birth"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
  googleSubjectUnique: uniqueIndex("users_google_subject_unique")
    .on(table.googleSubject)
    .where(sql`${table.googleSubject} is not null`),
  phoneUnique: uniqueIndex("users_phone_number_unique").on(table.phoneNumber),
}));

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull(),
  activeOrganizationId: text("active_organization_id"),
  impersonatedBy: uuid("impersonated_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
}, (table) => ({
  tokenUnique: uniqueIndex("sessions_token_unique").on(table.token),
  userIdIdx: index("sessions_user_id_idx").on(table.userId),
}));

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  providerAccountUnique: uniqueIndex("accounts_provider_account_unique").on(table.providerId, table.accountId),
  userIdIdx: index("accounts_user_id_idx").on(table.userId),
}));

export const verifications = pgTable("verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  identifierIdx: index("verifications_identifier_idx").on(table.identifier),
}));

export const phoneAuthChallenges = pgTable("phone_auth_challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneNumber: text("phone_number").notNull(),
  intent: phoneAuthChallengeIntentEnum("intent").notNull(),
  normalizedEmail: text("normalized_email"),
  tokenHash: text("token_hash").notNull(),
  requestIpHash: text("request_ip_hash").notNull(),
  sendCount: integer("send_count").notNull().default(1),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  resendAvailableAt: timestamp("resend_available_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("phone_auth_challenges_token_hash_unique").on(table.tokenHash),
  phoneNumberIdx: index("phone_auth_challenges_phone_number_idx").on(table.phoneNumber),
  ipHashIdx: index("phone_auth_challenges_request_ip_hash_idx").on(table.requestIpHash),
}));

export const signinRecoveryChallenges = pgTable("signin_recovery_challenges", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  phoneNumber: text("phone_number").notNull(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  tokenHash: text("token_hash").notNull(),
  requestIpHash: text("request_ip_hash").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  resendAvailableAt: timestamp("resend_available_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("signin_recovery_challenges_token_hash_unique").on(table.tokenHash),
  userIdIdx: index("signin_recovery_challenges_user_id_idx").on(table.userId),
  phoneNumberIdx: index("signin_recovery_challenges_phone_number_idx").on(table.phoneNumber),
  ipHashIdx: index("signin_recovery_challenges_request_ip_hash_idx").on(table.requestIpHash),
}));

export const previewAccessEntries = pgTable("preview_access_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  phoneNumber: text("phone_number").notNull(),
  label: text("label"),
  isActive: boolean("is_active").notNull().default(true),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  phoneNumberUnique: uniqueIndex("preview_access_entries_phone_number_unique").on(table.phoneNumber),
  phoneNumberFormatCheck: check(
    "preview_access_entries_phone_number_e164_check",
    sql`${table.phoneNumber} ~ '^\\+[1-9][0-9]{7,14}$'`,
  ),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));
