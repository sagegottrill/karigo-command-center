import { isCustomerRequest } from "./daily-stats";
import { tripBucket } from "./status-buckets";
import type { Trip } from "./types";

/**
 * The window the Central Dashboard reports on.
 *
 * The board is a DAILY board: it opens on today, and every activity number on it
 * — requests raised, approvals, dispatches, declines, and the money committed on
 * the loads that window produced — belongs to the selected window and rolls over
 * by itself at midnight. Month and Custom exist for the times an operator needs a
 * longer read; nothing on this board is an all-time figure dressed up as today's.
 *
 * Stock figures (fleet units, drivers, trucks on the road right now) have no
 * window to belong to — a truck is available or it is not. Those stay live
 * snapshots and are labelled as such on the board; they never come through here.
 */
export type PeriodKind = "day" | "month" | "custom";

export type PeriodRange = {
  kind: PeriodKind;
  /** Inclusive local start of the first day in the window. */
  from: Date;
  /** Inclusive local end of the last day in the window. */
  to: Date;
  /** The picker's own words: "Today" / "September 2026" / "1 – 15 Sept 2026". */
  label: string;
  /** Band chip prefix — "Today" / "This month" / "1–15 Sept". */
  prefix: string;
  /** What pool a tile counts, e.g. "Raised today" — printed under the figure. */
  hint: string;
  /** Section note, e.g. "Showing today · Mon 21 Sept 2026". */
  note: string;
  /** Exactly one local calendar day — the daily capture reads like a sentence. */
  singleDay: boolean;
};

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

/**
 * `2026-09-15` (a date input's value) → local midnight.
 *
 * Never `new Date("2026-09-15")`: a bare date string parses as UTC, which in
 * Lagos (UTC+1) drags local midnight back to the previous evening and quietly
 * drops the first hour of every custom range.
 */
export function parseDateInput(value?: string | null): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

const monthName = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const shortDay = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** The day the dashboard reports on, in the operator's own calendar. */
const dayLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

/**
 * Resolve the picker into a concrete window.
 *
 * A custom range with a missing or unreadable end falls back to the day view
 * rather than silently reporting on nothing, and an inverted range (To before
 * From) is swapped instead of returning zero rows.
 */
export function periodRange(
  kind: PeriodKind,
  now: Date,
  customFrom?: string | null,
  customTo?: string | null,
): PeriodRange {
  if (kind === "month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return {
      kind,
      from,
      to,
      label: monthName(from),
      prefix: "This month",
      hint: "Raised this month",
      note: `Showing ${monthName(from)}`,
      singleDay: false,
    };
  }

  if (kind === "custom") {
    const a = parseDateInput(customFrom);
    const b = parseDateInput(customTo) ?? a;
    if (a && b) {
      const [first, last] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
      const from = startOfDay(first);
      const to = endOfDay(last);
      const single = from.getTime() === startOfDay(to).getTime();
      const label = single
        ? dayLabel(from)
        : `${shortDay(from)} – ${shortDay(to)} ${to.getFullYear()}`;
      return {
        kind,
        from,
        to,
        label,
        prefix: single ? shortDay(from) : `${shortDay(from)}–${shortDay(to)}`,
        hint: single ? "Raised that day" : "Raised in range",
        note: `Showing ${label}`,
        singleDay: single,
      };
    }
  }

  const from = startOfDay(now);
  const to = endOfDay(now);
  return {
    kind: "day",
    from,
    to,
    label: dayLabel(from),
    prefix: "Today",
    hint: "Raised today",
    note: `Showing today · ${dayLabel(from)}`,
    singleDay: true,
  };
}

/** Is this stamp inside the window? Unreadable or absent stamps are never "in". */
export function inPeriod(value: string | Date | null | undefined, range: PeriodRange): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const t = date.getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
}

export type PeriodActivity = {
  /** Requests raised inside the window. */
  requests: number;
  /** TM approvals stamped inside the window. */
  approved: number;
  /** Trucks dispatched inside the window. */
  dispatched: number;
  /** Requests closed as Declined inside the window. */
  declined: number;
  /** Dispatches finished inside the window. */
  completed: number;
};

/**
 * The window's activity, counted from the trip stamps themselves.
 *
 * `approvedAt` / `dispatchedAt` are the real decision stamps. A decline and a
 * completion are only knowable through `updatedAt` (the backend keeps no
 * `declinedAt`/`completedAt`), and for those two states `updatedAt` IS the
 * closing moment — no later write reaches a closed request except the TM's own
 * return-to-customer, which reopens it.
 */
export function periodActivity(trips: Trip[], range: PeriodRange): PeriodActivity {
  return {
    requests: trips.filter((t) => isCustomerRequest(t) && inPeriod(t.createdAt, range)).length,
    approved: trips.filter((t) => inPeriod(t.approvedAt, range)).length,
    dispatched: trips.filter((t) => inPeriod(t.dispatchedAt, range)).length,
    declined: trips.filter((t) => tripBucket(t) === "declined" && inPeriod(t.updatedAt, range)).length,
    completed: trips.filter((t) => tripBucket(t) === "completed" && inPeriod(t.updatedAt, range)).length,
  };
}

/** The three choices the picker offers, in the order the design shows them. */
export const PERIOD_TABS: { id: PeriodKind; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "month", label: "Month" },
  { id: "custom", label: "Custom" },
];
