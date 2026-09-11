import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, MoreVertical, Truck } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { authService, tenantService } from "@/lib/fleetopsx/services";
import { getTenantSlug } from "@/lib/fleetopsx/hostname";
import { cn } from "@/lib/utils";
import { Route as RootRoute } from "../../routes/__root";

/** Shared Figma Partner Portal chrome (sidebar + header) */
export function PartnerPortalShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { tenantLogo, tenantName } = RootRoute.useRouteContext();
  const currentUser = authService.getCurrentUser();
  const [showLogout, setShowLogout] = useState(false);
  const [logoSrc, setLogoSrc] = useState(tenantLogo || "/figma/petroline-logo.png");

  useEffect(() => {
    const slug = typeof window !== "undefined" ? getTenantSlug() : "petrolline";
    if (slug && slug !== "localhost" && slug !== "fleetopsx") {
      void tenantService
        .getBySlug(slug)
        .then((t) => {
          if (t?.logo) setLogoSrc(t.logo);
        })
        .catch(() => undefined);
    }
  }, []);

  const companyName = currentUser?.partnerCompanyName || currentUser?.name || "Partner";
  const userEmail = currentUser?.email || "";
  const userInitials = currentUser?.initials || "PT";

  const handleLogout = () => {
    authService.logout();
    navigate({ to: "/workspace/customer-portal/login" });
  };

  const dashActive = pathname.includes("/dashboard");
  const requestActive = pathname.includes("/request");

  return (
    <div className="flex min-h-screen w-full bg-[#F1F2F4]">
      <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 flex-col bg-[#1B2432] lg:flex">
        <Link to="/workspace/account-type" className="flex w-full items-end justify-end px-5 py-2">
          <img src={logoSrc} alt={tenantName || "Petroline"} className="h-[60px] w-[107px] object-contain" />
        </Link>
        <nav className="flex flex-1 flex-col items-center py-5">
          <div className="flex w-[224px] flex-col gap-[5px]">
            <span className="text-[11.4px] uppercase tracking-[0.4px] text-white/70">Transport Request</span>
            <Link
              to="/workspace/customer-portal/dashboard"
              className={cn("flex h-8 items-center gap-2 rounded p-2", dashActive ? "bg-[#ED351D]" : "hover:bg-white/5")}
            >
              <LayoutDashboard className="size-4 text-white" strokeWidth={1.5} />
              <span className="text-[14px] tracking-[0.4px] text-white">Dashboard</span>
            </Link>
            <Link
              to="/workspace/customer-portal/request"
              className={cn(
                "flex h-8 items-center gap-2 rounded p-2",
                requestActive ? "bg-[#ED351D]" : "hover:bg-white/5",
              )}
            >
              <Truck className="size-4 text-white" strokeWidth={1.5} />
              <span className="text-[14px] tracking-[0.4px] text-white">New Request</span>
            </Link>
          </div>
        </nav>
        <div className="p-2">
          {showLogout && (
            <button
              type="button"
              onClick={handleLogout}
              className="mb-2 flex h-10 w-full items-center justify-center gap-2 rounded border border-[#ED351D] bg-white text-[14px] font-medium text-[#ED351D]"
            >
              <LogOut className="size-3.5" />
              Log Out
            </button>
          )}
          <div className="flex h-12 items-center gap-2 rounded p-2">
            <div className="grid size-8 place-items-center rounded-md bg-[#F1F2F4] text-[14px] text-[#5C6470]">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium text-white">{companyName}</p>
              <p className="truncate text-[12px] text-[#5C6470]">{userEmail}</p>
            </div>
            <button type="button" onClick={() => setShowLogout((v) => !v)} className="p-0.5">
              <MoreVertical className="size-4 text-white/70" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex w-full flex-col bg-white px-5 pb-2.5 pt-5 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.3),0px_2px_6px_2px_rgba(0,0,0,0.15)]">
          <h1 className="text-[24px] font-medium leading-8 text-[#1B2432]">Partner Portal</h1>
          <p className="text-[11.4px] uppercase tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Manage the lifecycle of every account within the company to maintain data integrity.
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}
