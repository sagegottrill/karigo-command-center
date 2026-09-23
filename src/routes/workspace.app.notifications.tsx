import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { PAGE_SIZE } from "@/lib/fleetopsx/pagination";
import {
  Bell,
  Building2,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Fuel,
  Gauge,
  Inbox,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  MODULE_ORDER,
  NOTIFICATION_MODULES,
  SEVERITY_CLASS,
  absoluteStamp,
  moduleOf,
  notificationTarget,
  relativeAge,
  severityTone,
  type NotificationModuleName,
} from "@/lib/fleetopsx/notification-modules";
import { authService, notificationService } from "@/lib/fleetopsx/services";
import type { Notification, NotificationSummary } from "@/lib/fleetopsx/types";
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
      "Loading",
      "Driver",
      "Customer Portals (External)",
      "Platform Admin",
    ];
    if (!authService.getRoles().some((role: string) => allowed.includes(role))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: NotificationsPage,
});

/** The icon a module's rows carry in the rail. */
const MODULE_ICON: Record<NotificationModuleName, typeof Bell> = {
  "Fleet Operations": Building2,
  Partners: Building2,
  "Gate Security": ShieldCheck,
  Tracking: Gauge,
  Engineering: Gauge,
  "Fuel & Lubricant": Fuel,
  "HR & Personnel": UserRound,
  Accounts: Inbox,
  System: Bell,
};

type Scope = "all" | "mine" | "unread";

