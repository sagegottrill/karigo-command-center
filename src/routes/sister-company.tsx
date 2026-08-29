import { createFileRoute, Outlet, redirect, Link, useNavigate } from "@tanstack/react-router";
import { authService } from "@/lib/fleetopsx/services";
import { Button } from "@/components/ui/button";
import { LogOut, Truck } from "lucide-react";

export const Route = createFileRoute("/sister-company")({
  beforeLoad: () => {
    const role = authService.getRole();
    if (role !== "Sister Companies (External)") {
      throw redirect({ to: "/login" });
    }
  },
  component: SisterCompanyLayout,
});

function SisterCompanyLayout() {
  const navigate = useNavigate();
  const handleLogout = () => {
    authService.logout();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-card px-6">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 font-bold text-primary">
            <Truck className="h-5 w-5" />
            <span>Sister Company Portal</span>
          </div>
          <nav className="flex gap-4">
            <Link to="/sister-company" className="text-sm font-medium hover:text-primary [&.active]:text-primary">Dashboard</Link>
            <Link to="/sister-company/request" className="text-sm font-medium hover:text-primary [&.active]:text-primary">New Request</Link>
          </nav>
        </div>
        <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
          <LogOut className="h-4 w-4" /> Sign Out
        </Button>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
