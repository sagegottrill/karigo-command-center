import { useEffect, useState } from "react";
import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { AppSidebar } from "@/components/fleetopsx/app-sidebar";
import { AppHeader } from "@/components/fleetopsx/app-header";
import { PageReveal } from "@/components/fleetopsx/page-reveal";
import { cn } from "@/lib/utils";
import { authService } from "@/lib/fleetopsx/services";

export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    if (!authService.getCurrentUser()) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppShell,
});
function AppShell() {
  const [collapsed, setCollapsed] = useState(false);

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
    <div className="flex min-h-screen w-full bg-[#f5f5f7]">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onToggleSidebar={() => setCollapsed((c) => !c)} />
        <main
          className={cn(
            "scroll-edge min-w-0 flex-1 overflow-auto px-4 py-5 sm:px-5 lg:px-8 lg:py-7",
          )}
        >
          <div className="mx-auto max-w-[1480px]">
            <PageReveal>
              <Outlet />
            </PageReveal>
          </div>
        </main>
      </div>
    </div>
  );
}
