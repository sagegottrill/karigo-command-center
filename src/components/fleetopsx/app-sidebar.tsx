import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Activity, Boxes, ChevronLeft, Fuel, Gauge, LayoutDashboard, LineChart,
  MessageSquare, Radar, ScrollText, Settings, ShieldCheck, Truck, Users, Wrench, Bell, Smartphone, MoreVertical, LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authService } from "@/lib/fleetopsx/services";
import { useState, useEffect } from "react";
import { Route as RootRoute } from "../../routes/__root";
import { ChevronDown } from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: any; // Can be a Lucide icon or a custom functional component
  badge?: number;
  group: string;
}

const CustomAddIcon = ({ className, strokeWidth }: any) => (
  <div className={cn("flex items-center justify-center rounded-full border", className)} style={{ borderWidth: strokeWidth }}>
    <span className="text-[10px] font-bold leading-none">+</span>
  </div>
);

const CustomPartnerIcon = ({ className, strokeWidth }: any) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="8.5" cy="7" r="4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M20 8v6M23 11h-6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CustomManageIcon = ({ className, strokeWidth }: any) => (
  <svg className={className} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth={strokeWidth}/>
    <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth={strokeWidth}/>
    <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth={strokeWidth}/>
    <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth={strokeWidth}/>
  </svg>
);

const CustomPasswordIcon = ({ className, strokeWidth }: any) => (
  <div className={cn("flex items-center justify-center rounded-full border", className)} style={{ borderWidth: strokeWidth }}>
    <span className="text-[10px] font-bold leading-none">?</span>
  </div>
);

export const NAV: NavItem[] = [
  { label: "Overview", to: "/workspace/app", icon: LayoutDashboard, group: "Main" },
  { label: "Authorization", to: "/workspace/app/approvals", icon: ShieldCheck, group: "Fleet Operations" },
  { label: "Fleet Dispatch", to: "/workspace/app/dispatch", icon: Truck, group: "Fleet Operations" },
  { label: "Manage Fleet", to: "/workspace/app/fleet-registry", icon: Truck, group: "Fleet Operations" },
  { label: "Dispatch History", to: "/workspace/app/dispatch-history", icon: ScrollText, group: "Fleet Operations" },
  { label: "Tracking", to: "/workspace/app/trips", icon: Radar, group: "Tracking" },
  { label: "Engineering", to: "/workspace/app/engineering", icon: Wrench, group: "Workshop" },
  { label: "Inventory", to: "/workspace/app/inventory", icon: Boxes, group: "Workshop" },
  { label: "Drivers", to: "/workspace/app/drivers", icon: Users, group: "People" },
  { label: "HR Module", to: "/workspace/app/hr", icon: Users, group: "People" },
  { label: "Accounts", to: "/workspace/app/accounts", icon: Gauge, group: "Finance" },
  { label: "Gate", to: "/workspace/app/gate", icon: ShieldCheck, group: "Yard" },
  { label: "Messages", to: "/workspace/app/messages", icon: MessageSquare, group: "Inbox" },
  { label: "God View", to: "/workspace/app/god-view", icon: LineChart, group: "Insights" },
  { label: "Reports", to: "/workspace/app/reports", icon: Activity, group: "Insights" },
  { label: "Notifications", to: "/workspace/app/notifications", icon: Bell, group: "Inbox" },
  { label: "Add New Account", to: "/workspace/app/add-account", icon: CustomAddIcon, group: "User Management" },
  { label: "Add A Partner", to: "/workspace/app/add-partner", icon: CustomPartnerIcon, group: "User Management" },
  { label: "Account Management", to: "/workspace/app/manage-account", icon: CustomManageIcon, group: "User Management" },
  { label: "Manage Partners", to: "/workspace/app/manage-partner", icon: CustomManageIcon, group: "User Management" },
  { label: "Password Request", to: "/workspace/app/password-request", icon: CustomPasswordIcon, group: "User Management" },
  { label: "Platform Admin", to: "/superadmin", icon: ShieldCheck, group: "Admin" },
  { label: "Audit", to: "/workspace/app/audit", icon: ScrollText, group: "Admin" },
  { label: "Settings", to: "/workspace/app/admin", icon: Settings, group: "Admin" },
];

