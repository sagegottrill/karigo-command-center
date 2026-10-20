/**
 * Messages — the trip-context communication panel.
 *
 * ONE THREAD PER DISPATCH (the server creates it), so every conversation is
 * anchored to a real dispatch rather than being a generic inbox:
 *
 *   left   — the dispatches you are party to, newest activity first, unread first
 *   centre — the thread itself, with author + exact stamp under every message
 *   right  — the context panel: trip, partner, truck, body, driver, status, route
 *
 * Partners never reach this page (they get the same thread on their own ticket,
 * scoped to their company server-side).
 */
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, MessageSquare, Plus, RefreshCw, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import { TripChatPanel } from "@/components/fleetopsx/trip-chat";
import { authService, driverService, tripService } from "@/lib/fleetopsx/services";
import {
  attachTrips,
  chatContextRows,
  chatService,
  chatTimeLabel,
  CHAT_POLL_MS,
  threadHeading,
  threadPartner,
  threadSubtitle,
  threadTruckLabel,
  withTyping,
  type ChatDirectoryEntry,
  type ChatThread,
} from "@/lib/fleetopsx/chat";
import { useAutoRefresh } from "@/lib/fleetopsx/use-auto-refresh";
import type { Driver, Trip } from "@/lib/fleetopsx/types";
import { cn } from "@/lib/utils";

const STAFF_ROLES = [
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
  "Platform Admin",
];

export const Route = createFileRoute("/workspace/app/messages")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    const roles = authService.getRoles();
    if (
      roles.includes("Customer Portals (External)") &&
      !roles.some((r: string) => STAFF_ROLES.includes(r))
    ) {
      throw redirect({ to: "/workspace/customer-portal/dashboard" });
    }
    if (!roles.some((r: string) => STAFF_ROLES.includes(r))) {
      throw redirect({ to: "/workspace/app/unauthorized" });
    }
  },
  component: MessagesPage,
});

/** Newest activity first; a thread nobody has written in yet sinks to the bottom. */
function lastActivity(thread: ChatThread): number {
  const last = thread.messages.length ? thread.messages[thread.messages.length - 1] : null;
  const raw = last?.at || thread.lastAt || "";
  const t = raw ? new Date(raw).getTime() : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
}

function sortThreads(a: ChatThread, b: ChatThread) {
  // Anything waiting on a reply leads — a chat where you moved last can wait.
  if (Boolean(a.unread) !== Boolean(b.unread)) return a.unread ? -1 : 1;
  return lastActivity(b) - lastActivity(a);
}

