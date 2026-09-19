import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
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
      "Tracking",
      "Driver",
      "Customer Portals (External)",
      "Platform Admin",
    ];
    if (!authService.getRoles().some((r: any) => allowed.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: NotificationsPage,
});

type CategoryTab = ReturnType<typeof tabsForRoles>[number];

const PAGE_SIZE = 10;

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
  const [page, setPage] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Near real-time: initial load + 10s poll + refresh when the tab regains
  // focus — new approvals/checkpoint alerts appear without a manual reload.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void notificationService
        .list()
        .then((next) => {
          if (!cancelled) setItems(next);
        })
        .catch(() => {});
    };
    void notificationService
      .list()
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load notifications"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const id = window.setInterval(load, 10_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    window.addEventListener("fleetopsx:badges-refresh", load);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
      window.removeEventListener("fleetopsx:badges-refresh", load);
    };
  }, []);

  const rows = items.filter((n) => matchesCategory(n.category, cat));
  const unreadCount = items.filter((n) => !n.read).length;
  const readCount = items.filter((n) => n.read).length;

  /**
   * Removing a notification only clears it for the reader. Most of these rows are
   * shared — a broadcast, or every holder of a role — so a hard delete would wipe
   * a colleague's alert to tidy one person's list.
   */
  const removeNotification = async (n: Notification) => {
    setDeletingId(n.id);
    try {
      await notificationService.remove(n.id);
      setItems((prev) => prev.filter((x) => x.id !== n.id));
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      toast.success("Notification removed", { description: "It stays in everyone else's center." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove the notification");
    } finally {
      setDeletingId(null);
    }
  };

  const clearNotifications = async (mode: "all" | "read") => {
    setClearing(true);
    try {
      const res = await notificationService.clear(mode === "read" ? { readOnly: true } : {});
      const removed = res?.removed ?? 0;
      setItems((prev) => (mode === "read" ? prev.filter((n) => !n.read) : []));
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      toast.success(removed === 1 ? "1 notification removed" : `${removed} notifications removed`, {
        description: "Cleared from your center only — other departments keep theirs.",
      });
      setConfirmClear(false);
      setPage(0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear the notifications");
    } finally {
      setClearing(false);
    }
  };

  // Paginated like every other table — the center must never be an endless
  // scroll. Clamping keeps the page valid when the poll adds/removes rows.
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = rows.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(rows.length, currentPage * PAGE_SIZE + pageRows.length);

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
            items that need to be checked out categorized
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            disabled={readCount === 0}
            onClick={() => void clearNotifications("read")}
            className="flex h-8 items-center justify-center rounded border border-[#E2E5E9] bg-white px-3 text-[14px] font-medium tracking-[0.4px] text-[#1B2432] shadow-[0px_1px_2px_rgba(12,12,13,0.05)] disabled:opacity-40"
          >
            Clear Read
          </button>
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
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => setConfirmClear(true)}
            className="flex h-8 items-center justify-center gap-1.5 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] font-medium tracking-[0.4px] text-[#B42318] shadow-[0px_1px_2px_rgba(12,12,13,0.05)] disabled:opacity-40"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            Clear All
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:hidden">
        <div className="flex flex-col gap-1">
          <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F]">Notification Center</h2>
          <p className="text-[12px] font-normal text-[rgba(92,100,112,0.6)]">
            Items that need to be checked out categorized.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={readCount === 0}
            onClick={() => void clearNotifications("read")}
            className="flex h-8 items-center justify-center rounded border border-[#E2E5E9] bg-white px-3 text-[14px] font-medium tracking-[0.4px] text-[#1B2432] shadow-[0px_1px_2px_rgba(12,12,13,0.05)] disabled:opacity-40"
          >
            Clear Read
          </button>
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
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => setConfirmClear(true)}
            className="flex h-8 items-center justify-center gap-1.5 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] font-medium tracking-[0.4px] text-[#B42318] shadow-[0px_1px_2px_rgba(12,12,13,0.05)] disabled:opacity-40"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            Clear All
          </button>
        </div>
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
                onClick={() => {
                  setCat(c);
                  setPage(0);
                }}
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

        {pageRows.map((n) => (
          <div
            key={n.id}
            className={cn(
              "flex w-full items-stretch border-b border-[#E2E5E9] last:border-b-0",
              n.read ? "bg-white" : "bg-[rgba(255,255,255,0.7)]",
            )}
          >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-start justify-between px-5 py-2.5 text-left"
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
          <button
            type="button"
            aria-label={`Delete notification: ${n.title}`}
            title="Delete from your notification center"
            disabled={deletingId === n.id}
            onClick={() => void removeNotification(n)}
            className="grid w-12 shrink-0 place-items-center text-[#5C6470] transition-colors hover:text-[#B42318] disabled:opacity-40"
          >
            <Trash2 className="size-[18px]" strokeWidth={1.6} />
          </button>
          </div>
        ))}

        {rows.length === 0 && (
          <FigmaEmptyState
            title={cat === "All" ? "No notifications for your department" : `No ${cat.toLowerCase()} notifications`}
            body="Operational alerts for your department will appear here."
          />
        )}

        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] px-5 py-4">
            <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
              {from} - {to}
            </span>
            <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">of {rows.length}</span>
            <div className="ml-2 flex items-center gap-2.5">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-[18px] text-[#627084]" />
              </button>
              <button
                type="button"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                className="grid size-8 place-items-center rounded-[2px] border border-[#627084] disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="size-[18px] text-[#627084]" />
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmClear && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#141A1F]/60 p-4"
          onClick={() => setConfirmClear(false)}
        >
          <div
            className="flex w-[420px] max-w-full flex-col gap-3 rounded-[10px] border border-[#E2E5E9] bg-white p-5 shadow-[0px_4px_16px_rgba(12,12,13,0.1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[18px] font-semibold leading-7 tracking-[0.4px] text-[#1B2432]">
              Clear all notifications
            </h3>
            <p className="text-[13px] text-[#5C6470]">
              All {items.length} notifications are removed from <strong>your</strong> notification
              center. Other departments keep theirs — nothing is deleted for anyone else, and new
              alerts still arrive as normal.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmClear(false)}
                className="text-[13px] font-medium text-[#627084] hover:underline"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearing}
                onClick={() => void clearNotifications("all")}
                className="h-9 rounded bg-[#ED351D] px-4 text-[13px] font-semibold text-white disabled:opacity-50"
              >
                {clearing ? "Clearing…" : "Clear All"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
