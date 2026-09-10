import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { HelpCircle, LayoutDashboard, LogOut, MoreVertical, Truck, UserCog, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { authService } from "@/lib/fleetopsx/services";
import { NAV } from "@/components/fleetopsx/app-sidebar";
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

/** Figma Admin sidebar — Overview is the live dashboard, not “Central Dashboard” */
const ADMIN_GROUPS: AdminNavGroup[] = [
  {
    items: [{ label: "Overview", to: "/workspace/app", icon: LayoutDashboard }],
  },
  {
    label: "PARTNER Account",
    items: [
      { label: "New Account", to: "/workspace/app/add-partner", icon: UserPlus },
      { label: "Account Management", to: "/workspace/app/manage-partner", icon: UserCog },
      { label: "Partner Requests", to: "/workspace/app/manage-partner", icon: HelpCircle, dot: true },
    ],
  },
  {
    label: "INTERNAL Account",
    items: [
      { label: "New Account", to: "/workspace/app/add-account", icon: UserPlus },
      { label: "Account Management", to: "/workspace/app/manage-account", icon: UserCog },
      { label: "Password Request", to: "/workspace/app/password-request", icon: HelpCircle },
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

const FIGMA_PATHS = new Set(ADMIN_GROUPS.flatMap((g) => g.items.map((i) => i.to)));

/** Live modules that are not on the Figma Admin sidebar — folded under More */
const EXTRA_ITEMS: AdminNavItem[] = NAV.filter((item) => !FIGMA_PATHS.has(item.to)).map((item) => ({
  label: item.label,
  to: item.to,
  icon: LayoutDashboard,
}));

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
  const navigate = useNavigate();
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();
  const [showLogout, setShowLogout] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [extrasOpen, setExtrasOpen] = useState(false);

  const onExtraRoute = EXTRA_ITEMS.some((item) => isPathActive(pathname, item.to));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (onExtraRoute) setExtrasOpen(true);
  }, [onExtraRoute]);

  const currentUser = authService.getCurrentUser();
  const userName = mounted && currentUser?.name ? currentUser.name : "J.Doe";
  const userEmail = mounted && currentUser?.email ? currentUser.email : "j.doe@gmail.com";
  const userInitials = mounted && currentUser?.initials ? currentUser.initials : "JD";
  const logoSrc = tenantLogo || "/figma/petroline-logo.png";

  const handleLogout = () => {
    authService.logout();
    navigate({ to: "/workspace/login" });
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
            src={logoSrc}
            alt={tenantName || "Petroline"}
            className={cn("object-contain", collapsed ? "h-10 w-10" : "h-[60px] w-[107px]")}
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

            {/* Extras fold — modules not in Figma Admin sidebar */}
            {!collapsed && (
              <div className="flex w-full flex-col gap-[5px] pt-2">
                <button
                  type="button"
                  onClick={() => setExtrasOpen((o) => !o)}
                  className="text-left text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-white/70 hover:text-white"
                >
                  More {extrasOpen ? "−" : "+"}
                </button>
                {extrasOpen &&
                  EXTRA_ITEMS.map((item) => {
                    const active = isPathActive(pathname, item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "flex h-8 items-center gap-2 overflow-hidden rounded p-2",
                          active ? "bg-[#ED351D]" : "hover:bg-white/5",
                        )}
                      >
                        <span className="truncate text-[14px] font-normal leading-5 tracking-[0.4px] text-white">
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
              </div>
            )}
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
