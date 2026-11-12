export type AccountDeletionScope = "user_only" | "family";

export type AccountDeletionImpactDto = {
  childCount: number;
  familyMemberCount: number;
  familyName: string | null;
  isFamilyAdmin: boolean;
  scope: AccountDeletionScope;
  shoeCount: number;
  trackingStops: boolean;
  willTransferAdmin: boolean;
};

export type AccountDeletionChallengeDto = {
  challengeToken: string;
  expiresAt: string;
  impact: AccountDeletionImpactDto;
  phoneNumber: string;
  resendAvailableAt: string;
};

export type ConfirmAccountDeletionInput = {
  challengeToken: string;
  code: string;
};

export type AccountDeletionConfirmationDto = {
  adminTransferred: boolean;
  purgeBy: string;
  requestedAt: string;
  scope: AccountDeletionScope;
  trackingStopped: boolean;
  undoUntil: string;
};
