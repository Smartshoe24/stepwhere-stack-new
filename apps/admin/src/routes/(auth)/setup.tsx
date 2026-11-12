import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminSetup } from "@/features/auth/setup";
import { getAdminSetupStatus } from "@/lib/api-client";

export const Route = createFileRoute("/(auth)/setup")({
  loader: () => setupLoader(),
  // Always re-check: setup closes for good once the admin exists.
  staleTime: 0,
  gcTime: 0,
  component: AdminSetup,
});

export async function setupLoader() {
  const status = await getAdminSetupStatus();

  if (!status.required) {
    throw redirect({ to: "/sign-in", replace: true });
  }

  return { email: status.email };
}
