import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity, Boxes, ChevronLeft, Fuel, Gauge, LayoutDashboard, LineChart,
  MessageSquare, Radar, ScrollText, Settings, ShieldCheck, Truck, Users, Wrench, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
  label: string;
  to: string;
  icon: typeof Truck;
  badge?: number;
  group: string;
}

export const NAV: NavItem[] = [
  { label: "Dashboard", to: "/app", icon: LayoutDashboard, group: "Operations" },
  { label: "Fleet & Dispatch", to: "/app/fleet", icon: Truck, badge: 6, group: "Operations" },
  { label: "Trips", to: "/app/trips", icon: Radar, badge: 42, group: "Operations" },
  { label: "Fuel", to: "/app/fuel", icon: Fuel, badge: 5, group: "Operations" },
  { label: "Engineering", to: "/app/engineering", icon: Wrench, badge: 7, group: "Maintenance" },
  { label: "Inventory", to: "/app/inventory", icon: Boxes, badge: 3, group: "Maintenance" },
  { label: "Drivers & HR", to: "/app/drivers", icon: Users, group: "People" },
  { label: "Accounts", to: "/app/accounts", icon: Gauge, badge: 18, group: "Finance" },
  { label: "Gate & Security", to: "/app/gate", icon: ShieldCheck, group: "Security" },
  { label: "Messages", to: "/app/messages", icon: MessageSquare, badge: 11, group: "Collaboration" },
  { label: "God View", to: "/app/god-view", icon: LineChart, group: "Intelligence" },
  { label: "Reports", to: "/app/reports", icon: Activity, group: "Intelligence" },
  { label: "Notifications", to: "/app/notifications", icon: Bell, badge: 4, group: "Intelligence" },
  { label: "Audit Logs", to: "/app/audit", icon: ScrollText, group: "Governance" },
  { label: "Administration", to: "/app/admin", icon: Settings, group: "Governance" },
];

const GROUPS = ["Operations", "Maintenance", "People", "Finance", "Security", "Collaboration", "Intelligence", "Governance"];

export function AppSidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string) =>
    to === "/app" ? pathname === "/app" || pathname === "/app/" : pathname.startsWith(to);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 md:flex",
        collapsed ? "w-[68px]" : "w-[248px]",
      )}
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          K
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[0.18em] text-sidebar-foreground uppercase">Karigo</p>
            <p className="num truncate text-[10px] text-muted-foreground">TMS v1.0 · PTL-001</p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        {GROUPS.map((group) => {
          const items = NAV.filter((n) => n.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="mb-3">
              {!collapsed && (
                <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                  {group}
                </p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-md px-2 py-2 text-[13px] font-medium transition-colors",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <span className={cn("relative flex h-5 w-5 shrink-0 items-center justify-center", active && "text-primary")}>
                          <item.icon className="h-4 w-4" />
                          {collapsed && item.badge ? (
                            <span className="absolute -top-1 -right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                          ) : null}
                        </span>
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                        {!collapsed && item.badge ? (
                          <span className="num shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            {item.badge}
                          </span>
                        ) : null}
                        {active && <span className="absolute left-0 h-5 w-0.5 rounded-r bg-primary" />}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2.5">
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <ChevronLeft className={cn("h-4 w-4 shrink-0 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && <span>Collapse sidebar</span>}
        </button>
      </div>
    </aside>
  );
}
