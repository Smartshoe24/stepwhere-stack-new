export type FamilyMemberRole = "admin" | "member";

export type FamilyDto = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  familyName: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type FamilyMemberDto = {
  id: string;
  userId: string;
  organizationId: string;
  role: FamilyMemberRole;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    phoneNumber: string;
    email: string | null;
    avatarUrl: string | null;
  };
};

export type FamilyPermissionDto = {
  canManageChildren: boolean;
  canManageGeofences: boolean;
  canManageMembers: boolean;
  canManageJoinCodes: boolean;
  canCreateShareLinks: boolean;
};

export type FamilyContextDto = {
  organization: FamilyDto | null;
  memberRole: FamilyMemberRole | null;
  permissions: FamilyPermissionDto;
  requiresOnboarding: boolean;
};

export type CreateFamilyInput = {
  familyName: string;
};

export type CreateFamilyJoinCodeInput = {
  phoneNumber: string;
  expiresAt?: string | null;
};

export type CreateFamilyQrInviteInput = Record<string, never>;

export type FamilyInviteKind = "phone" | "qr";

export type FamilyJoinCodeDto = {
  id: string;
  organizationId: string;
  phoneNumber: string | null;
  token: string | null;
  joinUrl: string | null;
  role: "member";
  inviteKind: FamilyInviteKind;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type FamilyQrInviteDto = {
  id: string;
  organizationId: string;
  token: string;
  joinUrl: string;
  role: "member";
  inviteKind: "qr";
  expiresAt: string;
  createdAt: string;
};

export type PublicFamilyInvitePreviewDto = {
  familyName: string | null;
  role: "member" | null;
  expiresAt: string | null;
  status: "valid" | "expired" | "unavailable";
};

export type JoinFamilyPreviewDto = {
  organization: Pick<FamilyDto, "id" | "name" | "slug" | "familyName">;
  role: "member";
  phoneNumber: string | null;
  inviteKind: FamilyInviteKind;
  expiresAt: string;
  isValid: boolean;
};

export type LeaveFamilyResultDto = {
  left: boolean;
  nextOnboardingPath: "/onboarding/family";
};

export type RemoveFamilyMemberResultDto = {
  removed: boolean;
  memberId: string;
};
