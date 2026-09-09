import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardList, Truck, History, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { notificationService } from "@/lib/fleetopsx/services";

export function StaffBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unreadCount = notificationService.getUnreadCount();

  const navItems = [
    {
      label: "Fleet Dispatch",
      to: "/workspace/app/dispatch",
      icon: ClipboardList,
    },
    {
      label: "Manage Fleet",
      to: "/workspace/app/fleet",
      icon: Truck,
    },
    {
      label: "Dispatch History",
      to: "/workspace/app/dispatch-history",
      icon: History,
    },
    {
      label: "Notification",
      to: "/workspace/app/notifications",
      icon: Bell,
      badge: unreadCount,
    },
  ];

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#1B2432] z-50 flex border-t border-[#141a1f] pb-safe">
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.to);
        const Icon = item.icon;

        return (
          <Link
            key={item.to}
            to={item.to}
            className="flex-1 flex flex-col items-center justify-center relative group"
          >
            <div className="relative mb-1">
              <Icon 
                className={cn(
                  "h-5 w-5 transition-colors", 
                  isActive ? "text-white" : "text-slate-400 group-hover:text-slate-300"
                )} 
                strokeWidth={2}
              />
              {item.badge ? (
                <span className="absolute -top-1.5 -right-2 bg-[#ea3a3d] text-white text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center border border-[#1B2432]">
                  {item.badge}
                </span>
              ) : null}
            </div>
            <span 
              className={cn(
                "text-[10px] font-medium leading-tight text-center transition-colors px-1",
                isActive ? "text-white" : "text-slate-400 group-hover:text-slate-300"
              )}
            >
              {item.label.split(' ').map((word, i) => (
                <span key={i} className="block">{word}</span>
              ))}
            </span>
            {isActive && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-[3px] bg-white rounded-t-sm" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
