import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, Clock } from "lucide-react";
import { notificationService } from "@/lib/fleetopsx/services";
import type { Notification } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function NotificationPopover({
  children,
  triggerClassName,
}: {
  children?: React.ReactNode;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!open) return; // refresh count each time the popover opens
    let cancelled = false;
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const load = () => {
      void notificationService
        .list()
        .then((items: Notification[]) => {
          if (!cancelled) {
            setNotifications(items);
            setUnread(items.filter((n) => !n.read).length);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    // While open, keep the list fresh (10s) — new alerts appear live.
    const id = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open]);

  const markAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setNotifications(notifications.map((n) => ({ ...n, read: true })));
      setUnread(0);
      toast.success("All notifications marked as read");
    } catch {
      toast.error("Failed to mark notifications as read");
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await notificationService.toggleRead(id);
      setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnread(Math.max(0, unread - 1));
    } catch {
      toast.error("Failed to mark notification as read");
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn("relative outline-none", triggerClassName)}>
          {children || <Bell className="size-4" strokeWidth={1.75} />}
          {unread > 0 && (
            <span className="num absolute -top-1 -right-1 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-[#ed351d] px-1 text-[9px] font-bold text-white">
              {unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[380px] p-0 shadow-lg border-[#E2E5E9] rounded-[10px]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E5E9]">
          <DropdownMenuLabel className="font-semibold text-[16px] text-[#1B2432] p-0">
            Notifications
          </DropdownMenuLabel>
          {unread > 0 && (
            <button
              onClick={(e) => {
                e.preventDefault();
                void markAllRead();
              }}
              className="text-[12px] font-medium text-[#ED351D] hover:underline transition-all"
            >
              Mark all as read
            </button>
          )}
        </div>
        <DropdownMenuGroup className="max-h-[350px] overflow-y-auto overflow-x-hidden p-0 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse flex items-start gap-3">
                  <div className="size-8 rounded-full bg-gray-200 shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 px-4 text-center">
              <p className="text-[14px] text-[#5C6470]">No notifications yet.</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  className={cn(
                    "flex flex-col items-start gap-1 p-4 cursor-pointer focus:bg-[#F6F7F9] border-b border-[#E2E5E9]/50 last:border-0 rounded-none transition-colors",
                    !n.read ? "bg-[#F4F9FF]" : ""
                  )}
                  onClick={(e) => {
                    e.preventDefault(); 
                    if (!n.read) void markAsRead(n.id);
                  }}
                >
                  <div className="flex w-full items-start justify-between gap-2">
                    <span className="font-medium text-[14px] leading-tight text-[#141A1F]">
                      {n.title}
                    </span>
                    {!n.read && (
                      <span className="size-2 shrink-0 rounded-full bg-[#2463EB]" />
                    )}
                  </div>
                  <span className="text-[13px] leading-snug text-[#5C6470] line-clamp-2">
                    {n.body}
                  </span>
                  <div className="flex w-full items-center justify-between mt-1">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-[#8E95A1]">
                      <Clock className="size-3" />
                      {new Date((n as Notification & { at?: string }).at ?? n.time).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-[10px] font-medium uppercase text-[#5C6470] px-1.5 py-0.5 bg-[#E2E5E9]/50 rounded-[4px]">
                      {n.category}
                    </span>
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="m-0 bg-[#E2E5E9]" />
        <Link
          to="/workspace/app/notifications"
          onClick={() => setOpen(false)}
          className="block w-full py-2.5 text-center text-[13px] font-medium text-[#1B2432] hover:bg-[#F6F7F9] transition-colors rounded-b-[10px]"
        >
          View all notifications
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
