import { useEffect, useState } from "react";
import { Outlet, createFileRoute, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/components/fleetopsx/app-sidebar";
import { TransportAdminSidebar } from "@/components/fleetopsx/transport-admin-sidebar";
import { AppHeader } from "@/components/fleetopsx/app-header";
import { StaffBottomNav } from "@/components/fleetopsx/staff-bottom-nav";
import { authService } from "@/lib/fleetopsx/services";
import { getToken, clearSession, allowMockFallback } from "@/lib/fleetopsx/apiClient";

const ADMIN_SHELL_PREFIXES = [
  "/workspace/app/add-account",
  "/workspace/app/manage-account",
  "/workspace/app/password-request",
  "/workspace/app/add-partner",
  "/workspace/app/manage-partner",
];

function useAdminShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Figma Admin chrome only on Admin account pages — Overview keeps the live sidebar
  return ADMIN_SHELL_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

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

  const adminShell = useAdminShell();

  return (
    <div className={`flex min-h-screen w-full ${adminShell ? "bg-[#F1F2F4]" : "bg-[#f6f7f9]"}`}>
      {adminShell ? (
        <TransportAdminSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      ) : (
        <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onToggleSidebar={() => setCollapsed((c) => !c)} />
        <main
          className={
            adminShell
              ? "scroll-edge min-w-0 flex-1 overflow-auto pb-20 md:pb-0"
              : "scroll-edge min-w-0 flex-1 overflow-auto px-0 sm:px-5 lg:px-8 py-0 sm:py-5 lg:py-7 pb-20 md:pb-5 lg:pb-7"
          }
        >
          <div className="mx-auto w-full max-w-[1920px]">
            <Outlet />
          </div>
        </main>
        {!adminShell && <StaffBottomNav />}
      </div>
    </div>
  );
}

