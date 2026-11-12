import type { FamilyContextDto } from "./family";

export type UserRole = "user" | "admin";
export type UserStatus = "active" | "suspended";

export type UserProfileDto = {
  id: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  phoneNumber: string;
  avatarUrl: string | null;
  currentAddress: string | null;
  dateOfBirth: string | null;
  onboardingCompleted: boolean;
  role: UserRole;
  status: UserStatus;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
  lastSeenAt: string | null;
  family: FamilyContextDto;
  createdAt: string;
  updatedAt: string;
};

export type UpdateMeInput = {
  displayName?: string;
  avatarUrl?: string | null;
  currentAddress?: string | null;
  dateOfBirth?: string | null;
};
