import { tripBucket } from "./status-buckets";
import type { Trip } from "./types";

/**
 * Daily capture for the Central Dashboard.
 *
 * The dashboard is a DAILY board: every activity number it shows belongs to the
 * current local day and rolls over by itself at midnight, while the "live now"
 * numbers (fleet, staff, trucks on the road) are re-polled every 10s. Nothing on
 * it is an all-time figure dressed up as today's.
 *
 * The API stores ISO UTC stamps, but the operator's "today" is their own local
 * day (UTC+1 in Lagos). So the day boundary comes from the browser calendar
 * (`getFullYear/getMonth/getDate`) — never from slicing the UTC string, which
 * would push a 00:30 Lagos request into yesterday.
 */

/** Local calendar day of a stamp, as `YYYY-MM-DD`. Empty when unparseable. */
export function localDayKey(value?: string | Date | null): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function isLocalDay(value: string | Date | null | undefined, ref: Date): boolean {
  const key = localDayKey(value);
  return Boolean(key) && key === localDayKey(ref);
}

/** A request raised by a partner/customer — the pool the Customer Requests cards count. */
export function isCustomerRequest(trip: Trip): boolean {
  return (
    Boolean(trip.customer?.trim()) ||
    Boolean(trip.customerConsignee?.trim()) ||
    trip.status === "Requested" ||
    trip.status === "Draft"
  );
}

export type DailyActivity = {
  /** Local day these numbers belong to (YYYY-MM-DD). */
  day: string;
  /** Requests raised today. */
  requests: number;
  /** TM approvals stamped today. */
  approved: number;
  /** Trucks scheduled/on the road from today's approvals. */
  dispatched: number;
  /** Requests closed as Declined today. */
  declined: number;
  /** Dispatches finished today. */
  completed: number;
};

/**
 * Today's activity, derived from the trip stamps themselves.
 *
 * `approvedAt` / `dispatchedAt` are the real decision stamps. A decline and a
 * completion are only knowable through `updatedAt` (the backend keeps no
 * `declinedAt`/`completedAt`), and for those two states `updatedAt` IS the
 * closing moment — no later write reaches a closed request except the TM's own
 * return-to-customer, which reopens it.
 */
export function dailyActivity(trips: Trip[], now: Date): DailyActivity {
  return {
    day: localDayKey(now),
    requests: trips.filter((t) => isCustomerRequest(t) && isLocalDay(t.createdAt, now)).length,
    approved: trips.filter((t) => isLocalDay(t.approvedAt, now)).length,
    dispatched: trips.filter((t) => isLocalDay(t.dispatchedAt, now)).length,
    declined: trips.filter((t) => tripBucket(t) === "declined" && isLocalDay(t.updatedAt, now)).length,
    completed: trips.filter((t) => tripBucket(t) === "completed" && isLocalDay(t.updatedAt, now)).length,
  };
}

/** e.g. "Friday, 19 Sept 2026" — the day the dashboard is captured for. */
export function formatDayLabel(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** e.g. "19 Sept 2026" — compact form for card hints. */
export function formatShortDay(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** e.g. "08:45" — the last-poll clock (24h). */
export function formatClockTime(date: Date): string {
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
}
