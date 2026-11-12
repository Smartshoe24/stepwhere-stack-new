import type { UserProfileDto } from "./users";

export type OnboardingMode = "start" | "join";

export type RequestOtpInput = {
  phoneNumber: string;
};

export type AuthOtpIntent = "signin" | "signup";

export type PrepareOtpInput = {
  phoneNumber: string;
};

export type PrepareOtpResponseDto = {
  challengeToken: string;
  expiresAt: string;
  intent: AuthOtpIntent;
  phoneNumber: string;
  resendAvailableAt: string;
};

export type VerifyOtpInput = {
  phoneNumber: string;
  code: string;
};

export type StartSigninRecoveryInput = {
  phoneNumber: string;
};

export type StartSigninRecoveryResponseDto = {
  challengeToken: string;
  expiresAt: string;
  maskedEmail: string;
  resendAvailableAt: string;
};

export type VerifySigninRecoveryInput = {
  challengeToken: string;
  code: string;
  phoneNumber: string;
};

export type VerifyGoogleEmailInput = {
  idToken: string;
};

export type AuthSessionDto = {
  token: string | null;
  expiresAt: string | null;
  user: UserProfileDto | null;
};

export type VerifySigninRecoveryResponseDto = AuthSessionDto;

/** GET /v1/admin/setup: first-run admin setup (open only while no admin exists). */
export type AdminSetupStatusDto = {
  required: boolean;
  email: string;
};

/** POST /v1/admin/setup */
export type CompleteAdminSetupInput = {
  password: string;
  setupCode: string;
};

export type AdminSetupResultDto = {
  email: string;
};
