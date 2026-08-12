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
  { label: "Overview", to: "/app", icon: LayoutDashboard, group: "Main" },
  { label: "Fleet", to: "/app/fleet", icon: Truck, badge: 6, group: "Main" },
  { label: "Trips", to: "/app/trips", icon: Radar, badge: 42, group: "Main" },
  { label: "Fuel", to: "/app/fuel", icon: Fuel, badge: 5, group: "Main" },
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
      animate={{ width: collapsed ? 76 : 248 }}
      transition={appleSpring.chrome}
      className="sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-black/[0.05] bg-[#f5f5f7] md:flex"
    >
      <div className={cn("flex h-[60px] items-center gap-2.5", collapsed ? "justify-center px-2" : "px-4")}>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[#1d1d1f] text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)]">
          K
        </span>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={appleSpring.press}
            className="min-w-0"
          >
            <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-foreground">Karigo</p>
            <p className="truncate text-[11px] text-muted-foreground">Petroline · PTL-001</p>
          </motion.div>
        )}
      </div>

      <nav className="scroll-edge flex-1 overflow-y-auto px-2.5 pb-4">
        {GROUPS.map((group) => {
          const items = NAV.filter((n) => n.group === group);
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
                        {active && (
                          <motion.span
                            layoutId="nav-active"
                            className="absolute inset-0 rounded-full bg-[#1d1d1f]"
                            transition={appleSpring.chrome}
                            style={{ zIndex: -1 }}
                          />
                        )}
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

      <div className="border-t border-black/[0.05] p-2.5">
        <button
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
    </motion.aside>
  );
}
