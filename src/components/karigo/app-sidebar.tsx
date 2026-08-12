import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Activity, Boxes, ChevronLeft, Fuel, Gauge, LayoutDashboard, LineChart,
  MessageSquare, Radar, ScrollText, Settings, ShieldCheck, Truck, Users, Wrench, Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { appleSpring } from "@/lib/karigo/apple-motion";

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
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 252 }}
      transition={appleSpring.chrome}
      className="glass-heavy sticky top-0 z-20 hidden h-screen shrink-0 flex-col md:flex"
    >
      <div className="flex h-14 items-center gap-2.5 px-3.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-primary text-[13px] font-semibold text-primary-foreground shadow-[0_1px_2px_rgba(0,113,227,0.35)]">
          K
        </span>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={appleSpring.press}
            className="min-w-0"
          >
            <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-sidebar-foreground">Karigo</p>
            <p className="num truncate text-[11px] text-muted-foreground">TMS · PTL-001</p>
          </motion.div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 pb-3">
        {GROUPS.map((group) => {
          const items = NAV.filter((n) => n.group === group);
          if (!items.length) return null;
          return (
            <div key={group} className="mb-3.5">
              {!collapsed && (
                <p className="label-sm px-2.5 pb-1.5">{group}</p>
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
                          "relative flex items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-[13px] font-medium transition-colors duration-150",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/75 hover:bg-black/[0.035] hover:text-sidebar-foreground",
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="nav-active"
                            className="absolute inset-0 rounded-[11px] bg-sidebar-accent"
                            transition={appleSpring.chrome}
                            style={{ zIndex: -1 }}
                          />
                        )}
                        <span className={cn("relative flex h-5 w-5 shrink-0 items-center justify-center", active && "text-primary")}>
                          <item.icon className="h-[17px] w-[17px]" strokeWidth={active ? 2.25 : 1.75} />
                          {collapsed && item.badge ? (
                            <span className="absolute -top-0.5 -right-1 h-1.5 w-1.5 rounded-full bg-primary" />
                          ) : null}
                        </span>
                        {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                        {!collapsed && item.badge ? (
                          <span className="num shrink-0 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
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

      <div className="border-t border-sidebar-border/80 p-2.5">
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-black/[0.035] hover:text-foreground"
        >
          <ChevronLeft className={cn("h-4 w-4 shrink-0 transition-transform duration-300 ease-[var(--ease-apple)]", collapsed && "rotate-180")} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
