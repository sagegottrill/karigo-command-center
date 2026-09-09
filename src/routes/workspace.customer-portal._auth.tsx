import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/workspace/customer-portal/_auth")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const user = authService.getCurrentUser();
    if (!user) {
      throw redirect({ to: "/workspace/customer-portal/login" });
    } else if (user.passwordResetRequired) {
      throw redirect({ to: "/workspace/forgot-password" });
    }
    const roles = authService.getRoles();
    if (!roles.includes("Customer Portals (External)")) {
      throw redirect({ to: "/workspace/customer-portal/login" });
    }
  },

  component: CustomerPortalAuthShell,
});

function CustomerPortalAuthShell() {
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const user = authService.getCurrentUser();
    if (!user) {
      navigate({ to: "/workspace/customer-portal/login" });
    } else if (user.passwordResetRequired) {
      navigate({ to: "/workspace/forgot-password" });
    } else {
      const roles = authService.getRoles();
      if (!roles.includes("Customer Portals (External)")) {
        navigate({ to: "/workspace/customer-portal/login" });
      }
    }
  }, [navigate]);

  return <Outlet />;
}
