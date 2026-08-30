import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";
import { Button } from "@/components/ui/button";
import { LogOut, Truck } from "lucide-react";

export const Route = createFileRoute("/customer-portal/_auth")({
  beforeLoad: () => {
    const role = authService.getRole();
    if (role !== "Customer Portals (External)") {
      throw redirect({ to: "/customer-portal/login" });
    }
  },
  component: CustomerPortalAuthShell,
});

function CustomerPortalAuthShell() {
  const navigate = useNavigate();
  const handleLogout = () => {
    authService.logout();
    navigate({ to: "/customer-portal/login" });
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#f5f5f7]">
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-black/[0.05] bg-white px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black text-white">
              <Truck className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Partner Portal</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              to="/customer-portal/dashboard"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground"
            >
              Dashboard
            </Link>
            <Link
              to="/customer-portal/request"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground"
            >
              New Request
            </Link>
          </nav>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground">
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </header>
      <main className="flex-1 p-6">
        <div className="mx-auto max-w-[1200px]">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
