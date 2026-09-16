import { createFileRoute, redirect } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { authService, notificationService } from "@/lib/fleetopsx/services";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import type { Notification } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/workspace/customer-portal/_auth/notifications")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const user = authService.getCurrentUser();
    if (!user) {
      throw redirect({ to: "/workspace/customer-portal/login" });
    }
    const roles = authService.getRoles();
    if (!roles.includes("Customer Portals (External)")) {
      throw redirect({ to: "/workspace/customer-portal/login" });
    }
  },
  component: PartnerNotificationsPage,
});

function PartnerNotificationsPage() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void notificationService
      .list()
      .then(setItems)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load notifications"))
      .finally(() => setLoading(false));
  }, []);

  // Near real-time: cargo alerts appear without a manual reload (10s poll).
  useAutoRefresh(() => {
    void notificationService.list().then(setItems).catch(() => {});
  });

  const unreadCount = items.filter((n) => !n.read).length;

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = items.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);
  const from = items.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(items.length, currentPage * PAGE_SIZE + pageRows.length);

  if (loading) {
    return (
      <div className="flex w-full flex-col gap-5 p-5 max-md:px-4 md:gap-[30px] md:p-[30px]">
        <FigmaLoadingState label="Loading notifications…" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 p-5 max-md:px-4 md:gap-[30px] md:p-[30px]">
      <div className="hidden flex-wrap items-center justify-between gap-4 md:flex">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Notifications</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            Updates on your transport requests
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
          <h2 className="text-[20px] font-semibold leading-7 tracking-[0.4px] text-[#141A1F]">Notifications</h2>
          <p className="text-[12px] font-normal text-[rgba(92,100,112,0.6)]">
            Updates on your transport requests.
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

      <div className="overflow-hidden rounded-[10px] bg-white shadow-[0px_4px_4px_rgba(12,12,13,0.05)] border border-[#E2E5E9]">
        <div className="flex flex-col gap-2.5 border-b border-[rgba(92,100,112,0.3)] p-2.5 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4 md:px-5 md:py-2.5">
          <div className="flex items-center gap-2.5 py-2.5 md:py-2.5">
            <h3 className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432] md:text-[20px] md:leading-7">
              Notification Center
            </h3>
            <span className="grid size-6 place-items-center rounded bg-[#ED351D] text-[14px] font-medium tracking-[0.4px] text-white md:size-8">
              {unreadCount}
            </span>
          </div>
        </div>

        {pageRows.map((n) => (
          <button
            key={n.id}
            type="button"
            className={cn(
              "flex w-full items-start justify-between border-b border-[#E2E5E9] px-5 py-2.5 text-left last:border-b-0",
              n.read ? "bg-white" : "bg-[rgba(255,255,255,0.7)] hover:bg-[#F1F2F4]",
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

        {items.length === 0 && (
          <FigmaEmptyState
            title="No notifications yet"
            body="Alerts regarding your transport requests will appear here."
          />
        )}

        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] px-5 py-4">
            <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">
              {from} - {to}
            </span>
            <span className="text-[16px] font-semibold tracking-[0.4px] text-[#1B2432]">of {items.length}</span>
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
    </div>
  );
}
