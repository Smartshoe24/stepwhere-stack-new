import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { env } from "../../config/env";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { AppError, badRequest, conflict, forbidden } from "../../shared/errors";
import { toUserProfileDto } from "../users/users.service";

const TEMP_PHONE_EMAIL_DOMAIN = "@phone.stepwhere.local";
const GOOGLE_TOKEN_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);

const googleTokenPayloadSchema = z.object({
  aud: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean(),
  exp: z.number().int().positive(),
  iss: z.string().min(1),
  sub: z.string().min(1),
});

const googleOAuthClient = new OAuth2Client();

function isPlaceholderPhoneEmail(email: string) {
  return email.trim().toLowerCase().endsWith(TEMP_PHONE_EMAIL_DOMAIN);
}

async function verifyGoogleIdToken(idToken: string): Promise<z.infer<typeof googleTokenPayloadSchema>> {
  if (!env.GOOGLE_OAUTH_CLIENT_ID) {
    throw new AppError(
      500,
      "INTERNAL_SERVER_ERROR",
      "Google email verification is not configured.",
    );
  }

  let payload: TokenPayload | undefined;

  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_OAUTH_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch {
    throw badRequest("Google account verification data is invalid.");
  }

  const parsedPayload = googleTokenPayloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    throw badRequest("Google account verification data is invalid.");
  }

  if (parsedPayload.data.aud !== env.GOOGLE_OAUTH_CLIENT_ID) {
    throw badRequest("Google account verification audience is invalid.");
  }

  if (!GOOGLE_TOKEN_ISSUERS.has(parsedPayload.data.iss)) {
    throw badRequest("Google account verification issuer is invalid.");
  }

  if (parsedPayload.data.exp * 1000 <= Date.now()) {
    throw badRequest("Google account verification token has expired.");
  }

  return parsedPayload.data;
}

export async function verifyGoogleEmailForUser(userId: string, options: {
  activeOrganizationId?: string | null;
  headers?: Headers;
  idToken: string;
}) {
  const payload = await verifyGoogleIdToken(options.idToken);

  if (!payload.email_verified) {
    throw forbidden("Choose a Google account with a verified email address.");
  }

  const normalizedEmail = payload.email.trim().toLowerCase();
  const [currentUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!currentUser) {
    throw badRequest("Unable to update the current user.");
  }

  const currentEmail = currentUser.email.trim().toLowerCase();
  if (
    currentUser.emailVerified
    && currentEmail !== normalizedEmail
    && !isPlaceholderPhoneEmail(currentEmail)
  ) {
    throw conflict("This account is already verified with a different email address.");
  }

  const [existingEmailUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.email, normalizedEmail), ne(users.id, userId)))
    .limit(1);

  if (existingEmailUser) {
    throw conflict("An account already exists for this email address.");
  }

  const [existingGoogleSubjectUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.googleSubject, payload.sub), ne(users.id, userId)))
    .limit(1);

  if (existingGoogleSubjectUser) {
    throw conflict("This Google account is already connected to another Stepwhere account.");
  }

  const [updatedUser] = await db
    .update(users)
    .set({
      email: normalizedEmail,
      emailVerified: true,
      emailVerifiedAt: new Date(),
      emailVerificationProvider: "google",
      googleSubject: payload.sub,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) {
    throw badRequest("Unable to update the current user.");
  }

  return toUserProfileDto(updatedUser, options);
}
