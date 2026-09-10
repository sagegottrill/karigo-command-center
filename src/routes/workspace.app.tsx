import { useEffect, useState } from "react";
import { Outlet, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AppSidebar } from "@/components/fleetopsx/app-sidebar";
import { AppHeader } from "@/components/fleetopsx/app-header";
import { StaffBottomNav } from "@/components/fleetopsx/staff-bottom-nav";
import { cn } from "@/lib/utils";
import { authService } from "@/lib/fleetopsx/services";
import { getToken, clearSession, allowMockFallback } from "@/lib/fleetopsx/apiClient";
import { useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/workspace/app")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const user = authService.getCurrentUser();
    const hasLiveToken = !!getToken();

    // Live mode requires a JWT — clear stale mock/local sessions that only have a user profile
    if (!allowMockFallback() && user && !hasLiveToken) {
      clearSession();
      throw redirect({ to: "/workspace/login" });
    }

    if (!user || (!allowMockFallback() && !hasLiveToken)) {
      throw redirect({ to: "/workspace/login" });
    }
    
    // Enforce forced password reset before accessing any app dashboard route
    if (user.passwordResetRequired) {
      throw redirect({ to: "/workspace/forgot-password" });
    }
    
    // Block External Partners from Staff Workspace
    const roles = authService.getRoles();
    if (roles.includes("Customer Portals (External)")) {
      throw redirect({ to: "/workspace/customer-portal/dashboard" });
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

  const matches = useRouterState({ select: (s) => s.matches });
  return (
    <div className="flex min-h-screen w-full bg-[#f6f7f9]">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onToggleSidebar={() => setCollapsed((c) => !c)} />
        <main
          className="scroll-edge min-w-0 flex-1 overflow-auto px-0 sm:px-5 lg:px-8 py-0 sm:py-5 lg:py-7 pb-20 md:pb-5 lg:pb-7"
        >
          <div className="mx-auto w-full max-w-[1920px]">
            <Outlet />
          </div>
        </main>
        <StaffBottomNav />
      </div>
    </div>
  );
}

