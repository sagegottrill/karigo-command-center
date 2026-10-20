/**
 * The conversation panel — ONE thread, rendered identically wherever it appears
 * (the Messages portal's centre pane and the partner's ticket). Keeping it in one
 * component is what stops the two sides drifting into two different chats.
 *
 * Every message prints the AUTHOR and the exact stamp UNDER the bubble, so a
 * thread is evidence of who said what and when, not just a wall of text.
 *
 * Enterprise layer: reactions (one emoji per person, toggleable), edit and
 * recall on your own messages, and a live presence strip that shows who of the
 * thread's members is online or typing right now.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCheck, Pencil, RefreshCcw, Send, Smile, X } from "lucide-react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  chatDayLabel,
  chatService,
  chatStampLabel,
  chatTimeLabel,
  type ChatDirectoryEntry,
  type ChatThread,
} from "@/lib/fleetopsx/chat";
import { cn } from "@/lib/utils";

/** Initials for the avatar chip: "Daniel Dibal" → "DD". */
function initialsOf(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

const ROLE_TONE: Record<string, string> = {
  Partner: "bg-[#EAF3FF] text-[#1D4ED8]",
  "Transport Manager": "bg-[#FDECEA] text-[#ED351D]",
  "Fleet Operations": "bg-[#EAF7F1] text-[#0A7F58]",
  Tracking: "bg-[#EEF0FF] text-[#4338CA]",
  Security: "bg-[#FFF4E5] text-[#B45309]",
};

/** The four reactions an operations thread actually uses. */
const REACTIONS = ["👍", "✅", "❗", "🙏"];

export function TripChatPanel({
  thread,
  onThreadChange,
  onPresence,
  loading = false,
  placeholder = "Write a message about this dispatch…",
  heightClass = "h-[calc(100vh-260px)] min-h-[380px]",
  onOpenInfo,
}: {
  thread: ChatThread | null;
  onThreadChange?: (thread: ChatThread) => void;
  /** Called on open/typing so the page can heartbeat presence for this thread. */
  onPresence?: (conversationId?: string) => void;
  loading?: boolean;
  placeholder?: string;
  heightClass?: string;
  /** DM/group threads surface a "details" affordance (roster, members). */
  onOpenInfo?: (thread: ChatThread) => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editingBody, setEditingBody] = useState("");
  const [reactingId, setReactingId] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = thread?.messages ?? [];
  const lastId = messages.length ? (messages[messages.length - 1]?.id ?? "") : "";
  // Seen-by receipts: fetched per thread, refreshed on each new message.
  const [receipts, setReceipts] = useState<{ userId: string; name: string; lastReadAt: string | null }[]>([]);
  useEffect(() => {
    if (!thread || thread.tripId || !thread.memberIds?.length) {
      setReceipts([]);
      return;
    }
    let cancelled = false;
    chatService
      .receipts(thread.id)
      .then((rows) => {
        if (!cancelled) setReceipts(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [thread?.id, thread?.memberIds?.length, lastId]);

  // Stick to the newest message whenever the thread (or its contents) change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.id, lastId]);

  // Presence: announce the open thread once, then every keystroke.
  useEffect(() => {
    if (thread && onPresence) onPresence(thread.id);
  }, [thread?.id, onPresence]);

  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: typeof messages }> = [];
    for (const m of messages) {
      const day = chatDayLabel(m.at || m.time) || "Earlier";
      const bucket = out[out.length - 1];
      if (bucket && bucket.day === day) bucket.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !thread || sending) return;
    setSending(true);
    try {
      const updated = await chatService.send(thread.id, body);
      setDraft("");
      onThreadChange?.(updated);
      window.dispatchEvent(new Event("fleetopsx:badges-refresh"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Message not sent");
    } finally {
      setSending(false);
    }
  };

  const startEdit = (id: string, body: string) => {
    setEditingId(id);
    setEditingBody(body);
    setReactingId("");
  };

  const commitEdit = async () => {
    if (!thread || !editingId) return;
    const next = editingBody.trim();
    const original = messages.find((m) => m.id === editingId)?.body ?? "";
    if (!next || next === original) {
      setEditingId("");
      return;
    }
    try {
      const updated = await chatService.editMessage(thread.id, editingId, next);
      setEditingId("");
      setEditingBody("");
      onThreadChange?.(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not edit");
    }
  };

  const recall = async (messageId: string) => {
    if (!thread) return;
    try {
      const updated = await chatService.editMessage(thread.id, messageId, "");
      setEditingId("");
      onThreadChange?.(updated);
      toast.success("Message recalled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not recall");
    }
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    if (!thread) return;
    setReactingId("");
    try {
      const updated = await chatService.react(thread.id, messageId, emoji);
      onThreadChange?.(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not react");
    }
  };

  /**
   * A message is SEEN when every other member has read past its stamp.
   * DMs: one receipt. Groups: the minimum of the others' read positions.
   */
  const seenThrough = useMemo(() => {
    const valid = receipts.filter((r) => r.lastReadAt);
    if (!valid.length) return 0;
    return Math.min(...valid.map((r) => new Date(r.lastReadAt!).getTime()));
  }, [receipts]);

  const typingInThread: ChatDirectoryEntry[] = (thread?.typingUsers ?? []).filter(Boolean);

  if (!thread) {
    return (
      <div
        className={cn(
          "flex flex-col overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white",
          heightClass,
        )}
      >
        <FigmaEmptyState
          title="No conversation selected"
          body="Pick a dispatch on the left to read and add to its operations thread."
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-[10px] border border-[#E2E5E9] bg-white shadow-[0px_4px_4px_rgba(12,12,13,0.05)]",
        heightClass,
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#E2E5E9] px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-semibold leading-6 tracking-[0.4px] text-[#1B2432]">
            {thread.name || "Operations Thread"}
          </h3>
          {thread.subtitle ? (
            <p
              className={cn(
                "truncate text-[12px] tracking-[0.4px] text-[#5C6470]",
                !thread.tripId && onOpenInfo && "cursor-pointer hover:text-[#1B2432] hover:underline",
              )}
              onClick={() => !thread.tripId && onOpenInfo?.(thread)}
              role={!thread.tripId && onOpenInfo ? "button" : undefined}
            >
              {thread.subtitle}
            </p>
          ) : null}
        </div>
        {thread.participants.length ? (
          <div className="hidden max-w-[46%] flex-wrap justify-end gap-1 md:flex">
            {thread.participants.map((p) => (
              <span
                key={p}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.4px]",
                  ROLE_TONE[p] || "bg-[#F1F2F4] text-[#5C6470]",
                )}
              >
                {p}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[#F7F8FA] px-4 py-4"
      >
        {loading && messages.length === 0 ? (
          <FigmaLoadingState label="Loading conversation…" />
        ) : messages.length === 0 ? (
          <FigmaEmptyState
            title="No messages yet"
            body="Start the thread — anything agreed here stays with the dispatch."
          />
        ) : (
          grouped.map((group) => (
            <div key={group.day} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-[#E2E5E9]" />
                <span className="text-[11px] font-medium uppercase tracking-[0.4px] text-[#8A9099]">
                  {group.day}
                </span>
                <span className="h-px flex-1 bg-[#E2E5E9]" />
              </div>
              {group.items.map((m) => {
                const isEditing = editingId === m.id;
                const reacting = reactingId === m.id;
                const counts = new Map<string, { emoji: string; names: string[] }>();
                for (const r of m.reactions ?? []) {
                  const bucket = counts.get(r.emoji);
                  if (bucket) bucket.names.push(r.name);
                  else counts.set(r.emoji, { emoji: r.emoji, names: [r.name] });
                }
                const groupedReactions = [...counts.values()];
                return (
                  <div
                    key={m.id}
                    className={cn("flex items-end gap-2", m.self ? "flex-row-reverse" : "flex-row")}
                  >
                    <span
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
                        m.self ? "bg-[#1B2432] text-white" : "bg-[#E2E5E9] text-[#5C6470]",
                      )}
                    >
                      {initialsOf(m.author)}
                    </span>
                    <div
                      className={cn(
                        "flex max-w-[78%] flex-col gap-1",
                        m.self ? "items-end" : "items-start",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold tracking-[0.4px] text-[#1B2432]">
                          {m.self ? "You" : m.author}
                        </span>
                        {!m.self ? (
                          <span
                            className={cn(
                              "rounded px-1.5 py-[1px] text-[10px] font-medium uppercase tracking-[0.4px]",
                              ROLE_TONE[m.role] || "bg-[#F1F2F4] text-[#5C6470]",
                            )}
                          >
                            {m.role}
                          </span>
                        ) : null}
                      </div>
                      {isEditing ? (
                        <div className="flex w-full max-w-[320px] items-center gap-1 rounded border border-[#ED351D] bg-white px-2 py-1">
                          <input
                            autoFocus
                            value={editingBody}
                            onChange={(e) => setEditingBody(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void commitEdit();
                              if (e.key === "Escape") setEditingId("");
                            }}
                            className="h-8 w-full bg-transparent text-[14px] tracking-[0.4px] text-[#1B2432] outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => void commitEdit()}
                            className="grid size-7 place-items-center rounded text-[#0A7F58] hover:bg-[#EAF7F1]"
                            aria-label="Save edit"
                          >
                            <Check className="size-4" strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId("")}
                            className="grid size-7 place-items-center rounded text-[#5C6470] hover:bg-[#F1F2F4]"
                            aria-label="Cancel edit"
                          >
                            <X className="size-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "whitespace-pre-wrap break-words rounded-[10px] px-3 py-2 text-[14px] leading-5 tracking-[0.4px] shadow-[0px_1px_2px_rgba(12,12,13,0.05)]",
                            m.recalled
                              ? "border border-dashed border-[#E2E5E9] bg-[#F7F8FA] italic text-[#8A9099]"
                              : m.self
                                ? "bg-[#ED351D] text-white"
                                : "border border-[#E2E5E9] bg-white text-[#1B2432]",
                          )}
                        >
                          {m.recalled ? "Message recalled" : m.body}
                        </div>
                      )}
                      {m.editedAt && !m.recalled ? (
                        <span className="text-[10px] uppercase tracking-[0.4px] text-[#8A9099]">
                          edited
                        </span>
                      ) : null}
                      {(groupedReactions.length || m.self) && !isEditing ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {groupedReactions.map((r) => (
                            <button
                              key={r.emoji}
                              type="button"
                              title={r.names.join(", ")}
                              onClick={() => void toggleReaction(m.id, r.emoji)}
                              className="flex items-center gap-1 rounded-full border border-[#E2E5E9] bg-white px-1.5 py-[1px] text-[11px] hover:border-[#ED351D]"
                            >
                              {r.emoji}
                              {r.names.length > 1 ? (
                                <span className="text-[10px] text-[#5C6470]">{r.names.length}</span>
                              ) : null}
                            </button>
                          ))}
                          {m.self && !m.recalled ? (
                            <span className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setReactingId(reacting ? "" : m.id);
                                  setEditingId("");
                                }}
                                className="grid size-6 place-items-center rounded-full text-[#8A9099] hover:bg-[#F1F2F4]"
                                aria-label="React"
                              >
                                <Smile className="size-3.5" strokeWidth={1.75} />
                              </button>
                              {reacting
                                ? REACTIONS.map((emoji) => (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => void toggleReaction(m.id, emoji)}
                                      className="rounded-full px-1 text-[14px] hover:bg-[#F1F2F4]"
                                    >
                                      {emoji}
                                    </button>
                                  ))
                                : null}
                              <button
                                type="button"
                                onClick={() => startEdit(m.id, m.body)}
                                className="grid size-6 place-items-center rounded-full text-[#8A9099] hover:bg-[#F1F2F4]"
                                aria-label="Edit message"
                              >
                                <Pencil className="size-3" strokeWidth={1.75} />
                              </button>
                              {!m.recalled ? (
                                <button
                                  type="button"
                                  onClick={() => void recall(m.id)}
                                  className="grid size-6 place-items-center rounded-full text-[#8A9099] hover:bg-[#FDECEA]"
                                  aria-label="Recall message"
                                >
                                  <RefreshCcw className="size-3" strokeWidth={1.75} />
                                </button>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {/* The stamp sits UNDER every message — never hidden in a tooltip. */}
                      <span className="flex items-center gap-1 text-[11px] tracking-[0.4px] text-[#8A9099]">
                        {m.self && !m.recalled && seenThrough && (new Date(m.at || m.time).getTime() || 0) <= seenThrough ? (
                          <CheckCheck className="size-3.5 text-[#0A7F58]" strokeWidth={1.75} aria-label="Seen by everyone" />
                        ) : null}
                        {chatStampLabel(m.at || m.time) || chatTimeLabel(m.at || m.time)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        {typingInThread.length ? (
          <div className="flex items-center gap-2 text-[12px] italic tracking-[0.4px] text-[#5C6470]">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="size-1.5 animate-bounce rounded-full bg-[#8A9099]"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </span>
            {typingInThread.map((t) => t.name.split(" ")[0]).join(", ")}{" "}
            {typingInThread.length === 1 ? "is" : "are"} typing…
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-[#E2E5E9] bg-white px-4 py-3">
        <textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (thread && onPresence) onPresence(thread.id);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="Message"
          className="min-h-10 w-full resize-none rounded border border-[#E2E5E9] bg-white px-3 py-2 text-[14px] leading-5 tracking-[0.4px] text-[#1B2432] outline-none placeholder:text-[#8A9099] focus:border-[#ED351D]"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !draft.trim()}
          className="flex h-10 shrink-0 items-center gap-2 rounded bg-[#ED351D] px-4 text-[14px] font-medium tracking-[0.4px] text-white transition-colors hover:bg-[#d62e19] disabled:opacity-40"
        >
          <Send className="size-4" strokeWidth={1.75} />
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </div>
  );
}
