import { beforeEach, describe, expect, it, vi } from "vitest";

const GOOGLE_AUDIENCE = "web-client-id.apps.googleusercontent.com";
const googleAuthMocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
}));
const dbMocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  updateResult: [] as unknown[],
}));
const profileMocks = vi.hoisted(() => ({
  toUserProfileDto: vi.fn(async (user: { id: string }) => ({
    id: user.id,
    displayName: "Parent",
    email: "parent@gmail.com",
    emailVerified: true,
    phoneNumber: "+919999999999",
    avatarUrl: null,
    currentAddress: null,
    dateOfBirth: null,
    onboardingCompleted: false,
    role: "user",
    status: "active",
    banned: false,
    banReason: null,
    banExpires: null,
    lastSeenAt: null,
    family: {
      organization: null,
      memberRole: null,
      permissions: {
        canCreateShareLinks: false,
        canManageChildren: false,
        canManageGeofences: false,
        canManageJoinCodes: false,
        canManageMembers: false,
      },
      requiresOnboarding: true,
    },
    createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
    updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  })),
}));

vi.mock("google-auth-library", () => ({
  OAuth2Client: vi.fn(() => ({
    verifyIdToken: googleAuthMocks.verifyIdToken,
  })),
}));

vi.mock("../../db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => dbMocks.selectResults.shift() ?? []),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => dbMocks.updateResult),
        })),
      })),
    })),
  },
}));

vi.mock("../users/users.service", () => ({
  toUserProfileDto: profileMocks.toUserProfileDto,
}));

function createGooglePayload(overrides: Record<string, unknown> = {}) {
  return {
    aud: GOOGLE_AUDIENCE,
    email: "Parent@Gmail.com",
    email_verified: true,
    exp: Math.floor(Date.now() / 1000) + 60,
    iss: "https://accounts.google.com",
    sub: "google-subject-1",
    ...overrides,
  };
}

function createUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Parent",
    email: "999999999999@phone.stepwhere.local",
    emailVerified: false,
    emailVerifiedAt: null,
    emailVerificationProvider: null,
    googleSubject: null,
    image: null,
    phoneNumber: "+919999999999",
    phoneNumberVerified: true,
    onboardingCompleted: false,
    role: "user",
    banned: false,
    banReason: null,
    banExpires: null,
    status: "active",
    lastSeenAt: null,
    currentAddress: null,
    dateOfBirth: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

async function loadService() {
  vi.resetModules();
  process.env.GOOGLE_OAUTH_CLIENT_ID = GOOGLE_AUDIENCE;
  return import("./google-email.service");
}

describe("verifyGoogleEmailForUser", () => {
  beforeEach(() => {
    googleAuthMocks.verifyIdToken.mockReset();
    dbMocks.selectResults = [];
    dbMocks.updateResult = [];
    profileMocks.toUserProfileDto.mockClear();
  });

  it("updates a phone-created placeholder email from a verified Google ID token", async () => {
    googleAuthMocks.verifyIdToken.mockResolvedValue({
      getPayload: () => createGooglePayload(),
    });
    const currentUser = createUser();
    const updatedUser = createUser({
      email: "parent@gmail.com",
      emailVerified: true,
      emailVerifiedAt: new Date("2026-01-02T00:00:00.000Z"),
      emailVerificationProvider: "google",
      googleSubject: "google-subject-1",
    });
    dbMocks.selectResults = [[currentUser], [], []];
    dbMocks.updateResult = [updatedUser];
    const { verifyGoogleEmailForUser } = await loadService();

    const profile = await verifyGoogleEmailForUser(currentUser.id, {
      idToken: "id-token",
    });

    expect(googleAuthMocks.verifyIdToken).toHaveBeenCalledWith({
      audience: GOOGLE_AUDIENCE,
      idToken: "id-token",
    });
    expect(profile.email).toBe("parent@gmail.com");
    expect(profile.emailVerified).toBe(true);
    expect(profileMocks.toUserProfileDto).toHaveBeenCalledWith(updatedUser, {
      idToken: "id-token",
    });
  });

  it("rejects a token with an invalid audience", async () => {
    googleAuthMocks.verifyIdToken.mockResolvedValue({
      getPayload: () => createGooglePayload({ aud: "wrong-client-id" }),
    });
    const { verifyGoogleEmailForUser } = await loadService();

    await expect(verifyGoogleEmailForUser("user-id", { idToken: "id-token" }))
      .rejects.toMatchObject({
        message: "Google account verification audience is invalid.",
        status: 400,
      });
  });

  it("rejects an unverified Google email", async () => {
    googleAuthMocks.verifyIdToken.mockResolvedValue({
      getPayload: () => createGooglePayload({ email_verified: false }),
    });
    const { verifyGoogleEmailForUser } = await loadService();

    await expect(verifyGoogleEmailForUser("user-id", { idToken: "id-token" }))
      .rejects.toMatchObject({
        message: "Choose a Google account with a verified email address.",
        status: 403,
      });
  });

  it("rejects changing an already verified real email", async () => {
    googleAuthMocks.verifyIdToken.mockResolvedValue({
      getPayload: () => createGooglePayload({ email: "new@gmail.com" }),
    });
    dbMocks.selectResults = [[createUser({
      email: "existing@company.com",
      emailVerified: true,
    })]];
    const { verifyGoogleEmailForUser } = await loadService();

    await expect(verifyGoogleEmailForUser("user-id", { idToken: "id-token" }))
      .rejects.toMatchObject({
        message: "This account is already verified with a different email address.",
        status: 409,
      });
  });

  it("rejects when the Google subject already belongs to another user", async () => {
    googleAuthMocks.verifyIdToken.mockResolvedValue({
      getPayload: () => createGooglePayload(),
    });
    dbMocks.selectResults = [
      [createUser()],
      [],
      [{ id: "00000000-0000-0000-0000-000000000002" }],
    ];
    const { verifyGoogleEmailForUser } = await loadService();

    await expect(verifyGoogleEmailForUser("user-id", { idToken: "id-token" }))
      .rejects.toMatchObject({
        message: "This Google account is already connected to another Stepwhere account.",
        status: 409,
      });
  });
});
