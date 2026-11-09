import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { authService } from "@/lib/fleetopsx/services";

/** A partner account stamped Loader and not Requester works a yard only. */
function isYardOnly(roles: string[]) {
  return roles.includes("Partner Loader") && !roles.includes("Partner Requester");
}

/** The pages a yard account may open: its board and its notifications. */
function isYardPath(pathname: string) {
  return pathname.includes("/loading-site") || pathname.includes("/notifications");
}

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
    // A LOADER runs a yard, it raises nothing and reads no partner's request
    // list: its portal is the yard board. Only an account that also requests
    // keeps the dashboard. (Typing the URL does not get around it either.)
    if (isYardOnly(roles) && !isYardPath(location.pathname)) {
      throw redirect({ to: "/workspace/customer-portal/loading-site" });
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
      } else if (
        isYardOnly(roles) &&
        !isYardPath(window.location.pathname)
      ) {
        navigate({ to: "/workspace/customer-portal/loading-site" });
      }
    }
  }, [navigate]);

  return <Outlet />;
}
