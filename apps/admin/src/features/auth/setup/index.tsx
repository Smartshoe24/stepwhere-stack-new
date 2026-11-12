import { getRouteApi } from "@tanstack/react-router";
import { AuthLayout } from "../auth-layout";
import { AdminSetupForm } from "./components/admin-setup-form";

const route = getRouteApi("/(auth)/setup");

export function AdminSetup() {
  const { email } = route.useLoaderData();

  return (
    <AuthLayout
      title="Set up admin"
      description="Choose the password for the Stepwhere admin account. You will sign in with it next."
      footer="Shown once on a new deployment, until the admin account exists. The setup code is in Infisical (ADMIN_SETUP_CODE)."
    >
      <AdminSetupForm email={email} />
    </AuthLayout>
  );
}
