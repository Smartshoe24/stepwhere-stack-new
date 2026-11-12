import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAdminSetupStatus } from "@/lib/api-client";
import { setupLoader } from "./setup";

const getAdminSetupStatusMock = vi.mocked(getAdminSetupStatus);

vi.mock("@/features/auth/setup", () => ({
  AdminSetup: () => null,
}));

vi.mock("@/lib/api-client", () => ({
  getAdminSetupStatus: vi.fn(),
}));

describe("setupLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the initial admin email while setup is required", async () => {
    getAdminSetupStatusMock.mockResolvedValue({
      required: true,
      email: "admin@stepwhere.in",
    });

    await expect(setupLoader()).resolves.toEqual({
      email: "admin@stepwhere.in",
    });
  });

  it("redirects to sign-in once setup is no longer required", async () => {
    getAdminSetupStatusMock.mockResolvedValue({
      required: false,
      email: "admin@stepwhere.in",
    });

    await expect(setupLoader()).rejects.toMatchObject({
      options: {
        to: "/sign-in",
      },
    });
  });
});
