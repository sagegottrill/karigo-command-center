import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Bell, Check, CheckCheck, Clock } from "lucide-react";
import { notificationService } from "@/lib/fleetopsx/services";
import type { Notification } from "@/lib/fleetopsx/types";
import {
  NOTIFICATION_MODULES,
  SEVERITY_CLASS,
  absoluteStamp,
  moduleOf,
  notificationCenterPath,
  notificationTarget,
  relativeAge,
  severityTone,
} from "@/lib/fleetopsx/notification-modules";
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

/**
 * The bell: what arrived most recently, with the reader's own work on top.
 *
 * Rows are grouped under the department that sent them and the ones that need
 * THIS reader are lifted above the news, so the first thing visible is a
 * decision rather than a truck-status flip. Each row opens the record it is
 * about (`Open dispatch`) instead of dumping the reader on a list.
 */
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
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [recent, mine, summary] = await Promise.all([
        notificationService.list({ limit: 40 }),
        // Asked for separately: the reader's own queue can be older than the last
        // 40 alerts, and "needs me" falling off the end of the list is exactly
        // the failure this panel exists to prevent.
        notificationService.list({ action: true, unread: true, limit: 10 }).catch(() => []),
        notificationService.summary(),
      ]);
      const seen = new Set<string>();
      const merged: Notification[] = [];
      for (const row of [...mine, ...recent]) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
      }
      setNotifications(merged);
      setUnread(summary.unread);
    } catch {
      /* offline — the badge keeps its last value */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const run = () => {
      if (cancelled) return;
      void load().finally(() => {
        if (!cancelled) setLoading(false);
      });
    };
    run();
    // While open, keep the list fresh — new alerts appear live.
    const id = window.setInterval(run, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, load]);

  // The badge must be this user's count even while the panel is shut.
  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      void notificationService
        .getUnreadCount()
        .then((count) => {
          if (!cancelled) setUnread(count);
        })
        .catch(() => {});
    };
    sync();
    const id = window.setInterval(sync, 20_000);
    window.addEventListener("fleetopsx:notifications-refresh", sync);
    window.addEventListener("fleetopsx:badges-refresh", sync);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("fleetopsx:notifications-refresh", sync);
      window.removeEventListener("fleetopsx:badges-refresh", sync);
    };
  }, []);

  const markAllRead = async () => {
    setBusy(true);
    try {
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      toast.success("All notifications marked as read", {
        description: "Yours only — colleagues' unread counts are untouched.",
      });
    } catch {
      toast.error("Failed to mark notifications as read");
    } finally {
      setBusy(false);
    }
  };

  const markAsRead = async (row: Notification) => {
    if (row.read) return;
    setNotifications((prev) => prev.map((n) => (n.id === row.id ? { ...n, read: true } : n)));
    setUnread((count) => Math.max(0, count - 1));
    try {
      await notificationService.markRead(row.id, true);
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
    } catch {
      setNotifications((prev) => prev.map((n) => (n.id === row.id ? { ...n, read: false } : n)));
      toast.error("Failed to mark notification as read");
    }
  };

  const centerPath = notificationCenterPath();

  // Needs-me first, then newest — and grouped under the department that sent it.
  const ordered = [...notifications].sort((a, b) => {
    const mine = Number(Boolean(b.actionRequired)) - Number(Boolean(a.actionRequired));
    if (mine !== 0) return mine;
    return Date.parse(String(b.createdAt ?? 0)) - Date.parse(String(a.createdAt ?? 0));
  });
  const groups = new Map<string, Notification[]>();
  for (const row of ordered) {
    const name = moduleOf(row);
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications: ${unread} unread` : "Notifications"}
          className={cn("relative outline-none", triggerClassName)}
        >
          {children || <Bell className="size-4" strokeWidth={1.75} />}
          {unread > 0 && (
            <span className="num absolute -top-1 -right-1 grid h-3.5 min-w-[14px] place-items-center rounded-full bg-[#ed351d] px-1 text-[9px] font-bold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[420px] rounded-[10px] border-[#E2E5E9] p-0 shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-[#E2E5E9] px-4 py-3">
          <DropdownMenuLabel className="p-0 text-[16px] font-semibold text-[#1B2432]">
            Notifications
            {unread > 0 ? (
              <span className="ml-2 rounded bg-[#ED351D] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {unread} unread
              </span>
            ) : null}
          </DropdownMenuLabel>
          {unread > 0 && (
            <button
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void markAllRead();
              }}
              className="flex items-center gap-1 text-[12px] font-medium text-[#ED351D] transition-all hover:underline disabled:opacity-60"
            >
              <CheckCheck className="size-3.5" strokeWidth={2} />
              Mark all as read
            </button>
          )}
        </div>

        <DropdownMenuGroup className="custom-scrollbar max-h-[400px] overflow-x-hidden overflow-y-auto p-0">
          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex animate-pulse items-start gap-3">
                  <div className="size-8 shrink-0 rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-4 w-3/4 rounded bg-gray-200" />
                    <div className="h-3 w-1/2 rounded bg-gray-200" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[14px] text-[#5C6470]">No notifications yet.</p>
            </div>
          ) : (
            [...groups.entries()].map(([moduleName, rows]) => (
              <div key={moduleName}>
                <p className="sticky top-0 z-10 flex items-center justify-between border-b border-[#F1F2F4] bg-[#FAFBFC] px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.6px] text-[#5C6470]">
                  {NOTIFICATION_MODULES[moduleName as keyof typeof NOTIFICATION_MODULES]?.short ??
                    moduleName}
                  <span className="font-medium normal-case tracking-normal text-[#8E95A1]">
                    {rows.filter((r) => !r.read).length} unread
                  </span>
                </p>
                {rows.map((n) => {
                  const target = notificationTarget(n);
                  const tone = severityTone(n);
                  return (
                    <DropdownMenuItem
                      key={n.id}
                      className={cn(
                        "flex cursor-pointer flex-col items-start gap-1 rounded-none border-b border-[#E2E5E9]/50 p-4 transition-colors last:border-0 focus:bg-[#F6F7F9]",
                        !n.read ? "bg-[#F4F9FF]" : "",
                      )}
                      onClick={(e) => {
                        e.preventDefault();
                        void markAsRead(n);
                      }}
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          {n.actionRequired ? (
                            <span className="shrink-0 rounded bg-[#1B2432] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.4px] text-white">
                              Needs you
                            </span>
                          ) : null}
                          <span className="truncate text-[14px] font-medium leading-tight text-[#141A1F]">
                            {n.title}
                          </span>
                        </span>
                        {!n.read && (
                          <span
                            className={cn("size-2 shrink-0 rounded-full", SEVERITY_CLASS[tone])}
                          />
                        )}
                      </div>
                      <span className="line-clamp-2 text-[13px] leading-snug text-[#5C6470]">
                        {n.body}
                      </span>
                      <div className="mt-1 flex w-full items-center justify-between gap-2">
                        <span
                          className="flex items-center gap-1 text-[11px] font-medium text-[#8E95A1]"
                          title={absoluteStamp(n)}
                        >
                          <Clock className="size-3" />
                          {relativeAge(n)}
                        </span>
                        {target.record ? (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-[#5C6470]">
                            {target.record}
                            <ArrowUpRight className="size-3" strokeWidth={2} />
                          </span>
                        ) : null}
                      </div>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            ))
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="m-0 bg-[#E2E5E9]" />
        <div className="flex items-center">
          {/* The partner portal has its own center; the staff route is closed to it. */}
          <Link
            to={centerPath}
            onClick={() => setOpen(false)}
            className="flex-1 py-2.5 text-center text-[13px] font-medium text-[#1B2432] transition-colors hover:bg-[#F6F7F9]"
          >
            Open the notification center
          </Link>
          <Link
            to={centerPath}
            onClick={() => setOpen(false)}
            className="flex items-center gap-1 border-l border-[#E2E5E9] px-4 py-2.5 text-[13px] font-medium text-[#2463EB] transition-colors hover:bg-[#F6F7F9]"
          >
            <Check className="size-3.5" strokeWidth={2} />
            Review by department
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
