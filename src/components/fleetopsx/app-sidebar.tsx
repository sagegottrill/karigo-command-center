import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity, Boxes, ChevronLeft, Fuel, Gauge, LayoutDashboard, LineChart,
  MessageSquare, Radar, ScrollText, Settings, ShieldCheck, Truck, Users, Wrench, Bell, Smartphone
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authService } from "@/lib/fleetopsx/services";

export interface NavItem {
  label: string;
  to: string;
  icon: typeof Truck;
  badge?: number;
  group: string;
}

export const NAV: NavItem[] = [
  { label: "Overview", to: "/app", icon: LayoutDashboard, group: "Main" },
  { label: "Fleet", to: "/app/fleet", icon: Truck, badge: 6, group: "Main" },
  { label: "Trips", to: "/app/trips", icon: Radar, badge: 42, group: "Main" },
  { label: "Engineering", to: "/app/engineering", icon: Wrench, badge: 7, group: "Workshop" },
  { label: "Inventory", to: "/app/inventory", icon: Boxes, badge: 3, group: "Workshop" },
  { label: "Drivers", to: "/app/drivers", icon: Users, group: "People" },
  { label: "Accounts", to: "/app/accounts", icon: Gauge, badge: 18, group: "Finance" },
  { label: "Gate", to: "/app/gate", icon: ShieldCheck, group: "Yard" },
  { label: "Messages", to: "/app/messages", icon: MessageSquare, badge: 11, group: "Inbox" },
  { label: "God View", to: "/app/god-view", icon: LineChart, group: "Insights" },
  { label: "Reports", to: "/app/reports", icon: Activity, group: "Insights" },
  { label: "Notifications", to: "/app/notifications", icon: Bell, badge: 4, group: "Inbox" },
  { label: "Audit", to: "/app/audit", icon: ScrollText, group: "Admin" },
  { label: "Settings", to: "/app/admin", icon: Settings, group: "Admin" },
];

const GROUPS = ["Main", "Workshop", "People", "Finance", "Yard", "Inbox", "Insights", "Admin"];

import { Route as RootRoute } from "../../routes/__root";

export function AppSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();

  const isActive = (to: string) =>
    to === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(to);

  const roleName = authService.getRole();
  const activeRole = authService.getRoles().find(r => r.name === roleName);
  const allowedModules = activeRole?.modules || [];

  const allowedNav = NAV.filter(item => {
    if (allowedModules.includes("All modules")) return true;
    if (item.label === "Overview") return allowedModules.includes("Dashboard") || allowedModules.includes("God View") || true; // always show overview
    
    // Map NAV label to role modules
    const label = item.label;
    if (label === "Fleet" || label === "Dispatch") return allowedModules.includes("Fleet & Dispatch");
    if (label === "Trips") return allowedModules.includes("Trips");
    if (label === "Engineering") return allowedModules.includes("Engineering");
    if (label === "Inventory") return allowedModules.includes("Inventory");
    if (label === "Procurement") return allowedModules.includes("Procurement");
    if (label === "Drivers") return allowedModules.includes("Drivers & HR") || allowedModules.includes("Drivers");
    if (label === "Accounts") return allowedModules.includes("Accounts");
    if (label === "Gate") return allowedModules.includes("Gate & Security");
    if (label === "Messages") return allowedModules.includes("Messages");
    if (label === "God View") return allowedModules.includes("God View");
    if (label === "Reports") return allowedModules.includes("Reports");
    if (label === "Notifications") return true; // everyone gets notifications
    if (label === "Audit" || label === "Settings") return allowedModules.includes("All modules");
    
    return false;
  });

  return (
    <aside
      className={cn(
        "sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-black/[0.05] bg-[#f5f5f7] transition-[width] duration-300 ease-[var(--ease-apple)] md:flex",
        collapsed ? "w-[76px]" : "w-[248px]",
      )}
    >
      <div
        className={cn(
          "flex h-[60px] shrink-0 items-center gap-3 bg-white border-b border-black/[0.05]",
          collapsed ? "justify-center px-2" : "px-3",
        )}
      >
        {tenantLogo ? (
          <img src={tenantLogo} alt={tenantName} className="h-8 w-auto object-contain max-w-[140px]" />
        ) : (
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#1d1d1f] text-[13px] font-bold text-white shadow-sm">
            {tenantName.charAt(0)}
          </div>
        )}
        {!collapsed && !tenantLogo && (
          <span className="truncate text-[14px] font-bold tracking-tight text-[#1d1d1f]">
            {tenantName}
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-4 pt-4">
        {GROUPS.map((group) => {
          const items = allowedNav.filter((n) => n.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="mb-4">
              {!collapsed && (
                <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-[0.04em] text-muted-foreground/80 uppercase">
                  {group}
                </p>
              )}
              <ul className="space-y-1">
                {items.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "relative flex items-center gap-2.5 rounded-full px-3 py-2 text-[13px] font-medium transition-colors duration-150 active:scale-[0.98]",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-[#1d1d1f] text-white shadow-[0_1px_2px_rgba(0,0,0,0.14)]"
                            : "text-[#3a3a3c] hover:bg-black/[0.045] hover:text-foreground",
                        )}
                      >
                        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                          <item.icon className="h-[17px] w-[17px]" strokeWidth={active ? 2.2 : 1.7} />
                          {collapsed && item.badge ? (
                            <span className="absolute -top-0.5 -right-1 h-1.5 w-1.5 rounded-full bg-[#1d1d1f]" />
                          ) : null}
                        </span>
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                        {!collapsed && item.badge ? (
                          <span
                            className={cn(
                              "num shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                              active ? "bg-white/15 text-white" : "bg-black/[0.06] text-muted-foreground",
                            )}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-black/[0.05] p-2.5 space-y-1">
        <Link
          to="/pwa/$tenantId"
          params={{ tenantId: "petroline" }}
          target="_blank"
          className={cn(
            "flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-[12px] font-medium text-blue-600 transition-colors hover:bg-blue-50 active:scale-[0.98]",
            collapsed && "justify-center px-0",
          )}
        >
          <Smartphone className="h-4 w-4 shrink-0" />
          {!collapsed && <span>View Customer App</span>}
        </Link>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-black/[0.045] hover:text-foreground active:scale-[0.98]",
            collapsed && "justify-center px-0",
          )}
        >
          <ChevronLeft
            className={cn(
              "h-4 w-4 shrink-0 transition-transform duration-300 ease-[var(--ease-apple)]",
              collapsed && "rotate-180",
            )}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
