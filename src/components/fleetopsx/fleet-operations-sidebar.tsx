import { Link, useRouterState } from "@tanstack/react-router";
import { Bell, ClipboardList, History, LogOut, MoreVertical, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { authService, notificationService } from "@/lib/fleetopsx/services";
import { getToken } from "@/lib/fleetopsx/apiClient";
import { cn } from "@/lib/utils";
import { Route as RootRoute } from "../../routes/__root";

type FoNavItem = {
  label: string;
  to: string;
  icon: typeof Truck;
};

/** Figma Fleet Operations sidebar — OPERATIONS group */
const FO_NAV: FoNavItem[] = [
  { label: "Fleet Dispatch", to: "/workspace/app/dispatch", icon: ClipboardList },
  { label: "Manage Fleet", to: "/workspace/app/fleet-registry", icon: Truck },
  { label: "Dispatch History", to: "/workspace/app/dispatch-history", icon: History },
  { label: "Notifications", to: "/workspace/app/notifications", icon: Bell },
];

function isPathActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function FleetOperationsSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();
  const [showLogout, setShowLogout] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setUnread(0);
      return;
    }
    void notificationService
      .getUnreadCount()
      .then((count) => {
        if (!cancelled) setUnread(count);
      })
      .catch(() => {
        if (!cancelled) setUnread(0);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const currentUser = authService.getCurrentUser();
  const userName = mounted && currentUser?.name ? currentUser.name : "J.Doe";
  const userEmail = mounted && currentUser?.email ? currentUser.email : "j.doe@gmail.com";
  const userInitials = mounted && currentUser?.initials ? currentUser.initials : "JD";
  const logoSrc = tenantLogo || "/figma/petroline-logo.png";

  const handleLogout = () => {
    authService.logout();
  };

  return (
    <>
      {!collapsed && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onToggle} />}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col bg-[#1B2432] transition-all duration-300 md:sticky md:top-0",
          collapsed ? "-translate-x-full md:translate-x-0 md:w-[80px]" : "translate-x-0 w-[240px]",
        )}
      >
        <Link
          to="/workspace/account-type"
          className={cn(
            "flex w-full items-end px-5 py-2",
            collapsed ? "justify-center px-2" : "justify-end",
          )}
        >
          <img
            src={logoSrc}
            alt={tenantName || "Petroline"}
            className={cn("object-contain", collapsed ? "h-10 w-10" : "h-[60px] w-[107px]")}
          />
        </Link>

        <nav className="sleek-scrollbar flex flex-1 flex-col items-center overflow-y-auto py-5">
          <div className={cn("flex w-full flex-col gap-[5px]", collapsed ? "items-center px-2" : "w-[224px]")}>
            {!collapsed && (
              <span className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-white/70">
                operations
              </span>
            )}
            {FO_NAV.map((item) => {
              const active = isPathActive(pathname, item.to);
              const Icon = item.icon;
              const showBadge = item.to.includes("notifications") && unread > 0;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex h-8 items-center gap-2 overflow-hidden rounded p-2",
                    collapsed ? "w-8 justify-center" : "w-full",
                    active ? "bg-[#ED351D]" : "hover:bg-white/5",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-white" strokeWidth={1.5} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate text-[14px] font-normal leading-5 tracking-[0.4px] text-white">
                        {item.label}
                      </span>
                      {showBadge && (
                        <span
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-[10px] text-[12px] tracking-[0.4px]",
                            active ? "bg-white text-[#ED351D]" : "bg-[#ED351D] text-white",
                          )}
                        >
                          {unread > 9 ? "9+" : unread}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="w-full p-2">
          {showLogout && (
            <button
              type="button"
              onClick={handleLogout}
              className="mb-2 flex h-10 w-full items-center justify-center gap-2 rounded border border-[#ED351D] bg-[#ED351D]/10 text-[14px] font-medium text-[#ED351D]"
            >
              <LogOut className="size-3.5" />
              {!collapsed && "Log Out"}
            </button>
          )}
          <div className={cn("flex h-12 items-center gap-2 overflow-hidden rounded p-2", collapsed && "justify-center")}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#F1F2F4]">
              <span className="text-[14px] font-normal tracking-[0.4px] text-[#5C6470]">{userInitials}</span>
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-medium leading-[17.5px] tracking-[0.4px] text-white">{userName}</p>
                  <p className="truncate text-[12px] font-normal leading-4 tracking-[0.4px] text-[#5C6470]">{userEmail}</p>
                </div>
                <button type="button" onClick={() => setShowLogout((v) => !v)} className="shrink-0 p-0.5">
                  <MoreVertical className="size-4 text-white/70" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

/** Primary FO role without Transport Manager — use Figma FO chrome */
export function shouldUseFleetOpsShell(roles: string[]) {
  return roles.includes("Fleet Operations") && !roles.includes("Transport Manager");
}

/** Figma FO mobile bottom tab bar (390 frames) */
export function FleetOperationsMobileNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      setUnread(0);
      return;
    }
    void notificationService
      .getUnreadCount()
      .then((count) => {
        if (!cancelled) setUnread(count);
      })
      .catch(() => {
        if (!cancelled) setUnread(0);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[64px] items-stretch border-t border-[#344256] bg-[#1B2432] md:hidden">
      {FO_NAV.map((item) => {
        const active = isPathActive(pathname, item.to);
        const Icon = item.icon;
        const showBadge = item.to.includes("notifications") && unread > 0;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 px-1",
              active ? "text-white" : "text-white/50",
            )}
          >
            <span className="relative">
              <Icon className="size-5" strokeWidth={1.5} />
              {showBadge && (
                <span className="absolute -right-2 -top-1 grid size-4 place-items-center rounded-full bg-[#ED351D] text-[9px] text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
            <span className="text-[10px] font-medium leading-tight">{item.label.replace("Fleet ", "").replace("Manage ", "")}</span>
            {active && <span className="absolute bottom-1 h-0.5 w-8 rounded bg-white" />}
          </Link>
        );
      })}
    </nav>
  );
}
