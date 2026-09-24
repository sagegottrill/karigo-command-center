import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  CalendarClock,
  LogOut,
  MessageSquare,
  MoreVertical,
  Package,
  PackageCheck,
  Receipt,
  ShieldCheck,
  Truck,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { authService } from "@/lib/fleetopsx/services";
import { hardLogout } from "@/lib/fleetopsx/session";
import { cn } from "@/lib/utils";
import { Route as RootRoute } from "../../routes/__root";
import { useLiveBadges } from "@/lib/fleetopsx/use-live-badges";

/**
 * The department portals that own their own record instead of borrowing the
 * Transport Manager's admin sidebar.
 *
 * HR and Engineering used to fall through to the TM shell: their pages existed
 * and their roles landed on the right URL, but the sidebar, the header and the
 * nav were the manager's — so an HR login read "Transport Manager Portal" with
 * the manager's account menus on screen. A department is its own department; the
 * TM gets a glimpse of the data, not the department's desk.
 */
export type DepartmentKey = "hr" | "engineering" | "inventory" | "parts";

type DepartmentNavItem = {
  label: string;
  to: string;
  icon: typeof Users;
};

type DepartmentPortal = {
  /** Sidebar group heading. */
  heading: string;
  /** Header title + one-line description of what the portal is for. */
  title: string;
  subtitle: string;
  items: DepartmentNavItem[];
};

const DEPARTMENTS: Record<DepartmentKey, DepartmentPortal> = {
  // A department is more than one page: each module below is its own board, the
  // way Fleet Operation splits dispatch, fleet and history.
  hr: {
    heading: "HR & PERSONNEL",
    title: "HR & Personnel Portal",
    subtitle: "Manage staff records, licences and driver availability",
    items: [
      { label: "Staff Records", to: "/workspace/app/hr", icon: Users },
      { label: "Licence & Compliance", to: "/workspace/app/hr-compliance", icon: ShieldCheck },
      { label: "Duty Roster", to: "/workspace/app/hr-roster", icon: CalendarClock },
      { label: "Notifications", to: "/workspace/app/notifications", icon: Bell },
      { label: "Messages", to: "/workspace/app/messages", icon: MessageSquare },
    ],
  },
  // The STOREHOUSE: inbound stock, handoff queue, count variances. Its own
  // department — never folded into Engineering and never sharing Engineering's
  // nav.
  inventory: {
    heading: "PARTS & INVENTORY",
    title: "Parts & Inventory Portal",
    subtitle: "Inbound stock, handoff queue and shelf variances",
    items: [
      { label: "Inventory Desk", to: "/workspace/app/inventory-desk", icon: PackageCheck },
      { label: "Notifications", to: "/workspace/app/notifications", icon: Bell },
      { label: "Messages", to: "/workspace/app/messages", icon: MessageSquare },
    ],
  },
  engineering: {
    heading: "ENGINEERING",
    title: "Engineering & Maintenance Portal",
    subtitle: "Workshop work orders, check-up verdicts and repair spend",
    items: [
      { label: "Work Orders", to: "/workspace/app/engineering", icon: Wrench },
      { label: "Truck Availability", to: "/workspace/app/truck-availability", icon: Truck },
      // The workshop's own parts request view. The STOREHOUSE is a separate
      // department with its own portal — this link is Engineering's window onto
      // the parts it raised, not the store's desk.
      { label: "Parts & Store", to: "/workspace/app/parts", icon: Package },
      { label: "Repair Spend", to: "/workspace/app/repair-spend", icon: Receipt },
      { label: "Notifications", to: "/workspace/app/notifications", icon: Bell },
      { label: "Messages", to: "/workspace/app/messages", icon: MessageSquare },
    ],
  },
  // The STORE DEPARTMENT as its own portal: the Parts & Store board IS the
  // department's working page — catalog, purchases, requisitions, movements.
  parts: {
    heading: "PARTS & INVENTORY",
    title: "Parts & Inventory Portal",
    subtitle: "The store's catalog, purchases and requisitions",
    items: [
      { label: "Parts & Store", to: "/workspace/app/parts", icon: Package },
      { label: "Inventory Desk", to: "/workspace/app/inventory-desk", icon: PackageCheck },
      { label: "Notifications", to: "/workspace/app/notifications", icon: Bell },
      { label: "Messages", to: "/workspace/app/messages", icon: MessageSquare },
    ],
  },
};