const GROUPS = ["Main", "Fleet Operations", "Tracking", "Workshop", "People", "Finance", "Yard", "Inbox", "Insights", "User Management", "Admin"];

export function AppSidebar({
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
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "Main": true, "Fleet Operations": true, "Tracking": true, "Workshop": true, "People": true, "Finance": true, 
    "Yard": true, "Inbox": true, "Insights": true, "Admin": true, "User Management": true
  });
  
  useEffect(() => { setMounted(true); }, []);

  const toggleGroup = (group: string) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const isActive = (to: string) =>
    to === "/workspace/app" ? pathname === "/workspace/app" || pathname === "/workspace/app/" : pathname.startsWith(to);

  const currentUser = authService.getCurrentUser();
  const roleNames = authService.getRoles();
  const roleName = roleNames.join(', ');
  const activeRole = authService.getAllRoles().find(r => roleNames.includes(r.name)) || authService.getAllRoles()[0];
  const allowedModules = activeRole?.modules || [];

  const userName = mounted && currentUser?.name ? currentUser.name : "System User";
  const displayRole = mounted ? roleName : "Loading...";
  const userInitials = mounted && currentUser?.initials ? currentUser.initials : "SU";

  const allowedNav = NAV.filter(item => {
    // Admin stuff is available to those who can see Admin module
    if (item.group === "User Management") return allowedModules.includes("All modules") || allowedModules.includes("Admin");

    if (allowedModules.includes("All modules")) return true;
    if (item.label === "Overview") return allowedModules.includes("Dashboard") || allowedModules.includes("God View") || true; 
    
    const label = item.label;
    if (label === "Approvals") return allowedModules.includes("All modules") || allowedModules.includes("Approvals");
    if (label === "Manage Fleet" || label === "Dispatch") return allowedModules.includes("Fleet & Dispatch");
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
    if (label === "Notifications") return true; 
    if (label === "Audit" || label === "Settings") return allowedModules.includes("All modules");
    
    return false;
  });

  const handleLogout = () => {
    authService.logout();
    navigate({ to: "/workspace/login" });
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {!collapsed && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" 
          onClick={onToggle}
        />
      )}
      
      {/* Sidebar Container */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col bg-[#1B2432] transition-all duration-300 ease-[var(--ease-apple)] md:sticky md:top-0 font-['Inter',sans-serif]",
          collapsed ? "-translate-x-full md:translate-x-0 md:w-[80px]" : "translate-x-0 w-[260px]",
        )}
      >
        {/* Header / Logo */}
        <Link to="/workspace/account-type" className={cn("pt-[24px] pb-[24px] flex border-b border-[#ffffff]/5", collapsed ? "justify-center px-[8px]" : "justify-center px-[24px]")}>
          {tenantLogo ? (
            <img src={tenantLogo} alt={tenantName} className={cn("object-contain", collapsed ? "w-[40px] h-[40px]" : "w-[140px] h-[48px]")} />
          ) : (
            <img src="/petroline-transparent.png" alt={tenantName || "Platform Tenant"} className={cn("object-contain", collapsed ? "w-[40px] h-[40px] object-cover object-left" : "w-[140px] h-[48px]")} />
          )}
        </Link>

        {/* Navigation */}
        <nav className="sleek-scrollbar flex-1 overflow-y-auto py-[16px] flex flex-col gap-[16px]">
          {GROUPS.map((group) => {
            const items = allowedNav.filter((n) => n.group === group);
            if (!items.length) return null;
            const isOpen = openGroups[group];
            return (
              <div key={group} className="flex flex-col">
                {!collapsed && (
                  <button 
                    onClick={() => toggleGroup(group)}
                    className="flex items-center justify-between px-[24px] mb-[8px] group/heading"
                  >
                    <span className="text-[11px] font-[500] leading-[14px] tracking-[0.05em] text-[#8e95a1] uppercase group-hover/heading:text-white transition-colors">
                      {group}
                    </span>
                    <ChevronDown className={cn("w-3.5 h-3.5 text-[#8e95a1] transition-transform duration-200 group-hover/heading:text-white", !isOpen && "-rotate-90")} />
                  </button>
                )}
                
                {/* When collapsed, we just show all items regardless of group toggle, or maybe we just don't show the toggle. */}
                {(isOpen || collapsed) && (
                  <div className="flex flex-col gap-[2px]">
                  {items.map((item) => {
                    const active = isActive(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        preload="intent"
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "relative flex flex-row items-center transition-colors group",
                          collapsed ? "justify-center py-[12px] px-[8px] mx-[12px] rounded-[8px]" : "px-[24px] py-[12px] gap-[12px]",
                          active ? "bg-[#ed351d]" : "hover:bg-white/5",
                        )}
                      >
                        <item.icon className={cn("shrink-0", collapsed ? "w-[20px] h-[20px]" : "w-[16px] h-[16px]", active ? "text-[#ffffff]" : "text-[#8e95a1] group-hover:text-[#ffffff]")} strokeWidth={active ? 2 : 1.5} />
                        
                        {!collapsed && (
                          <>
                            <span className={cn("text-[14px] flex-1 truncate", active ? "font-[500] text-[#ffffff]" : "font-[400] text-[#8e95a1] group-hover:text-[#ffffff]")}>
                              {item.label}
                            </span>
                            {item.badge != null && item.badge > 0 && (
                              <span className="ml-auto flex items-center justify-center min-w-[24px] h-[20px] rounded-[4px] bg-white/10 px-[6px] text-[10px] font-[600] leading-none text-white tabular-nums">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}

                        {collapsed && item.badge && (
                          <span className="absolute top-[8px] right-[8px] w-[6px] h-[6px] rounded-full bg-[#ed351d]" />
                        )}
                      </Link>
                    );
                  })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="mt-auto flex flex-col">
          {/* Collapse Toggle */}
          <div className="px-[12px] pb-[12px]">
            <button
              onClick={onToggle}
              className="flex w-full items-center justify-center gap-2 rounded-[8px] py-[10px] text-[#8e95a1] hover:bg-white/5 hover:text-white transition-colors"
              title={collapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <ChevronLeft className={cn("w-[16px] h-[16px] transition-transform duration-300", collapsed && "rotate-180")} />
              {!collapsed && <span className="text-[12px] font-[500]">Collapse Sidebar</span>}
            </button>
          </div>

          {/* Logout Menu */}
          {showLogout && (
            <div className="px-[12px] pb-[12px] animate-in fade-in slide-in-from-bottom-2 duration-200">
              <button 
                onClick={handleLogout} 
                className="flex flex-row items-center justify-center w-full py-[10px] gap-2 rounded-[8px] border-[1px] border-[#ed351d] bg-[#ed351d]/10 hover:bg-[#ed351d]/20 transition-colors"
              >
                <LogOut className="w-[14px] h-[14px] text-[#ed351d]" />
                {!collapsed && <span className="text-[14px] font-[500] text-[#ed351d]">Log Out</span>}
              </button>
            </div>
          )}

          {/* User Profile */}
          <div className="p-[16px] border-t border-[#ffffff]/5">
            <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
              <div className="flex items-center gap-[12px]">
                <div className="w-[32px] h-[32px] rounded-[4px] bg-[#e2e5e9] flex items-center justify-center shrink-0">
                  <span className="text-[14px] font-[600] text-[#141a1f]">{userInitials}</span>
                </div>
                {!collapsed && (
                  <div className="flex flex-col text-left overflow-hidden max-w-[140px]">
                    <span className="text-[14px] font-[600] leading-[16.94px] text-[#ffffff] truncate">{userName}</span>
                    <span className="text-[12px] font-[400] leading-[14.52px] text-[#8e95a1] truncate">{displayRole}</span>
                  </div>
                )}
              </div>
              {!collapsed && (
                <button onClick={() => setShowLogout(!showLogout)} className="shrink-0 p-1 rounded hover:bg-white/10 transition-colors">
                  <MoreVertical className="w-[16px] h-[16px] text-[#8e95a1]" />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