function NotificationsPage() {
  const [summary, setSummary] = useState<NotificationSummary | null>(null);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [moduleFilter, setModuleFilter] = useState<NotificationModuleName | "all">("all");
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [busy, setBusy] = useState(false);

  /**
   * The list is fetched from the server with the filters applied, not filtered
   * in the browser: 900 rows in memory would still leave the "needs me" question
   * answerable only by scanning them, and read state belongs to THIS user.
   */
  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const rows = await notificationService.list({
        module: moduleFilter === "all" ? undefined : moduleFilter,
        action: scope === "mine",
        unread: scope === "unread",
      });
      setItems(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load notifications");
    } finally {
      setLoadingList(false);
      setLoading(false);
    }
  }, [moduleFilter, scope]);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await notificationService.summary());
    } catch {
      /* the panel renders from the list; the rail just stays as it was */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      void loadSummary();
      void loadList();
    };
    refresh();
    const id = window.setInterval(refresh, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("fleetopsx:badges-refresh", refresh);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("fleetopsx:badges-refresh", refresh);
    };
  }, [loadList, loadSummary]);

  /** Search runs on what the server already scoped — reference, title and text. */
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((n) =>
      `${n.title} ${n.body} ${n.refLabel ?? ""} ${moduleOf(n)}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const unreadCount = items.filter((n) => !n.read).length;
  const readCount = items.length - unreadCount;
  const moduleCount = (name: NotificationModuleName) =>
    summary?.modules.find((m) => m.module === name)?.unread ?? 0;
  const moduleTotal = (name: NotificationModuleName) =>
    summary?.modules.find((m) => m.module === name)?.total ?? 0;
  const modulesWithRows = MODULE_ORDER.filter((name) => moduleTotal(name) > 0);

  const markOne = async (row: Notification, read: boolean) => {
    setItems((prev) => prev.map((n) => (n.id === row.id ? { ...n, read } : n)));
    try {
      await notificationService.markRead(row.id, read);
      void loadSummary();
    } catch (err) {
      setItems((prev) => prev.map((n) => (n.id === row.id ? { ...n, read: !read } : n)));
      toast.error(err instanceof Error ? err.message : "Could not update that notification");
    }
  };

  /** "all" clears everything the reader can see; a name clears that department. */
  const markAllRead = async (module: NotificationModuleName | "all") => {
    setBusy(true);
    try {
      await notificationService.markAllRead(module === "all" ? undefined : module);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      await loadSummary();
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
      toast.success(
        module && module !== "all"
          ? `${NOTIFICATION_MODULES[module].short} marked as read`
          : "All notifications marked as read",
        { description: "Yours only — colleagues' unread counts are untouched." },
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not mark them as read");
    } finally {
      setBusy(false);
    }
  };

  /**
   * Removing a notification clears it for the reader only. Most rows are shared
   * — a broadcast, or every holder of a role — so a hard delete would wipe a
   * colleague's alert to tidy one person's list.
   */
  const removeNotification = async (row: Notification) => {
    setDeletingId(row.id);
    try {
      await notificationService.remove(row.id);
      setItems((prev) => prev.filter((x) => x.id !== row.id));
      await loadSummary();
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
      await loadList();
      await loadSummary();
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

  // Paginated like every other table — the center must never be an endless scroll.
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

  /** Rows naming one of this reader's roles, and how many of those are unread. */
  const myQueueTotal = summary?.actionAll ?? summary?.action ?? 0;
  const myQueueUnread = summary?.action ?? 0;

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-5 max-md:px-4 md:gap-[30px] md:p-[30px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Notification</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            every department&apos;s alerts, filed by where they came from
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={busy || unreadCount === 0}
            onClick={() => void markAllRead(moduleFilter)}
            className="flex h-8 items-center justify-center gap-1.5 rounded border border-[#E2E5E9] bg-white px-3 text-[13px] font-medium tracking-[0.4px] text-[#1B2432] shadow-[0px_1px_2px_rgba(12,12,13,0.05)] disabled:opacity-40"
          >
            <CheckCheck className="size-4" strokeWidth={1.75} />
            {moduleFilter === "all"
              ? "Mark all as Read"
              : `Mark ${NOTIFICATION_MODULES[moduleFilter].short} as Read`}
          </button>
          <button
            type="button"
            disabled={readCount === 0}
            onClick={() => void clearNotifications("read")}
            className="flex h-8 items-center justify-center rounded border border-[#E2E5E9] bg-white px-3 text-[13px] font-medium tracking-[0.4px] text-[#1B2432] shadow-[0px_1px_2px_rgba(12,12,13,0.05)] disabled:opacity-40"
          >
            Clear Read
          </button>
          <button
            type="button"
            disabled={items.length === 0}
            onClick={() => setConfirmClear(true)}
            className="flex h-8 items-center justify-center gap-1.5 rounded border border-[#E2E5E9] bg-white px-3 text-[13px] font-medium tracking-[0.4px] text-[#B42318] shadow-[0px_1px_2px_rgba(12,12,13,0.05)] disabled:opacity-40"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            Clear All
          </button>
        </div>
      </div>

      {/* ---- the two questions the TM actually asks: mine, and from whom ---- */}
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          {(
            [
              // Counts are the SIZE of each list, so a chip never promises a
              // different number from the page it opens.
              { id: "all" as Scope, label: "Everything", count: summary?.total ?? 0 },
              { id: "mine" as Scope, label: "Needs me", count: myQueueTotal },
              { id: "unread" as Scope, label: "Unread", count: summary?.unread ?? 0 },
            ] as const
          ).map((scopeOption) => (
            <button
              key={scopeOption.id}
              type="button"
              onClick={() => {
                setScope(scopeOption.id);
                setPage(0);
              }}
              className={cn(
                "flex h-8 items-center gap-2 rounded px-3 text-[13px] font-medium tracking-[0.4px]",
                scope === scopeOption.id
                  ? "bg-[#1B2432] text-white"
                  : "bg-white text-[#141A1F] ring-1 ring-[#E2E5E9]",
              )}
            >
              {scopeOption.label}
              <span
                className={cn(
                  "grid h-5 min-w-[20px] place-items-center rounded px-1 text-[11px] font-semibold",
                  scope === scopeOption.id
                    ? "bg-white/20 text-white"
                    : "bg-[#F1F2F4] text-[#5C6470]",
                )}
              >
                {scopeOption.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative md:ml-auto md:w-[320px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#8E95A1]" />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Search dispatch, truck, staff…"
            className="h-9 w-full rounded border border-[#E2E5E9] bg-white pl-9 pr-8 text-[13px] text-[#1B2432] placeholder:text-[#8E95A1]"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-[#8E95A1] hover:text-[#1B2432]"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* ---- the rail: one line per department that has sent something ---- */}
        <aside className="flex shrink-0 flex-col overflow-hidden rounded-[10px] bg-white shadow-[0px_4px_4px_rgba(12,12,13,0.05)] lg:w-[286px]">
          <button
            type="button"
            onClick={() => {
              setModuleFilter("all");
              setPage(0);
            }}
            className={cn(
              "flex items-center gap-3 border-b border-[#F1F2F4] px-4 py-3 text-left",
              moduleFilter === "all" ? "bg-[#F7F8FA]" : "hover:bg-[#FAFBFC]",
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center rounded bg-[#1B2432] text-white">
              <Inbox className="size-4" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-[#1B2432]">
                All departments
              </span>
              <span className="block text-[11px] text-[#8E95A1]">
                {summary?.total ?? 0} alerts · {summary?.unread ?? 0} unread
              </span>
            </span>
          </button>

          {modulesWithRows.map((name) => {
            const Icon = MODULE_ICON[name];
            const unread = moduleCount(name);
            const shape = NOTIFICATION_MODULES[name];
            return (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setModuleFilter(name);
                  setPage(0);
                }}
                className={cn(
                  "flex items-center gap-3 border-b border-[#F1F2F4] px-4 py-3 text-left last:border-b-0",
                  moduleFilter === name ? "bg-[#F7F8FA]" : "hover:bg-[#FAFBFC]",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded",
                    moduleFilter === name
                      ? "bg-[#ED351D] text-white"
                      : "bg-[#F1F2F4] text-[#5C6470]",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-[#1B2432]">
                    {shape.short}
                  </span>
                  <span className="block truncate text-[11px] text-[#8E95A1]">{shape.blurb}</span>
                </span>
                {unread > 0 ? (
                  <span className="grid h-5 min-w-[22px] shrink-0 place-items-center rounded bg-[#ED351D] px-1 text-[11px] font-semibold text-white">
                    {unread}
                  </span>
                ) : (
                  <Check className="size-4 shrink-0 text-[#12B76A]" strokeWidth={2} />
                )}
              </button>
            );
          })}
        </aside>

        {/* ---- the list ---- */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-[10px] bg-white shadow-[0px_4px_4px_rgba(12,12,13,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(92,100,112,0.3)] px-5 py-2.5">
            <h3 className="text-[18px] font-semibold tracking-[0.4px] text-[#1B2432]">
              {moduleFilter === "all"
                ? "All departments"
                : NOTIFICATION_MODULES[moduleFilter].short}
              {scope === "mine"
                ? ` · needs me${myQueueUnread > 0 ? ` (${myQueueUnread} unread)` : ""}`
                : scope === "unread"
                  ? " · unread"
                  : ""}
            </h3>
            <span className="text-[12px] text-[#8E95A1]">
              {loadingList
                ? "Refreshing…"
                : `${rows.length} ${rows.length === 1 ? "alert" : "alerts"}`}
            </span>
          </div>

          {pageRows.map((row) => {
            const target = notificationTarget(row);
            const tone = severityTone(row);
            const shape = NOTIFICATION_MODULES[moduleOf(row)];
            return (
              <div
                key={row.id}
                className={cn(
                  "flex w-full items-stretch border-b border-[#E2E5E9] last:border-b-0",
                  row.read ? "bg-white" : "bg-[#F4F9FF]",
                )}
              >
                <span
                  className={cn(
                    "w-[3px] shrink-0",
                    row.read ? "bg-transparent" : SEVERITY_CLASS[tone],
                  )}
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-[#F1F2F4] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-[#5C6470]">
                      {shape.short}
                    </span>
                    {row.actionRequired ? (
                      <span className="rounded bg-[#1B2432] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4px] text-white">
                        Needs you
                      </span>
                    ) : null}
                    <span className="text-[14px] font-semibold tracking-[0.2px] text-[#1B2432]">
                      {row.title}
                    </span>
                    {!row.read ? (
                      <span className={cn("size-2 rounded-full", SEVERITY_CLASS[tone])} />
                    ) : null}
                    <span
                      className="ml-auto shrink-0 text-[11px] text-[#8E95A1]"
                      title={absoluteStamp(row)}
                    >
                      {relativeAge(row)}
                    </span>
                  </div>

                  {row.body ? (
                    <p className="text-[13px] leading-5 text-[#5C6470]">{row.body}</p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2">
                    {target.record ? (
                      <span className="rounded border border-[#E2E5E9] px-1.5 py-0.5 text-[11px] font-semibold tracking-[0.4px] text-[#1B2432]">
                        {target.record}
                      </span>
                    ) : null}
                    <Link
                      to={target.to}
                      className="text-[12px] font-medium text-[#2463EB] hover:underline"
                    >
                      {target.label} →
                    </Link>
                    <button
                      type="button"
                      onClick={() => void markOne(row, !row.read)}
                      className="ml-auto flex h-7 items-center gap-1 rounded border border-[#E2E5E9] px-2 text-[11px] font-medium text-[#5C6470] hover:bg-[#F6F7F9]"
                    >
                      {row.read ? (
                        <>
                          <Bell className="size-3.5" strokeWidth={1.8} />
                          Mark unread
                        </>
                      ) : (
                        <>
                          <Check className="size-3.5" strokeWidth={2} />
                          Mark read
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove notification: ${row.title}`}
                      title="Remove from your notification center"
                      disabled={deletingId === row.id}
                      onClick={() => void removeNotification(row)}
                      className="grid size-7 place-items-center rounded text-[#8E95A1] hover:text-[#B42318] disabled:opacity-40"
                    >
                      <Trash2 className="size-4" strokeWidth={1.6} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {rows.length === 0 && (
            <FigmaEmptyState
              title={
                scope === "mine"
                  ? moduleFilter === "all"
                    ? "Nothing is waiting on you"
                    : `Nothing from ${NOTIFICATION_MODULES[moduleFilter].short} needs you`
                  : "No notifications here"
              }
              body={
                scope === "mine"
                  ? "Requests to approve, litres to release and parts to authorise land here. Their news sits under Everything."
                  : "Operational alerts appear here as the departments raise them."
              }
            />
          )}

          {rows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2.5 border-t border-[#E2E5E9] px-5 py-4">
              <span className="text-[15px] font-semibold tracking-[0.4px] text-[#1B2432]">
                {from} - {to} of {rows.length}
              </span>
              <div className="ml-auto flex items-center gap-2.5">
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
