/**
 * Trip-context chat — the data layer and the display rules behind the Messages
 * portal and the partner's ticket thread.
 *
 * ONE THREAD PER DISPATCH, created on the server the first time anyone opens the
 * list (see the API's `ensureDispatchThreads`). The thread carries its `tripId`,
 * so every screen joins the conversation to the trip it is about rather than
 * showing a generic inbox — that is the difference the spec asks for between
 * "contextual communication" and plain chat.
 *
 * Reading is PER USER: `unread` arrives already counted for whoever asked, so
 * opening a thread on one desk never clears it on another.
 */
import { fetchApi } from "./apiClient";
import { asList } from "./live-api";
import {
  displayCapFromTrip,
  displayDriverSalary,
  displayPlateFromTrip,
  displayTruckAssigned,
} from "./display-ids";
import { formatMovementStamp, formatTableDate } from "./display-dates";
import { displayDispatchId, displayRequestId } from "./request-id";
import { partnerOf, tripLoadingSites } from "./tracking-ops";
import type { Conversation, Driver, Message, Trip } from "./types";

export type { Conversation, Message };

/** A conversation with the trip it belongs to resolved (when we have it). */
export type ChatThread = Conversation & { trip?: Trip | null; typingUsers?: ChatDirectoryEntry[] };

/** Near-real-time: chat is useless if you must reload to see a reply. */
export const CHAT_POLL_MS = 7_000;

function mapMessage(raw: Record<string, unknown>): Message {
  const at = String(raw.at ?? raw.time ?? "");
  return {
    id: String(raw.id ?? ""),
    author: String(raw.author ?? "Unknown"),
    authorId: raw.authorId ? String(raw.authorId) : null,
    role: String(raw.role ?? "Ops"),
    body: String(raw.body ?? ""),
    at,
    time: at,
    self: Boolean(raw.self),
    reactions: Array.isArray(raw.reactions)
      ? (raw.reactions as Record<string, unknown>[]).map((r) => ({
          emoji: String(r.emoji ?? ""),
          userId: String(r.userId ?? ""),
          name: String(r.name ?? ""),
        }))
      : [],
    editedAt: raw.editedAt ? String(raw.editedAt) : null,
    recalled: Boolean(raw.recalled),
  };
}

export function mapThread(raw: Record<string, unknown>): ChatThread {
  return {
    id: String(raw.id ?? ""),
    kind: (raw.kind as Conversation["kind"]) || "trip",
    name: String(raw.name ?? ""),
    subtitle: String(raw.subtitle ?? ""),
    unread: Number(raw.unread ?? 0),
    lastAt: String(raw.lastAt ?? ""),
    tripId: raw.tripId ? String(raw.tripId) : undefined,
    participants: Array.isArray(raw.participants) ? raw.participants.map(String) : [],
    memberIds: Array.isArray(raw.memberIds) ? raw.memberIds.map(String) : [],
    messages: Array.isArray(raw.messages)
      ? (raw.messages as Record<string, unknown>[]).map(mapMessage)
      : [],
  };
}

export type ChatDirectoryEntry = {
  id: string;
  name: string;
  email: string;
  role: string;
  roles: string[];
  phone: string;
  initials: string;
  online: boolean;
  lastSeenAt: string | null;
  typingIn: string;
};

/**
 * Attach live presence to threads: who of a thread's concrete members is typing
 * right now (the server keeps the signal only a few seconds old).
 */
export function withTyping(threads: ChatThread[], directory: ChatDirectoryEntry[]): ChatThread[] {
  const byId = new Map(directory.map((d) => [d.id, d]));
  return threads.map((thread) => ({
    ...thread,
    typingUsers: (thread.memberIds ?? [])
      .map((id) => byId.get(id))
      .filter((d): d is ChatDirectoryEntry => Boolean(d && d.typingIn === thread.id)),
  }));
}