function MessagesPage() {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "dms" | "unread">("all");
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const [directory, setDirectory] = useState<ChatDirectoryEntry[]>([]);
  // The New Chat flow: colleague picker → optional name → open the thread.
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatQuery, setNewChatQuery] = useState("");
  const [newChatPicked, setNewChatPicked] = useState<ChatDirectoryEntry[]>([]);
  const [newChatName, setNewChatName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [conversations, tripRows, driverRows, dir] = await Promise.all([
        chatService.list(),
        tripService.list().catch(() => [] as Trip[]),
        driverService.list().catch(() => [] as Driver[]),
        // The directory is what powers "New Chat" and live presence; if the
        // upgraded API is not deployed yet the page still works without it.
        chatService.directory().catch(() => [] as ChatDirectoryEntry[]),
      ]);
      setThreads(conversations);
      setTrips(tripRows);
      setDrivers(driverRows);
      setDirectory(dir);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load conversations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Near real-time: a reply from another desk lands without a reload.
  useAutoRefresh(() => void load(), [load], { interval: CHAT_POLL_MS });

  // Presence heartbeat: this desk is here. Direct, so it stays cheap and never
  // floods the badge refresh.
  useEffect(() => {
    const beat = () => void chatService.presence();
    beat();
    const t = window.setInterval(beat, 45_000);
    return () => window.clearInterval(t);
  }, []);

  // Presence heartbeat: this desk is here. Sent directly (not through the
  // poller) so it stays cheap and never floods the badge refresh.
  useEffect(() => {
    const beat = () => void chatService.presence();
    beat();
    const t = window.setInterval(beat, 45_000);
    return () => window.clearInterval(t);
  }, []);

  const withTrips = useMemo(
    () => withTyping(attachTrips(threads, trips), directory).sort(sortThreads),
    [threads, trips, directory],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return withTrips.filter((thread) => {
      if (filter === "unread" && !thread.unread) return false;
      if (filter === "dms" && thread.tripId) return false;
      if (!q) return true;
      const haystack = [
        threadPartner(thread),
        threadTruckLabel(thread),
        threadSubtitle(thread),
        thread.trip?.customerConsignee,
        thread.trip?.status,
        thread.messages[thread.messages.length - 1]?.body,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [withTrips, query, filter]);

  const selected: ChatThread | null =
    withTrips.find((t) => t.id === selectedId) ?? rows[0] ?? withTrips[0] ?? null;
  const unreadTotal = withTrips.reduce((sum, t) => sum + (t.unread || 0), 0);

  const openThread = (thread: ChatThread) => {
    setSelectedId(thread.id);
    setMobileThreadOpen(true);
    if (thread.unread > 0) {
      void chatService
        .markRead(thread.id)
        .then(() => {
          setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, unread: 0 } : t)));
          window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
        })
        .catch(() => {});
    }
  };

  const applyThread = (updated: ChatThread) => {
    setThreads((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
  };

  /** Typing heartbeat into the open thread (fires on open and per keystroke). */
  const onPresence = useCallback(
    (conversationId?: string) => {
      void chatService.presence(conversationId);
    },
    [],
  );

  const directoryMatches = useMemo(() => {
    const q = newChatQuery.trim().toLowerCase();
    return directory
      .filter((d) => d.id !== authService.getCurrentUser()?.id)
      .filter((d) => !q || d.name.toLowerCase().includes(q) || d.role.toLowerCase().includes(q))
      .slice(0, 30);
  }, [directory, newChatQuery]);

  const pickForNewChat = (entry: ChatDirectoryEntry) => {
    setNewChatPicked((prev) =>
      prev.some((p) => p.id === entry.id)
        ? prev.filter((p) => p.id !== entry.id)
        : [...prev, entry],
    );
  };

  /**
   * Create the chat: one person picked ⇒ direct message (thread reused if the
   * pair already has one); several ⇒ named group.
   */
  const createNewChat = async () => {
    if (!newChatPicked.length) return;
    setCreating(true);
    try {
      const thread =
        newChatPicked.length === 1
          ? await chatService.startDirect(newChatPicked[0]!.id)
          : await chatService.startGroup(
              newChatName.trim() || newChatPicked.map((p) => p.name.split(" ")[0]).join(", "),
              newChatPicked.map((p) => p.id),
            );
      setThreads((prev) => (prev.some((t) => t.id === thread.id) ? prev : [thread, ...prev]));
      setSelectedId(thread.id);
      setMobileThreadOpen(true);
      setNewChatOpen(false);
      setNewChatPicked([]);
      setNewChatName("");
      setNewChatQuery("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start chat");
    } finally {
      setCreating(false);
    }
  };

  const contextRows = selected ? chatContextRows(selected, drivers) : [];

  return (
    <div className="flex w-full flex-col gap-5 bg-[#F1F2F4] p-5 max-md:px-4 md:gap-[30px] md:p-[30px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-[5px]">
          <h2 className="text-[24px] font-medium leading-8 text-[#1B2432]">Messages</h2>
          <p className="text-[11.4px] font-normal uppercase leading-4 tracking-[0.4px] text-[rgba(92,100,112,0.6)]">
            one operations thread for every dispatch
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {unreadTotal > 0 ? (
            <span className="flex h-8 items-center gap-2 rounded border border-[#E2E5E9] bg-white px-3 text-[13px] font-medium tracking-[0.4px] text-[#ED351D]">
              {unreadTotal} unread
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setNewChatOpen(true)}
            className="flex h-8 items-center gap-2 rounded bg-[#1B2432] px-3 text-[14px] font-medium tracking-[0.4px] text-white shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
          >
            <Plus className="size-4" strokeWidth={1.75} />
            New Chat
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="flex h-8 items-center gap-2 rounded border border-[#E2E5E9] bg-white px-3 text-[14px] font-medium tracking-[0.4px] text-[#1B2432] shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
          >
            <RefreshCw className="size-4" strokeWidth={1.75} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <FigmaLoadingState label="Loading conversations…" />
      ) : withTrips.length === 0 ? (
        <div className="rounded-[10px] bg-white shadow-[0px_4px_4px_rgba(12,12,13,0.05)]">
          <FigmaEmptyState
            title="No dispatch threads yet"
            body="A conversation is created automatically for every dispatch the Transport Manager approves."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_300px]">
          {/* LEFT — the dispatch threads this user is party to */}
          <div
            className={cn(
              "flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white shadow-[0px_4px_4px_rgba(12,12,13,0.05)]",
              mobileThreadOpen && "max-md:hidden",
            )}
          >
            <div className="flex flex-col gap-2.5 border-b border-[#E2E5E9] p-3">
              <div className="flex items-center gap-2 rounded border border-[#E2E5E9] bg-white px-2.5">
                <Search className="size-4 shrink-0 text-[#8A9099]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search partner, truck, driver…"
                  aria-label="Search conversations"
                  className="h-9 w-full bg-transparent text-[14px] tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#8A9099]"
                />
              </div>
              <div className="flex items-center gap-2">
                {(["all", "dms", "unread"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={cn(
                      "h-7 rounded px-3 text-[12px] font-medium capitalize tracking-[0.4px]",
                      filter === f
                        ? "bg-[#1B2432] text-white"
                        : "bg-[rgba(226,229,233,0.5)] text-[#141A1F]",
                    )}
                  >
                    {f === "dms" ? "Direct" : f}
                  </button>
                ))}
                <span className="ml-auto text-[12px] tracking-[0.4px] text-[#8A9099]">
                  {rows.length} of {withTrips.length}
                </span>
              </div>
            </div>

            <div className="max-h-[520px] min-h-[240px] flex-1 overflow-y-auto xl:max-h-[calc(100vh-320px)]">
              {rows.length === 0 ? (
                <FigmaEmptyState
                  title="Nothing matches"
                  body="Try a different partner, plate or driver."
                />
              ) : (
                rows.map((thread) => {
                  const last = thread.messages[thread.messages.length - 1];
                  const active = selected?.id === thread.id;
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      onClick={() => openThread(thread)}
                      className={cn(
                        "flex w-full flex-col gap-1 border-b border-[#E2E5E9] px-3 py-3 text-left last:border-b-0",
                        active ? "bg-[#FDECEA]" : "bg-white hover:bg-[#F7F8FA]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">
                          {threadPartner(thread) || "Petroline"}
                        </span>
                        <span className="shrink-0 text-[11px] tracking-[0.4px] text-[#8A9099]">
                          {chatTimeLabel(last?.at || thread.lastAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[12px] tracking-[0.4px] text-[#5C6470]">
                          {threadTruckLabel(thread) || threadHeading(thread)}
                        </span>
                        {thread.unread > 0 ? (
                          <span className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-[#ED351D] text-[11px] font-medium text-white">
                            {thread.unread > 9 ? "9+" : thread.unread}
                          </span>
                        ) : null}
                      </div>
                      <span className="truncate text-[12px] tracking-[0.4px] text-[#8A9099]">
                        {last
                          ? `${last.self ? "You: " : `${last.author.split(" ")[0]}: `}${last.body}`
                          : "No messages yet"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* CENTRE — the thread */}
          <div className={cn("flex min-w-0 flex-col gap-3", !mobileThreadOpen && "max-md:hidden")}>
            <button
              type="button"
              onClick={() => setMobileThreadOpen(false)}
              className="flex items-center gap-2 text-[13px] font-medium tracking-[0.4px] text-[#5C6470] md:hidden"
            >
              <ArrowLeft className="size-4" />
              All conversations
            </button>
            <TripChatPanel
              thread={selected}
              onThreadChange={applyThread}
              onPresence={onPresence}
              placeholder={
                selected?.tripId ? "Write a message about this dispatch…" : "Write a message…"
              }
            />
          </div>

          {/* RIGHT — what this conversation is about */}
          <aside className="hidden min-w-0 flex-col gap-3 xl:flex">
            {selected ? (
              <>
                <div className="overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white shadow-[0px_4px_4px_rgba(12,12,13,0.05)]">
                  <div className="flex items-center gap-2 border-b border-[#E2E5E9] px-4 py-3">
                    <MessageSquare className="size-4 text-[#ED351D]" strokeWidth={1.75} />
                    <h3 className="text-[14px] font-semibold tracking-[0.4px] text-[#1B2432]">
                      Dispatch context
                    </h3>
                  </div>
                  <dl className="flex flex-col">
                    {contextRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-start justify-between gap-3 border-b border-[#E2E5E9] px-4 py-2 last:border-b-0"
                      >
                        <dt className="shrink-0 text-[12px] uppercase tracking-[0.4px] text-[#8A9099]">
                          {row.label}
                        </dt>
                        <dd
                          className={cn(
                            "max-w-[62%] text-right text-[13px] tracking-[0.4px] text-[#1B2432]",
                            row.mono && "font-medium",
                          )}
                        >
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
                {selected.trip ? (
                  <Link
                    to="/workspace/app/active-dispatch/$dispatchId"
                    params={{ dispatchId: selected.trip.id }}
                    className="flex h-10 items-center justify-center gap-2 rounded border border-[#E2E5E9] bg-white text-[14px] font-medium tracking-[0.4px] text-[#1B2432] shadow-[0px_1px_2px_rgba(12,12,13,0.05)]"
                  >
                    <ExternalLink className="size-4" strokeWidth={1.75} />
                    Open dispatch
                  </Link>
                ) : null}
              </>
            ) : null}
          </aside>
        </div>
      )}

      {/* NEW CHAT — pick a colleague (or a few) from the staff directory. One
          person opens a direct message; several open a named group. */}
      {newChatOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#141A1F]/60 p-4"
          onClick={() => setNewChatOpen(false)}
        >
          <div
            className="mt-16 w-full max-w-[480px] rounded-[10px] bg-white p-5 shadow-[0px_8px_24px_rgba(12,12,13,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[16px] font-semibold leading-6 text-[#1B2432]">New Chat</h3>
                <p className="text-[12px] tracking-[0.4px] text-[#5C6470]">
                  Pick one colleague for a direct message, or several for a group.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewChatOpen(false)}
                className="grid size-8 place-items-center rounded text-[#5C6470] hover:bg-[#F1F2F4]"
                aria-label="Close"
              >
                <X className="size-4" strokeWidth={1.75} />
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {newChatPicked.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickForNewChat(p)}
                  className="flex items-center gap-1 rounded-full bg-[#1B2432] px-2.5 py-1 text-[12px] font-medium text-white"
                >
                  {p.name}
                  <X className="size-3" strokeWidth={2} />
                </button>
              ))}
            </div>

            {newChatPicked.length > 1 ? (
              <input
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                placeholder="Group name (optional)"
                className="mb-3 h-10 w-full rounded border border-[#E2E5E9] px-3 text-[14px] text-[#1B2432] outline-none focus:border-[#1B2432]"
              />
            ) : null}

            <div className="mb-3 flex items-center gap-2 rounded border border-[#E2E5E9] px-2.5">
              <Search className="size-4 shrink-0 text-[#8A9099]" />
              <input
                value={newChatQuery}
                onChange={(e) => setNewChatQuery(e.target.value)}
                placeholder="Search staff by name or role…"
                className="h-9 w-full bg-transparent text-[14px] text-[#1B2432] outline-none placeholder:text-[#8A9099]"
              />
            </div>

            <div className="max-h-[320px] min-h-[160px] overflow-y-auto rounded border border-[#E2E5E9]">
              {directoryMatches.length === 0 ? (
                <FigmaEmptyState title="No colleagues found" body="Staff accounts appear here once they exist."
                />
              ) : (
                directoryMatches.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => pickForNewChat(d)}
                    className={cn(
                      "flex w-full items-center gap-2.5 border-b border-[#E2E5E9] px-3 py-2.5 text-left last:border-b-0",
                      newChatPicked.some((p) => p.id === d.id) ? "bg-[#FDECEA]" : "hover:bg-[#F7F8FA]",
                    )}
                  >
                    <span className="relative shrink-0">
                      <span className="grid size-8 place-items-center rounded-full bg-[#E2E5E9] text-[11px] font-semibold text-[#5C6470]">
                        {d.initials}
                      </span>
                      {d.online ? (
                        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-white bg-[#0A7F58]" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[#1B2432]">
                        {d.name}
                      </span>
                      <span className="block truncate text-[12px] text-[#5C6470]">
                        {d.role}
                        {d.typingIn ? " · typing…" : d.online ? " · online" : ""}
                      </span>
                    </span>
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              disabled={!newChatPicked.length || creating}
              onClick={() => void createNewChat()}
              className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded bg-[#ED351D] text-[14px] font-medium tracking-[0.4px] text-white transition-colors hover:bg-[#d62e19] disabled:opacity-40"
            >
              {creating
                ? "Starting…"
                : newChatPicked.length > 1
                  ? `Start group (${newChatPicked.length})`
                  : "Start direct message"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