export function departmentPortal(key: DepartmentKey) {
  return DEPARTMENTS[key];
}

/** The roles that ARE this department. Spellings are the ones the API issues. */
const DEPARTMENT_ROLES: Record<DepartmentKey, RegExp> = {
  hr: /^(hr|hr & personnel|hr and personnel|personnel)$/i,
  engineering: /^(engineering|engineering and maintenance|engineering & maintenance)$/i,
  // The STOREHOUSE desk: Inventory, its head, and the floor attendants.
  inventory:
    /^(inventory|head of inventory|store floor attendant|inventory & store|inventory manager)$/i,
  // The STORE DEPARTMENT: a Parts & Store login gets ITS OWN portal, never
  // Engineering's shell and never the manager's dashboard. Parts & Inventory
  // is its own department — the thing the brief has said three times.
  parts: /^(parts & store|parts and store|parts|store)$/i,
};

/**
 * Does this session belong in the department's own portal?
 *
 * The Transport Manager (and the Platform Admin who supervises every tenant) is
 * deliberately excluded: they read these records as an audit, and the shell they
 * get is the manager's. So is anyone holding another department's role — Fleet
 * Ops has its own portal and must not be pulled into HR's.
 */
export function shouldUseDepartmentShell(roles: string[], key: DepartmentKey) {
  if (roles.includes("Transport Manager") || roles.includes("Platform Admin")) return false;
  if (roles.includes("Fleet Operations")) return false;
  if (roles.some((r) => /tracking|security|gate|loading|lubricant|fuel/i.test(r))) return false;
  return roles.some((r) => DEPARTMENT_ROLES[key].test(r));
}

export function shouldUseHrShell(roles: string[]) {
  return shouldUseDepartmentShell(roles, "hr");
}

export function shouldUseEngineeringShell(roles: string[]) {
  return shouldUseDepartmentShell(roles, "engineering");
}

export function shouldUseInventoryShell(roles: string[]) {
  return shouldUseDepartmentShell(roles, "inventory");
}

export function shouldUsePartsStoreShell(roles: string[]) {
  return shouldUseDepartmentShell(roles, "parts");
}

function isPathActive(pathname: string, to: string) {
  return pathname === to || pathname.startsWith(`${to}/`);
}

function useBadges() {
  const { unreadNotifications, unreadMessages } = useLiveBadges();
  return { unreadNotifications, unreadMessages };
}

