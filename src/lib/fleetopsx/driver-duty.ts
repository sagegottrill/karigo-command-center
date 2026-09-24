import type { Driver, DriverStatus, Trip } from "./types";

/**
 * Who may be put on a dispatch, decided by the LIVE DISPATCH and not by the
 * duty word stored on the driver record.
 *
 * The duty status column is a person's bookkeeping and it drifts: on the live
 * roster 40 drivers read "On Trip" while 2 of them hold no dispatch at all, and
 * 10 drivers read Available while they are out on one. Every assignment surface
 * used to trust that word, so a free driver was invisible in the driver list
 * ("it says he is on a trip, but he is available") and a driver who was actually
 * on the road could be handed a second truck.
 *
 * The dispatch is the fact — a driver is busy when a live dispatch carries his
 * name, whatever the record says — so availability is derived from it here and
 * read by every surface that offers or frees a driver.
 *
 * Matching is by driver id first, then by NAME, because the live Trip row has no
 * driverId column: for the dispatches already on record the name is the only
 * link that exists.
 */

/** Dispatch states that mean the truck and its driver are committed. */
export const LIVE_TRIP_STATUSES = [
  "Scheduled",
  "En Route",
  "Loaded",
  "Offloading",
  "Returning",
  "Delayed",
] as const;

/** Names that mean "nobody", never a driver to match on. */
const NOBODY = /^(unassigned|none|n\/?a|tbd|—|-|0)$/i;

/** One spelling for a name or plate: trimmed, single-spaced, upper-cased. */
export function normPersonName(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function isLiveTrip(trip: Trip): boolean {
  return (LIVE_TRIP_STATUSES as readonly string[]).includes(String(trip.status));
}

export function isNamedDriver(value: unknown): boolean {
  const name = normPersonName(value);
  return Boolean(name) && !NOBODY.test(name);
}

/**
 * Every dispatch that still names this driver — the ones holding him.
 *
 * Freeing a driver on the roster is only honest if these are dealt with, so the
 * surfaces that offer the release name them before the decision is taken. One
 * implementation, so the roster, the staff record and the fleet desk cannot
 * disagree about which dispatches a man is on.
 */
export function liveTripsFor(driver: Driver, trips: Trip[], excludeTripId?: string): Trip[] {
  const id = String(driver.id ?? "");
  const name = normPersonName(driver.name);
  return trips.filter((trip) => {
    if (!isLiveTrip(trip)) return false;
    if (excludeTripId && String(trip.id) === String(excludeTripId)) return false;
    const tripDriverId = String((trip as { driverId?: unknown }).driverId ?? "");
    if (id && tripDriverId && tripDriverId === id) return true;
    return (
      Boolean(name) && isNamedDriver(trip.driverName) && normPersonName(trip.driverName) === name
    );
  });
}

/**
 * The dispatch a driver is committed to right now, or undefined when he is free.
 * `excludeTripId` lets a re-assignment ignore the very dispatch being edited — a
 * driver keeping his own job is not "busy" with it.
 */
export function liveTripFor(
  driver: Driver,
  trips: Trip[],
  excludeTripId?: string,
): Trip | undefined {
  return liveTripsFor(driver, trips, excludeTripId)[0];
}

/** Is this driver genuinely out on a live dispatch? */
export function driverIsOnLiveTrip(driver: Driver, trips: Trip[]): boolean {
  return liveTripFor(driver, trips) !== undefined;
}

/**
 * The duty word a roster, a staff record or a headcount should carry: the four
 * HR words, plus IN TRANSIT for a man the dispatch list says is on the road.
 */
export type DutyWord = DriverStatus | "In Transit";

/**
 * What a screen must PRINT for this driver.
 *
 * "Available" has to mean one thing only — the man is on the ground and can be
 * handed a truck — and it used to be printed beside the line "On a live
 * dispatch", a contradiction the yard cannot act on. So the dispatch list
 * decides the word: a driver it names reads IN TRANSIT, and only a driver it
 * does not name can read Available. The stored duty word is still what HR set;
 * this is what the record ACTUALLY is right now.
 */
export function displayDutyStatus(driver: Driver, trips: Trip[]): DutyWord {
  return driverIsOnLiveTrip(driver, trips) ? "In Transit" : driver.status;
}

/**
 * The headcount, split the way the boards print it: who is on the road, who is
 * on the ground, and HR's two own decisions. Counted from the dispatches rather
 * than the stored words, so the summary cannot contradict the pills beneath it.
 */
export function dutyTally(
  drivers: Driver[],
  trips: Trip[],
): {
  total: number;
  available: number;
  inTransit: number;
  offDuty: number;
  suspended: number;
} {
  let available = 0;
  let inTransit = 0;
  let offDuty = 0;
  let suspended = 0;
  for (const driver of drivers) {
    if (driverIsOnLiveTrip(driver, trips)) {
      inTransit += 1;
    } else if (driver.status === "Suspended") {
      suspended += 1;
    } else if (driver.status === "Off Duty") {
      offDuty += 1;
    } else {
      available += 1;
    }
  }
  return { total: drivers.length, available, inTransit, offDuty, suspended };
}

/**
 * Who the dispatcher may choose.
 *
 * Suspended and Off Duty are HR's own decisions and are respected; "On Trip" is
 * only respected when a live dispatch backs it up. A driver already out on a
 * job is never offered, so one man cannot be handed two trucks.
 */
export function driverIsAssignable(driver: Driver, trips: Trip[], excludeTripId?: string): boolean {
  if (driver.status === "Suspended" || driver.status === "Off Duty") return false;
  return liveTripFor(driver, trips, excludeTripId) === undefined;
}

/** The assignable roster, in the order it arrived (the roster's own ranking). */
export function assignableDrivers(drivers: Driver[], trips: Trip[], excludeTripId?: string): Driver[] {
  return drivers.filter((d) => driverIsAssignable(d, trips, excludeTripId));
}

/**
 * The duty word the record *should* carry, given the dispatch list: `null` when
 * the stored status already agrees and the row needs no attention.
 *
 * Used to flag — never to silently rewrite — a stale record: HR owns the duty
 * status, and a driver parked "On Trip" with no job is theirs to release.
 */
export function staleDutyStatus(
  driver: Driver,
  trips: Trip[],
): "should-be-free" | "should-be-on-trip" | null {
  const onTrip = driverIsOnLiveTrip(driver, trips);
  if (driver.status === "On Trip" && !onTrip) return "should-be-free";
  if (onTrip && driver.status !== "On Trip") return "should-be-on-trip";
  return null;
}
