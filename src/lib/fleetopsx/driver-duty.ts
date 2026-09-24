import { displayDispatchId } from "./request-id";
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
 * How many dispatches still name this driver, counted from the SERVER's own
 * figure when the row carries one (`openDispatches` on GET /api/drivers) and
 * from the trip list as a floor.
 *
 * This exists because the release used to be decided from the browser's copy of
 * the dispatch list. When that fetch failed or lagged, the screen concluded
 * "nothing to close", saved the man Available and left his dispatch running —
 * so the fleet desk still refused him and HR had to go Off Duty and back to get
 * anything to happen. The server's count cannot be missing.
 */
export function driverOpenDispatchCount(driver: Driver, trips: Trip[]): number {
  const fromServer = Number((driver as { openDispatches?: unknown }).openDispatches);
  const server = Number.isFinite(fromServer) && fromServer > 0 ? fromServer : 0;
  return Math.max(server, liveTripsFor(driver, trips).length);
}

/** Is this driver still committed to a dispatch the platform has not closed? */
export function driverHasOpenDispatches(driver: Driver, trips: Trip[]): boolean {
  return driverOpenDispatchCount(driver, trips) > 0;
}

/**
 * The sentence a release confirmation shows: who he is, what is still open and
 * what agreeing will do. Names the dispatches when this screen has them; when
 * the trip list never loaded it still reports the count, because the release
 * must not be blocked by a fetch that failed.
 */
export function releaseConfirmBody(driver: Driver, trips: Trip[], targetWord: string): string {
  const open = liveTripsFor(driver, trips);
  const count = driverOpenDispatchCount(driver, trips);
  const plural = count === 1 ? "dispatch" : "dispatches";
  const named = open
    .slice(0, 3)
    .map((t) => `${displayDispatchId(t)} (${t.status})`)
    .join(", ");
  const tail = open.length > 3 ? ` and ${open.length - 3} more` : "";
  const list = named ? `: ${named}${tail}` : "";
  return (
    `${driver.name} is still named on ${count} open ${plural}${list}.\n\n` +
    `Saving him as ${targetWord} will close ${count === 1 ? "that dispatch" : "those dispatches"} as Completed, so the fleet desk can hand him a truck.`
  );
}

/**
 * The duty word a roster, a staff record or a headcount should carry: the four
 * HR words, plus IN TRANSIT for a man the dispatch list says is on the road.
 */
export type DutyWord = DriverStatus | "In Transit";

/**
 * What a screen must PRINT for this driver — ONE word, and the whole truth.
 *
 * It used to be the stored word with a corrective line underneath ("Available"
 * over "On a live dispatch"), which reads as the platform arguing with itself
 * and leaves the yard to work out which half to believe. There is no caption
 * now: the dispatch list decides the word, and the word is enough.
 *
 *   on a live dispatch          -> IN TRANSIT
 *   HR set Off Duty/Suspended   -> that word (HR's own decision, respected)
 *   anything else               -> AVAILABLE, because a trip word with no
 *                                  dispatch behind it is a stale record and
 *                                  the man is standing in the yard
 */
export function displayDutyStatus(driver: Driver, trips: Trip[]): DutyWord {
  if (driverHasOpenDispatches(driver, trips)) return "In Transit";
  if (driver.status === "Off Duty" || driver.status === "Suspended") return driver.status;
  return "Available";
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
    if (driverHasOpenDispatches(driver, trips)) {
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
  if (liveTripFor(driver, trips, excludeTripId) !== undefined) return false;
  // With no dispatch in hand to exclude, the server's count is the truth: a man
  // the platform still has on the road is never offered a second truck, even if
  // this browser never managed to load the trip list.
  if (!excludeTripId && Number((driver as { openDispatches?: unknown }).openDispatches) > 0) {
    return false;
  }
  return true;
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
