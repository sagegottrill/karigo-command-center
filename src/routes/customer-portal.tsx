import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";
import { Route as RootRoute } from "./__root";
import { Button } from "@/components/ui/button";
import { LogOut, Truck } from "lucide-react";

export const Route = createFileRoute("/customer-portal")({
  beforeLoad: () => {
    const role = authService.getRole();
    if (role !== "Customer Portals (External)") {
      throw redirect({ to: "/login" });
    }
  },
  head: ({ routeContext }) => {
    // @ts-ignore
    const tenantName = routeContext?.tenantName || "Workspace";
    return {
      meta: [
        { title: `Partner Portal | ${tenantName}` },
        { name: "description", content: `Partner portal for ${tenantName}` },
      ],
    };
  },
  component: SisterCompanyShell,
});

function SisterCompanyShell() {
  const navigate = useNavigate();
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();

  const handleLogout = () => {
    authService.logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-black/[0.05] bg-white/70 px-4 backdrop-blur-xl sm:px-6">
        <div className="flex items-center gap-3">
          {tenantLogo ? (
            <img src={tenantLogo} alt={tenantName} className="h-7 w-auto object-contain max-w-[140px]" />
          ) : (
            <>
              <div className="grid h-7 w-7 place-items-center rounded bg-[#1d1d1f] text-[11px] font-bold text-white shadow-sm">
                {tenantName.charAt(0)}
              </div>
              <span className="text-[14px] font-bold tracking-tight text-[#1d1d1f]">
                {tenantName}
              </span>
            </>
          )}
        </div>
        <div className="mx-4 h-4 w-px bg-black/10" />
        <span className="text-[13px] font-medium text-muted-foreground uppercase tracking-wider">
          Partner Portal
        </span>
        <nav className="flex flex-1 items-center justify-end gap-4">
          <Link to="/customer-portal" className="text-sm font-medium hover:text-primary [&.active]:text-primary">Dashboard</Link>
          <Link to="/customer-portal/request" className="text-sm font-medium hover:text-primary [&.active]:text-primary">New Request</Link>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