export const chatService = {
  /** Every thread this user may read — the partner is scoped to their company server-side. */
  list: async (): Promise<ChatThread[]> => asList(await fetchApi("/conversations")).map(mapThread),
  send: async (conversationId: string, body: string): Promise<ChatThread> =>
    mapThread(
      await fetchApi(`/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    ),
  markRead: (conversationId: string) =>
    fetchApi(`/conversations/${conversationId}`, {
      method: "PATCH",
      body: JSON.stringify({ unread: 0 }),
    }),
  unreadCount: async (): Promise<number> => {
    const res = await fetchApi<{ count?: number }>("/conversations/unread").catch(() => ({
      count: 0,
    }));
    return Number(res?.count ?? 0) || 0;
  },
  /** Who I can start a chat with — staff directory with live presence. */
  directory: async (): Promise<ChatDirectoryEntry[]> =>
    asList(await fetchApi("/chat/directory")) as ChatDirectoryEntry[],
  /** Start (or reopen) a direct message thread with one colleague. */
  startDirect: async (userId: string): Promise<ChatThread> =>
    mapThread(
      await fetchApi("/conversations", {
        method: "POST",
        body: JSON.stringify({ kind: "direct", memberIds: [userId] }),
      }),
    ),
  /** Start a named group thread with one or more colleagues. */
  startGroup: async (name: string, userIds: string[]): Promise<ChatThread> =>
    mapThread(
      await fetchApi("/conversations", {
        method: "POST",
        body: JSON.stringify({ kind: "group", name, memberIds: userIds }),
      }),
    ),
  /** Edit my own message (or recall it when body is empty). */
  editMessage: async (conversationId: string, messageId: string, body: string): Promise<ChatThread> =>
    mapThread(
      await fetchApi(`/conversations/${conversationId}/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify(body ? { body } : { recall: true }),
      }),
    ),
  /** Toggle my one emoji reaction on a message. */
  react: async (conversationId: string, messageId: string, emoji: string): Promise<ChatThread> =>
    mapThread(
      await fetchApi(`/conversations/${conversationId}/messages/${messageId}/reactions`, {
        method: "POST",
        body: JSON.stringify({ emoji }),
      }),
    ),
  /** Heartbeat: this desk is here (and optionally typing into a thread). */
  presence: (conversationId?: string) =>
    fetchApi(`/chat/${conversationId ? "typing" : "presence"}`, {
      method: "POST",
      softAuth: true,
      body: JSON.stringify(conversationId ? { conversationId } : {}),
    }).catch(() => null),
  /** The people in a DM/group thread (with live online state). */
  members: async (conversationId: string): Promise<ChatDirectoryEntry[]> =>
    asList(await fetchApi(`/conversations/${conversationId}/members`)) as ChatDirectoryEntry[],
  /** Add colleagues to a group thread. */
  addMembers: async (conversationId: string, memberIds: string[]): Promise<ChatThread> =>
    mapThread(
      await fetchApi(`/conversations/${conversationId}/members`, {
        method: "POST",
        body: JSON.stringify({ memberIds }),
      }),
    ),
  /** Remove a member from a group thread (history stays, they stop receiving). */
  removeMember: async (conversationId: string, memberId: string): Promise<ChatThread> =>
    mapThread(
      await fetchApi(`/conversations/${conversationId}/members/${memberId}`, {
        method: "DELETE",
      }),
    ),
  /** Who has read through which point of this thread (seen-by). */
  receipts: async (conversationId: string): Promise<{ userId: string; name: string; lastReadAt: string | null }[]> =>
    asList(await fetchApi(`/conversations/${conversationId}/receipts`)).map((r) => ({
      userId: String(r.userId ?? ""),
      name: String(r.name ?? "Member"),
      lastReadAt: r.lastReadAt ? String(r.lastReadAt) : null,
    })),
};

/** Join threads to the trips we already loaded, so the panel can show context. */
export function attachTrips(threads: ChatThread[], trips: Trip[]): ChatThread[] {
  const byId = new Map(trips.map((t) => [t.id, t]));
  return threads.map((thread) => ({
    ...thread,
    trip: thread.tripId ? (byId.get(thread.tripId) ?? null) : null,
  }));
}

// ---------------------------------------------------------------- time labels

