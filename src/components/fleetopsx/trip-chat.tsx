/**
 * The conversation panel — ONE thread, rendered identically wherever it appears
 * (the Messages portal's centre pane and the partner's ticket). Keeping it in one
 * component is what stops the two sides drifting into two different chats.
 *
 * Every message prints the AUTHOR and the exact stamp UNDER the bubble, so a
 * thread is evidence of who said what and when, not just a wall of text.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { FigmaEmptyState, FigmaLoadingState } from "@/components/fleetopsx/figma-empty-state";
import {
  chatDayLabel,
  chatService,
  chatStampLabel,
  chatTimeLabel,
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

export function TripChatPanel({
  thread,
  onThreadChange,
  loading = false,
  placeholder = "Write a message about this dispatch…",
  heightClass = "h-[calc(100vh-260px)] min-h-[380px]",
}: {
  thread: ChatThread | null;
  onThreadChange?: (thread: ChatThread) => void;
  loading?: boolean;
  placeholder?: string;
  heightClass?: string;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = thread?.messages ?? [];
  const lastId = messages.length ? (messages[messages.length - 1]?.id ?? "") : "";

  // Stick to the newest message whenever the thread (or its contents) change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread?.id, lastId]);

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
            <p className="truncate text-[12px] tracking-[0.4px] text-[#5C6470]">
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
              {group.items.map((m) => (
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
                    <div
                      className={cn(
                        "whitespace-pre-wrap break-words rounded-[10px] px-3 py-2 text-[14px] leading-5 tracking-[0.4px] shadow-[0px_1px_2px_rgba(12,12,13,0.05)]",
                        m.self
                          ? "bg-[#ED351D] text-white"
                          : "border border-[#E2E5E9] bg-white text-[#1B2432]",
                      )}
                    >
                      {m.body}
                    </div>
                    {/* The stamp sits UNDER every message — never hidden in a tooltip. */}
                    <span className="text-[11px] tracking-[0.4px] text-[#8A9099]">
                      {chatStampLabel(m.at || m.time) || chatTimeLabel(m.at || m.time)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="flex shrink-0 items-end gap-2 border-t border-[#E2E5E9] bg-white px-4 py-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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
