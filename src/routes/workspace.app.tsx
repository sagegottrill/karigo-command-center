import { useEffect, useState } from "react";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/fleetopsx/app-sidebar";
import { AppHeader } from "@/components/fleetopsx/app-header";
import { cn } from "@/lib/utils";
import { authService } from "@/lib/fleetopsx/services";
import { useRouterState } from "@tanstack/react-router";

export const Route = createFileRoute("/workspace/app")({
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const user = authService.getCurrentUser();
    
    // Strict enforcement: no user = redirect to login immediately
    if (!user) {
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
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== "undefined") return window.innerWidth < 768;
    return false;
  });

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
  const isDispatchModule = matches.some((m) => m.pathname === "/workspace/app/dispatch");

  return (
    <div className="flex min-h-screen w-full bg-[#f6f7f9]">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!isDispatchModule && <AppHeader onToggleSidebar={() => setCollapsed((c) => !c)} />}
        <main
          className={cn(
            "scroll-edge min-w-0 flex-1 overflow-auto",
            !isDispatchModule && "px-4 py-5 sm:px-5 lg:px-8 lg:py-7"
          )}
        >
          <div className="mx-auto w-full max-w-[1920px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

