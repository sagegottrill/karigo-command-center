import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { tabsForRoles } from "@/lib/fleetopsx/notification-scope";
import { authService, notificationService } from "@/lib/fleetopsx/services";
import type { Notification } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/app/notifications")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const allowed = [
      "Transport Manager",
      "Fleet Operations",
      "Diesel",
      "Engineering",
      "Parts & Store",
      "Accounts",
      "HR",
      "Security",
      "Driver",
      "Customer Portals (External)",
      "Platform Admin",
    ];
    if (!authService.getRoles().some((r) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: NotificationsPage,
});

type CategoryTab = ReturnType<typeof tabsForRoles>[number];

function matchesCategory(category: string, tab: CategoryTab) {
  switch (tab) {
    case "All":
      return true;
    case "Operations":
      return category === "Operations";
    case "Approval":
      return category === "Approvals";
    case "Engineering":
      return category === "Engineering";
    case "Security":
      return category === "Security";
    case "Compliance":
      return category === "Compliance";
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function NotificationsPage() {
  const roles = authService.getRoles();
  const categories = useMemo(() => tabsForRoles(roles), [roles]);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState<CategoryTab>("All");

  useEffect(() => {
    void notificationService
      .list()
      .then(setItems)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load notifications"))
      .finally(() => setLoading(false));
  }, []);

  const rows = items.filter((n) => matchesCategory(n.category, cat));
  const unreadCount = items.filter((n) => !n.read).length;

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-5 max-md:px-4 md:gap-[30px] md:p-[30px]">
        <FigmaLoadingState label="Loading notifications…" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-5 max-md:px-4 md:gap-[30px] md:p-[30px]">
      <div className="hidden flex-wrap items-center justify-between gap-4 md:flex">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Notification</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            items that need to be checked out for your department
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void notificationService.markAllRead().then(() => {
              setItems(items.map((n) => ({ ...n, read: true })));
              toast.success("All notifications marked as read");
            });
          }}
          className="flex h-8 w-[165px] items-center justify-center rounded border border-[#E2E5E9] bg-white text-[14px] font-medium tracking-[0.4px] text-[#1B2432] shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
        >
          Mark all as Read
        </button>
      </div>

      <div className="flex flex-col gap-4 md:hidden">
        <div className="flex flex-col gap-1">
          <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F]">Notification Center</h2>
          <p className="text-[12px] font-normal text-[rgba(92,100,112,0.6)]">
            Items that need to be checked out for your department.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void notificationService.markAllRead().then(() => {
              setItems(items.map((n) => ({ ...n, read: true })));
              toast.success("All notifications marked as read");
            });
          }}
          className="flex h-8 w-[165px] items-center justify-center rounded border border-[#E2E5E9] bg-white text-[14px] font-medium tracking-[0.4px] text-[#1B2432] shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
        >
          Mark all as Read
        </button>
      </div>

      <div className="overflow-hidden rounded-[10px] bg-white shadow-[0px_4px_4px_rgba(12,12,13,0.05)]">
        <div className="flex flex-col gap-2.5 border-b border-[rgba(92,100,112,0.3)] p-2.5 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4 md:px-5 md:py-2.5">
          <div className="flex items-center gap-2.5 py-2.5 md:py-2.5">
            <h3 className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432] md:text-[20px] md:leading-7">
              Notification Center
            </h3>
            <span className="grid size-6 place-items-center rounded bg-[#ED351D] text-[14px] font-medium tracking-[0.4px] text-white md:size-8">
              {unreadCount}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-2.5">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCat(c)}
                className={cn(
                  "flex h-6 items-center rounded px-3 text-[12px] tracking-[0.4px] md:h-9 md:text-[14px] md:font-medium",
                  cat === c ? "bg-[#1B2432] text-white" : "bg-[rgba(226,229,233,0.5)] text-[#141A1F]",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {rows.map((n) => (
          <button
            key={n.id}
            type="button"
            className={cn(
              "flex w-full items-start justify-between border-b border-[#E2E5E9] px-5 py-2.5 text-left last:border-b-0",
              n.read ? "bg-white" : "bg-[rgba(255,255,255,0.7)]",
            )}
            onClick={() => {
              if (!n.read) {
                void notificationService.toggleRead(n.id).then(() => {
                  setItems(items.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
                });
              }
            }}
          >
            <div className="flex min-w-0 flex-col gap-[8px]">
              <span className="text-[14px] font-medium tracking-[0.4px] text-[#5C6470]">{n.title}</span>
              <div className="flex flex-wrap items-center gap-[6px] text-[12px] tracking-[0.4px] text-[#627084]">
                {n.body ? <span>{n.body}</span> : null}
                {n.body && n.time ? <span className="h-[3px] w-[3px] rounded-full bg-[#627084]" /> : null}
                {n.time ? <span>{n.time}</span> : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5 pl-3 pt-1">
              <span className="text-[12px] tracking-[0.4px] text-[rgba(92,100,112,0.6)]">{n.read ? "Read" : "Unread"}</span>
              {!n.read && <span className="size-[10px] rounded-full bg-[#ED351D]" />}
            </div>
          </button>
        ))}

        {rows.length === 0 && (
          <FigmaEmptyState
            title={cat === "All" ? "No notifications for your department" : `No ${cat.toLowerCase()} notifications`}
            body="Alerts for your role will list here from live operations."
          />
        )}
      </div>
    </div>
  );
}
