import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Briefcase,
  CircleHelp,
  CirclePlus,
  LayoutDashboard,
  List,
  LogOut,
  MoreVertical,
  Truck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { authService, notificationService } from "@/lib/fleetopsx/services";
import { getToken } from "@/lib/fleetopsx/apiClient";
import { Route as RootRoute } from "../../routes/__root";

type AdminNavItem = {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  dot?: boolean;
};

type AdminNavGroup = {
  label?: string;
  items: AdminNavItem[];
};

/** Figma Admin sidebar — Central Dashboard + circle-outline plus for New Account */
const ADMIN_GROUPS: AdminNavGroup[] = [
  {
    items: [{ label: "Central Dashboard", to: "/workspace/app", icon: LayoutDashboard }],
  },
  {
    label: "PARTNER Account",
    items: [
      { label: "New Account", to: "/workspace/app/add-partner", icon: CirclePlus },
      { label: "Account Management", to: "/workspace/app/manage-partner", icon: Users },
      { label: "Partner Requests", to: "/workspace/app/partner-requests", icon: CircleHelp, dot: true },
    ],
  },
  {
    label: "INTERNAL Account",
    items: [
      { label: "New Account", to: "/workspace/app/add-account", icon: CirclePlus },
      { label: "Account Management", to: "/workspace/app/manage-account", icon: Users },
      { label: "Password Request", to: "/workspace/app/password-request", icon: CircleHelp },
    ],
  },
  {
    label: "DEPARTMENTS",
    items: [
      { label: "Fleet Operation", to: "/workspace/app/fleet", icon: Truck, dot: true },
      { label: "HR & Personnel", to: "/workspace/app/hr", icon: Users },
    ],
  },
];

function isPathActive(pathname: string, to: string) {
  if (to === "/workspace/app") return pathname === "/workspace/app" || pathname === "/workspace/app/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function TransportAdminSidebar({
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

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentUser = authService.getCurrentUser();
  const userName = mounted && currentUser?.name ? currentUser.name : "";
  const userEmail = mounted && currentUser?.email ? currentUser.email : "";
  const userInitials = mounted && currentUser?.initials ? currentUser.initials : "";
  const logoSrc = tenantLogo || "/figma/petroline-logo.png";
  const [logoBroken, setLogoBroken] = useState(false);
  const displayLogo = logoBroken ? "/figma/petroline-logo.png" : logoSrc;

  const handleLogout = () => {
    authService.logout();
  };

  return (
    <>
      {!collapsed && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={onToggle} />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col bg-[#1B2432] transition-all duration-300 md:sticky md:top-0",
          collapsed ? "-translate-x-full md:translate-x-0 md:w-[80px]" : "translate-x-0 w-[240px]",
        )}
      >
        {/* Logo — Figma 107×60 in 20px padded container */}
        <Link
          to="/workspace/account-type"
          className={cn(
            "flex w-full items-end px-5 py-2",
            collapsed ? "justify-center px-2" : "justify-end",
          )}
        >
          <img
            src={displayLogo}
            alt={tenantName || "Petroline"}
            className={cn("object-contain", collapsed ? "h-10 w-10" : "h-[60px] w-[107px]")}
            onError={() => setLogoBroken(true)}
          />
        </Link>

        <nav className="sleek-scrollbar flex flex-1 flex-col items-center overflow-y-auto py-5">
          <div className={cn("flex w-full flex-col gap-5", collapsed ? "items-center px-2" : "w-[224px]")}>
            {ADMIN_GROUPS.map((group, gi) => (
              <div key={group.label ?? `top-${gi}`} className="flex w-full flex-col gap-[5px]">
                {group.label && !collapsed && (
                  <span className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-white/70">
                    {group.label}
                  </span>
                )}
                {group.items.map((item) => {
                  const active = isPathActive(pathname, item.to);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={`${group.label}-${item.label}-${item.to}`}
                      to={item.to}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex h-8 items-center gap-2 overflow-hidden rounded p-2",
                        collapsed ? "w-8 justify-center" : "w-full",
                        active ? "bg-[#ED351D]" : "hover:bg-white/5",
                      )}
                    >
                      <Icon
                        className={cn("size-4 shrink-0", active ? "text-white" : "text-white")}
                        strokeWidth={1.5}
                      />
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate text-[14px] font-normal leading-5 tracking-[0.4px] text-white">
                            {item.label}
                          </span>
                          {item.dot && <span className="size-2.5 shrink-0 rounded-[10px] bg-[#ED351D]" />}
                        </>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}
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

/** Figma Admin mobile bottom tab bar (472:17760) */
const ADMIN_MOBILE_NAV = [
  { label: "Dashboard", to: "/workspace/app", icon: LayoutDashboard, match: ["exact"] as const },
  {
    label: "Partners",
    to: "/workspace/app/manage-partner",
    icon: Briefcase,
    matchPrefixes: ["/workspace/app/manage-partner", "/workspace/app/add-partner", "/workspace/app/partner-requests"],
  },
  {
    label: "Internal Staff",
    to: "/workspace/app/manage-account",
    icon: Users,
    matchPrefixes: ["/workspace/app/manage-account", "/workspace/app/add-account", "/workspace/app/password-request"],
  },
  {
    label: "Department",
    to: "/workspace/app/fleet",
    icon: List,
    matchPrefixes: ["/workspace/app/fleet", "/workspace/app/hr"],
  },
  { label: "Notification", to: "/workspace/app/notifications", icon: Bell, matchPrefixes: ["/workspace/app/notifications"] },
] as const;

function isMobileNavActive(pathname: string, item: (typeof ADMIN_MOBILE_NAV)[number]) {
  if ("match" in item && item.match?.[0] === "exact") {
    return pathname === "/workspace/app" || pathname === "/workspace/app/";
  }
  if ("matchPrefixes" in item && item.matchPrefixes) {
    return item.matchPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }
  return isPathActive(pathname, item.to);
}

export function TransportAdminMobileNav() {
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
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[74px] items-stretch bg-[#1B2432] px-2 py-1 shadow-[0px_4px_4px_rgba(0,0,0,0.15),0px_1px_1.5px_rgba(0,0,0,0.3)] md:hidden">
      {ADMIN_MOBILE_NAV.map((item) => {
        const active = isMobileNavActive(pathname, item);
        const Icon = item.icon;
        const showBadge = item.to.includes("notifications") && unread > 0;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 px-0.5",
              active ? "border-b-[5px] border-white text-white" : "text-white/70",
            )}
          >
            <span className="relative">
              <Icon className="size-5" strokeWidth={1.5} />
              {showBadge && (
                <span className="absolute -right-3 -top-1 grid size-4 place-items-center rounded-[10px] bg-[#ED351D] text-[10px] font-medium text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </span>
            <span className="w-full text-center text-[10px] font-medium leading-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
