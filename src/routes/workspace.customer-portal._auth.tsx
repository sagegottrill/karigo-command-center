import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/customer-portal/_auth")({
  beforeLoad: () => {
    const user = authService.getCurrentUser();
    if (user?.passwordResetRequired) {
      throw redirect({ to: "/workspace/forgot-password" });
    }
    const roles = authService.getRoles();
    if (!roles.includes("Customer Portals (External)")) {
      console.warn("User does not have Customer Portals (External) role. Roles found:", roles);
      // Temporarily allowing access to debug the login loop
      // throw redirect({ to: "/workspace/customer-portal/login" });
    }
  },

  component: CustomerPortalAuthShell,
});

function CustomerPortalAuthShell() {
  return <Outlet />;
}