const pad = (n: number) => String(n).padStart(2, "0");

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** `09:12` for today, `Yesterday 09:12`, else `14 Sept 09:12`. */
export function chatTimeLabel(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.trim();
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return hhmm;
  if (days === 1) return `Yesterday ${hhmm}`;
  return `${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })} ${hhmm}`;
}

/** Day divider inside a thread: Today / Yesterday / 14 Sept 2026. */
export function chatDayLabel(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return formatTableDate(value);
}

/** The stamp printed UNDER each message — full evidence, never just "now". */
export function chatStampLabel(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.trim();
  return formatMovementStamp(value);
}

// ------------------------------------------------------------------ headings

/** `DIS-5803D Operations Thread` — the spec's trip-context heading. */
export function threadHeading(thread: ChatThread): string {
  const id = thread.trip?.id || thread.tripId;
  if (id) return `${displayDispatchId(id)} Operations Thread`;
  return thread.name || "Operations Thread";
}

/** Who the thread is about: the PARTNER company, then the consignee. */
export function threadPartner(thread: ChatThread): string {
  if (thread.trip) return partnerOf(thread.trip) || thread.name;
  return thread.name;
}

/** One line of what is happening on the dispatch, for the list and the header. */
export function threadSubtitle(thread: ChatThread): string {
  const trip = thread.trip;
  if (!trip) return thread.subtitle;
  const parts = [trip.cargo, trip.dropoff].map((p) => (p || "").trim()).filter(Boolean);
  return parts.join(" → ");
}

export type ChatContextRow = { label: string; value: string; mono?: boolean };

/**
 * The RIGHT-hand context panel: what the conversation is about. Trip, truck,
 * driver, status and route — everything a participant needs without leaving the
 * chat to go and find the dispatch.
 */
export function chatContextRows(thread: ChatThread, drivers: Driver[] = []): ChatContextRow[] {
  const trip = thread.trip;
  if (!trip) {
    return [{ label: "Trip", value: "Not linked to a dispatch", mono: true }];
  }
  const byId = new Map(drivers.map((d) => [d.id, d]));
  const byName = new Map(drivers.map((d) => [d.name.trim().toLowerCase(), d]));
  const driver = trip.driverId
    ? byId.get(trip.driverId)
    : byName.get((trip.driverName || "").trim().toLowerCase());
  const sites = tripLoadingSites(trip);
  const rows: ChatContextRow[] = [
    { label: "Trip", value: displayRequestId(trip), mono: true },
    { label: "Dispatch", value: displayDispatchId(trip), mono: true },
    { label: "Partner", value: partnerOf(trip) || "—" },
    { label: "Customer", value: trip.customerConsignee || "—" },
    { label: "Product", value: trip.cargo || "—" },
  ];
  const truck = displayTruckAssigned(trip);
  rows.push({
    label: "Truck",
    value: truck || "Not assigned yet",
    mono: Boolean(truck),
  });
  rows.push({
    label: "Body",
    value: trip.tailType?.trim() || "—",
  });
  rows.push({
    label: "Driver",
    value:
      [trip.driverName?.trim(), driver ? displayDriverSalary(driver) : ""]
        .filter(Boolean)
        .join(" · ") || "Not assigned yet",
  });
  rows.push({ label: "Driver phone", value: driver?.phone?.trim() || "—", mono: true });
  rows.push({ label: "Status", value: trip.status || "—" });
  rows.push({
    label: "Route",
    value: sites.length
      ? `${sites.join(" · ")} → ${trip.dropoff || "—"}`
      : `— → ${trip.dropoff || "—"}`,
  });
  rows.push({
    label: "Dispatched",
    value: trip.dispatchedAt ? formatMovementStamp(trip.dispatchedAt) : "—",
  });
  return rows;
}

/** Cap · plate for the list row, so two threads on the same partner never look alike. */
export function threadTruckLabel(thread: ChatThread): string {
  const trip = thread.trip;
  if (!trip) return "";
  const cap = displayCapFromTrip(trip);
  const plate = displayPlateFromTrip(trip);
  if (cap && plate) return `${cap} (${plate})`;
  return cap || plate || "";
}

export { displayDispatchId, displayRequestId, formatMovementStamp };
