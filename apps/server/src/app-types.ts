import type { Session, User } from "better-auth";

import type { devices, members, organizations } from "./db/schema";

export type DeviceRecord = typeof devices.$inferSelect;
export type OrganizationRecord = typeof organizations.$inferSelect;
export type MemberRecord = typeof members.$inferSelect;

export type AppBindings = {
  Variables: {
    requestId: string;
    requestStartedAt: number;
    session: Session & {
      activeOrganizationId?: string | null;
    };
    user: User & {
      onboardingCompleted?: boolean;
      role?: "user" | "admin";
      status?: "active" | "suspended";
      lastSeenAt?: Date | null;
    };
    device: DeviceRecord;
    organization: OrganizationRecord;
    familyMember: MemberRecord;
  };
};
