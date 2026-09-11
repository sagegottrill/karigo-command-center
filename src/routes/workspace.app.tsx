import { useEffect, useState } from "react";
import { Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import {
  FleetOperationsMobileNav,
  FleetOperationsSidebar,
  shouldUseFleetOpsShell,
} from "@/components/fleetopsx/fleet-operations-sidebar";
import {
  GateSecurityMobileNav,
  GateSecuritySidebar,
  shouldUseGateSecurityShell,
} from "@/components/fleetopsx/gate-security-sidebar";
import {
  TrackingOperationsMobileNav,
  TrackingOperationsSidebar,
  shouldUseTrackingOpsShell,
} from "@/components/fleetopsx/tracking-operations-sidebar";
import {
  TransportAdminMobileNav,
  TransportAdminSidebar,
} from "@/components/fleetopsx/transport-admin-sidebar";
import { AppHeader } from "@/components/fleetopsx/app-header";
import { authService } from "@/lib/fleetopsx/services";
import { getToken, clearSession, allowMockFallback } from "@/lib/fleetopsx/apiClient";
import { installSessionGuards } from "@/lib/fleetopsx/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const user = authService.getCurrentUser();
    const hasLiveToken = !!getToken();

    if (!allowMockFallback() && user && !hasLiveToken) {
      clearSession();
      throw redirect({ to: "/workspace/login" });
    }

    if (!user || (!allowMockFallback() && !hasLiveToken)) {
      throw redirect({ to: "/workspace/login" });
    }

    if (user.passwordResetRequired) {
      throw redirect({ to: "/workspace/forgot-password" });
    }

    const roles = authService.getRoles();
    if (roles.includes("Customer Portals (External)")) {
      throw redirect({ to: "/workspace/customer-portal/dashboard" });
    }

    const path = location.pathname;
    if (
      shouldUseFleetOpsShell(roles) &&
      (path === "/workspace/app" || path === "/workspace/app/")
    ) {
      throw redirect({ to: "/workspace/app/dispatch" });
    }
    if (
      shouldUseGateSecurityShell(roles) &&
      (path === "/workspace/app" || path === "/workspace/app/")
    ) {
      throw redirect({ to: "/workspace/app/gate" });
    }
    if (
      shouldUseTrackingOpsShell(roles) &&
      (path === "/workspace/app" || path === "/workspace/app/")
    ) {
      throw redirect({ to: "/workspace/app/active-dispatch" });
    }
  },
  component: AppShell,
});

function AppShell() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [useFoShell, setUseFoShell] = useState(false);
  const [useGateShell, setUseGateShell] = useState(false);
  const [useTrackingShell, setUseTrackingShell] = useState(false);
  const [shellReady, setShellReady] = useState(false);

  useEffect(() => {
    setCollapsed(window.innerWidth < 768);
    const roles = authService.getRoles();
    setUseFoShell(shouldUseFleetOpsShell(roles));
    setUseGateShell(shouldUseGateSecurityShell(roles));
    setUseTrackingShell(shouldUseTrackingOpsShell(roles));
    setShellReady(true);
  }, []);

  useEffect(() => {
    return installSessionGuards();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const user = authService.getCurrentUser();
    if (!user || !getToken()) {
      navigate({ to: "/workspace/login" });
    } else if (user.passwordResetRequired) {
      navigate({ to: "/workspace/forgot-password" });
    } else if (authService.getRoles().includes("Customer Portals (External)")) {
      navigate({ to: "/workspace/customer-portal/dashboard" });
    }
  }, [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCollapsed((c) => !c);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen w-full bg-[#F1F2F4]">
      {useGateShell ? (
        <GateSecuritySidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      ) : useTrackingShell ? (
        <TrackingOperationsSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      ) : useFoShell ? (
        <FleetOperationsSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      ) : (
        <TransportAdminSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          onToggleSidebar={() => setCollapsed((c) => !c)}
          forceFleetOps={shellReady ? useFoShell : false}
          forceTrackingOps={shellReady ? useTrackingShell : false}
          forceGateSecurity={shellReady ? useGateShell : false}
        />
        <main
          className={cn(
            "scroll-edge min-w-0 flex-1 overflow-auto",
            "pb-24 md:pb-0",
          )}
        >
          <div className="mx-auto w-full max-w-[1920px]">
            <Outlet />
          </div>
        </main>
        {useGateShell ? (
          <GateSecurityMobileNav />
        ) : useTrackingShell ? (
          <TrackingOperationsMobileNav />
        ) : useFoShell ? (
          <FleetOperationsMobileNav />
        ) : (
          <TransportAdminMobileNav />
        )}
      </div>
    </div>
  );
}
