import { useEffect, useState } from "react";
import { Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { FleetOperationsSidebar, shouldUseFleetOpsShell } from "@/components/fleetopsx/fleet-operations-sidebar";
import { TransportAdminSidebar } from "@/components/fleetopsx/transport-admin-sidebar";
import { AppHeader } from "@/components/fleetopsx/app-header";
import { authService } from "@/lib/fleetopsx/services";
import { getToken, clearSession, allowMockFallback } from "@/lib/fleetopsx/apiClient";

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

    // Figma FO home is Dispatch Queue, not Admin Overview
    const path = location.pathname;
    if (
      shouldUseFleetOpsShell(roles) &&
      (path === "/workspace/app" || path === "/workspace/app/")
    ) {
      throw redirect({ to: "/workspace/app/dispatch" });
    }
  },
  component: AppShell,
});

function AppShell() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") return window.innerWidth < 768;
    return false;
  });
  const [useFoShell] = useState(() => {
    if (typeof window === "undefined") return false;
    return shouldUseFleetOpsShell(authService.getRoles());
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const user = authService.getCurrentUser();
    if (!user) {
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
      {useFoShell ? (
        <FleetOperationsSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      ) : (
        <TransportAdminSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onToggleSidebar={() => setCollapsed((c) => !c)} forceFleetOps={useFoShell} />
        <main className="scroll-edge min-w-0 flex-1 overflow-auto pb-20 md:pb-0">
          <div className="mx-auto w-full max-w-[1920px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
