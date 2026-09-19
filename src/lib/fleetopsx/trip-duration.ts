import type { Trip } from "./types";
import type { TrackingDelayStatus } from "./tracking-ops";

/**
 * Trip duration → delay status. THE single source of truth.
 *
 * Fortune's rule (17 Sept): the Transport Manager, on his FINAL approval, says
 * how long the vehicle is expected to spend on the road — "it is going to take
 * 4 days". Everything downstream is measured against that promise:
 *
 *   partner request → TM approval → Fleet Ops assigns truck → back to the TM,
 *   who sets the duration → the customer receives the expected return.
 *
 * A 4-day trip that is still running on day 5 is in delay; the further past the
 * promised return it goes, the louder the status gets.
 */

/**
 * The delay bands. Fortune is sending the exact numbers he wants; when they
 * arrive, change them HERE and nowhere else — every board, detail page and
 * partner ticket reads this object.
 */
export const DELAY_BANDS = {
  /** Over the promised return by up to this many days → "Slight delay". */
  slightMaxDaysOver: 1,
  /** Over the promised return by this many days or more → "Significant Delay". */
  significantFromDaysOver: 2,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight local time — the unit the duration and the delay are counted in. */
function startOfDay(value: Date): Date {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * When the trip actually got on the road: Security's gate stamp first (that is
 * the physical truth), then the TM's approval moment, then his planned date.
 * A request nobody has approved yet has no departure at all.
 */
export function tripDepartureAt(trip: Trip): Date | null {
  const candidates = [trip.startTime, trip.dispatchedAt, trip.estimatedDate];
  for (const raw of candidates) {
    if (!raw) continue;
    const value = String(raw).trim();
    if (!value) continue;
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/**
 * The date the partner is promised the cargo back: departure + the TM's days.
 * Null when either half is missing — never guess a promise.
 */
export function expectedReturnAt(trip: Trip): Date | null {
  const days = Number(trip.estimatedDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  const departure = tripDepartureAt(trip);
  if (!departure) return null;
  return new Date(departure.getTime() + days * DAY_MS);
}

export type TripDelay = {
  status: TrackingDelayStatus;
  /** Whole days the trip has been running (day 1 = departure day). */
  daysOnRoad: number;
  /** Days past the promised return; 0 while still inside the window. */
  daysOver: number;
  /** "Day 3 of 4" — the plain-English progress of the promise. */
  progressLabel: string;
  expectedReturnAt: Date;
};

/**
 * Compare the promise with the clock. Returns null when the TM has not set a
 * duration (nothing to measure) — callers then fall back to whatever status a
 * human last set, rather than inventing a delay.
 *
 * A COMPLETED trip is never delayed: the cargo arrived, whatever the calendar
 * says about the days it took.
 */
export function tripDelay(trip: Trip, now: Date = new Date()): TripDelay | null {
  const days = Number(trip.estimatedDays);
  if (!Number.isFinite(days) || days <= 0) return null;
  const departure = tripDepartureAt(trip);
  if (!departure) return null;
  const due = expectedReturnAt(trip);
  if (!due) return null;

  // Counted in CALENDAR DAYS, not hours: a 4-day trip due back on the 19th is
  // still "on schedule" all through the 19th and only reads late from the 20th.
  // Firing a delay three hours past the due minute would have every long-haul
  // dispatch wearing a warning it does not deserve yet.
  const calendarDays = (from: Date, to: Date) =>
    Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
  const daysOnRoad = Math.max(1, calendarDays(departure, now) + 1);
  const daysOver = Math.max(0, calendarDays(due, now));

  let status: TrackingDelayStatus = "On Schedule";
  if (daysOver > 0) {
    status =
      daysOver >= DELAY_BANDS.significantFromDaysOver ? "Significant Delay" : "Slight delay";
  }
  if (trip.status === "Completed") status = "On Schedule";

  return {
    status,
    daysOnRoad,
    daysOver,
    progressLabel: `Day ${Math.min(daysOnRoad, days)} of ${days}`,
    expectedReturnAt: due,
  };
}

/** "4 days" — how the TM's duration is written everywhere. */
export function formatTripDuration(days: number | null | undefined): string {
  const value = Number(days);
  if (!Number.isFinite(value) || value <= 0) return "";
  return value === 1 ? "1 day" : `${value} days`;
}