export function DepartmentSidebar({
  department,
  collapsed,
  onToggle,
}: {
  department: DepartmentKey;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const portal = DEPARTMENTS[department];
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { tenantName, tenantLogo } = RootRoute.useRouteContext();
  const [showLogout, setShowLogout] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { unreadNotifications, unreadMessages } = useBadges();

  useEffect(() => {
    setMounted(true);
  }, []);

  const currentUser = authService.getCurrentUser();
  const userName = mounted && currentUser?.name ? currentUser.name : "";
  const userEmail = mounted && currentUser?.email ? currentUser.email : "";
  const userInitials = mounted && currentUser?.initials ? currentUser.initials : "";
  const logoSrc = tenantLogo || "/figma/petroline-logo.png";

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
          <div
            className={cn(
              "flex w-full flex-col gap-[5px]",
              collapsed ? "items-center px-2" : "w-[224px]",
            )}
          >
            {!collapsed && (
              <span className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-white/70">
                {portal.heading}
              </span>
            )}
            {portal.items.map((item) => {
              const active = isPathActive(pathname, item.to);
              const Icon = item.icon;
              // Only the Inbox items carry a count — a badge on "Staff Records"
              // advertised unread notifications and told the reader nothing.
              const isMessages = item.to.includes("messages");
              const isNotifications = item.to.includes("notifications");
              const badgeCount = isMessages
                ? unreadMessages
                : isNotifications
                  ? unreadNotifications
                  : 0;
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
                      {badgeCount > 0 && (
                        <span
                          className={cn(
                            "grid size-5 shrink-0 place-items-center rounded-[10px] text-[12px] tracking-[0.4px]",
                            active ? "bg-white text-[#ED351D]" : "bg-[#ED351D] text-white",
                          )}
                        >
                          {badgeCount > 9 ? "9+" : badgeCount}
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
              onClick={() => hardLogout("/workspace/login")}
              className="mb-2 flex h-10 w-full items-center justify-center gap-2 rounded border border-[#ED351D] bg-[#ED351D]/10 text-[14px] font-medium text-[#ED351D]"
            >
              <LogOut className="size-3.5" />
              {!collapsed && "Log Out"}
            </button>
          )}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setShowLogout((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setShowLogout((v) => !v);
            }}
            className={cn(
              "flex h-12 w-full cursor-pointer items-center gap-2 overflow-hidden rounded p-2 hover:bg-white/5",
              collapsed && "justify-center",
            )}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[#F1F2F4]">
              <span className="text-[14px] font-normal tracking-[0.4px] text-[#5C6470]">
                {userInitials}
              </span>
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1 text-left">
                  <p className="truncate text-[14px] font-medium leading-[17.5px] tracking-[0.4px] text-white">
                    {userName}
                  </p>
                  <p className="truncate text-[12px] font-normal leading-4 tracking-[0.4px] text-[#5C6470]">
                    {userEmail}
                  </p>
                </div>
                <div className="shrink-0 p-0.5">
                  <MoreVertical className="size-4 text-white/70" />
                </div>
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

/**
 * The department's modules as a tab strip, for the top of every module page.
 *
 * The department's own people find these in their sidebar; the Transport Manager
 * (who borrows his own admin sidebar and holds no link to them) reaches the rest
 * of the department here. Inbox items stay out — they are not a module.
 */
export function DepartmentTabs({ department }: { department: DepartmentKey }) {
  const portal = DEPARTMENTS[department];
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const modules = portal.items.filter(
    (item) => !item.to.includes("/notifications") && !item.to.includes("/messages"),
  );
  if (modules.length < 2) return null;

  return (
    <div className="flex w-full items-center gap-1 overflow-x-auto border-b border-[#E2E5E9] bg-white px-5 max-md:px-2">
      {modules.map((item) => {
        const active = isPathActive(pathname, item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-[14px] tracking-[0.4px] transition-colors",
              active
                ? "border-[#ED351D] font-medium text-[#ED351D]"
                : "border-transparent text-[#5C6470] hover:text-[#1B2432]",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.5} />
            <span className="whitespace-nowrap">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function DepartmentMobileNav({ department }: { department: DepartmentKey }) {
  const portal = DEPARTMENTS[department];
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { unreadNotifications, unreadMessages } = useBadges();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex h-[74px] items-stretch bg-[#1B2432] px-5 py-1 shadow-[0px_4px_4px_rgba(0,0,0,0.15),0px_1px_1.5px_rgba(0,0,0,0.3)] md:hidden">
      {portal.items.map((item) => {
        const active = isPathActive(pathname, item.to);
        const Icon = item.icon;
        const isMessages = item.to.includes("messages");
        const isNotifications = item.to.includes("notifications");
        const badgeCount = isMessages ? unreadMessages : isNotifications ? unreadNotifications : 0;
        const shortLabel = item.label === "Notifications" ? "Notification" : item.label;
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
              <Icon className="size-[22px]" strokeWidth={1.5} />
              {badgeCount > 0 && (
                <span className="absolute -right-3 -top-1 grid size-4 place-items-center rounded-[10px] bg-[#ED351D] text-[10px] font-medium text-white">
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </span>
            <span className="w-full text-center text-[10px] font-medium leading-tight">
              {shortLabel}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
