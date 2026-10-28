import { displayCapFromTrip } from "./display-ids";
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

/** Whole words of a name: "Ganiyu Semiu" -> ["GANIYU", "SEMIU"]. */
function nameTokens(value: unknown): string[] {
  return normPersonName(value).split(" ").filter(Boolean);
}

/**
 * Do the two spellings plausibly belong to the same man? True when every word of
 * the shorter name appears in the longer one — "SEMIU" fits "Ganiyu Semiu", and
 * "MUSA ADAMU" does NOT fit "Musa Garuba".
 *
 * This is what keeps a lookup from swapping in a stranger: the dispatcher types
 * a first name or a surname, and only a name that already contains what he typed
 * is allowed to answer for it.
 */
function nameFits(stored: string, rosterName: unknown): boolean {
  const typed = stored.split(" ").filter(Boolean);
  const roster = nameTokens(rosterName);
  if (!typed.length || !roster.length) return false;
  const [short, long] = typed.length <= roster.length ? [typed, roster] : [roster, typed];
  return short.every((word) => long.includes(word));
}

/** The cap code (P064) inside whatever shape a row stores it in: "P064 - GGE105YK". */
function capCode(value: unknown): string {
  const hit = /\bP\s?\d{1,4}\b/i.exec(String(value ?? ""));
  return hit ? hit[0].replace(/\s+/g, "").toUpperCase() : "";
}

/**
 * How a dispatch's driver was resolved back to the roster. `id` and `name` are
 * facts the dispatch itself carries; `token` and `truck` are the roster being
 * read for a hand-typed name, and the screens that print details resolved that
 * way say so rather than presenting a guess as a record.
 */
export type TripDriverMatchVia = "id" | "name" | "token" | "truck";

export type TripDriverMatch = { driver: Driver; via: TripDriverMatchVia };

/**
 * The roster row behind a dispatch — the whole reason this exists is that the
 * live Trip row carries NO driverId and stores the driver's name as somebody
 * typed it ("saleh", "ali", "MUSA", and the literal "Unassigned").
 *
 * Reading the name alone left Fleet Ops with a name and an empty staff number
 * and phone on most of the register, so the rules go in order of how much the
 * dispatch itself actually said:
 *
 *   1. the driverId, when a row still has one;
 *   2. exactly one roster row with that name;
 *   3. exactly one roster row whose name contains what was typed (SEMIU);
 *   4. among several such rows, the one the roster pairs with the truck this
 *      dispatch is on — the plate on the dispatch resolves to a cab cap, and HR
 *      files each driver against that cap.
 *
 * Anything ambiguous returns nothing. A wrong staff number and phone on a
 * dispatch is worse than a blank one, so the lookup never picks between men.
 */
/** The only row in a set — nothing when the set is empty or several rows wide. */
function soleRow(rows: Driver[]): Driver | undefined {
  return rows.length === 1 ? rows[0] : undefined;
}

export function driverForTrip(trip: Trip, drivers: Driver[]): TripDriverMatch | undefined {
  const id = String(trip.driverId ?? "");
  if (id) {
    const byId = drivers.find((d) => String(d.id) === id);
    if (byId) return { driver: byId, via: "id" };
  }

  const stored = normPersonName(trip.driverName);
  if (!stored || !isNamedDriver(trip.driverName)) return undefined;

  const exactRows = drivers.filter((d) => normPersonName(d.name) === stored);
  const exact = soleRow(exactRows);
  // One exact match settles it.
  if (exact) return { driver: exact, via: "name" };

  // The name alone is ambiguous. The TRUCK the dispatch is on can still pick
  // the man out: the roster files a driver against his truck as cap codes
  // ("P041") in the HR pairing columns (assignedTruck/assignedTail). Exactly
  // one candidate paired with this dispatch's truck is the driver; anything
  // else stays blank, because a wrong staff number is worse than none.
  const cap = capCode(displayCapFromTrip(trip));
  const onTruck = (rows: Driver[]) => {
    if (!cap) return undefined;
    return soleRow(
      rows.filter((d) => [d.assignedTruck, d.assignedTail].some((v) => capCode(v) === cap)),
    );
  };

  // Ambiguous exact-name rows first (two "Abdullahi Adamu"s — the truck says which).
  if (exactRows.length > 1) {
    const onTruckExact = onTruck(exactRows);
    if (onTruckExact) return { driver: onTruckExact, via: "truck" };
  }

  // Then widen: a hand-typed partial name ("rabiu", "SEMIU") that fits
  // exactly one roster row.
  const candidates = drivers.filter((d) => nameFits(stored, d.name));
  const only = soleRow(candidates);
  if (only) return { driver: only, via: "token" };
  if (candidates.length > 1) {
    const onTruckWide = onTruck(candidates);
    if (onTruckWide) return { driver: onTruckWide, via: "truck" };
  }
  return undefined;
}

/**
 * Every dispatch that still names this driver — the ones holding him.
 *
 * Freeing a driver on the roster is only honest if these are dealt with, so the
 * surfaces that offer the release name them before the decision is taken. One
 * implementation, so the roster, the staff record and the fleet desk cannot
 * disagree about which dispatches a man is on.
 *
 * SHARED-NAMES BOUNDARY (Fortune/Adyems, 28 Oct 2026): with the roster in hand
 * (`roster`), a name shared by MORE THAN ONE row can no longer bind a
 * dispatch to every man answering it. The open KNT785XP run was typed
 * "MOHAMMED" — and three men are filed under exactly that word (P0293,
 * P0901, P0932), so the man sitting back at the yard read "On Trip" on the
 * register and the fleet desk refused to offer him, all because of the
 * other's trip. When the name is shared, a dispatch binds a driver only on
 * EVIDENCE that names HIM: his own record claims the road (stored "On
 * Trip"), or the dispatch's truck matches the truck HR paired with him.
 * Without the roster nothing changes — unambiguous names bind as they always
 * did. This mirrors the rule driverForTrip already follows on the way back:
 * a wrong linkage is worse than none.
 */
export function liveTripsFor(
  driver: Driver,
  trips: Trip[],
  excludeTripId?: string,
  roster?: Driver[],
): Trip[] {
  const id = String(driver.id ?? "");
  const name = normPersonName(driver.name);
  const nameShared =
    Boolean(name) &&
    !!roster?.some(
      (other) => String(other.id ?? "") !== id && normPersonName(other.name) === name,
    );
  return trips.filter((trip) => {
    if (!isLiveTrip(trip)) return false;
    if (excludeTripId && String(trip.id) === String(excludeTripId)) return false;
    const tripDriverId = String((trip as { driverId?: unknown }).driverId ?? "");
    if (id && tripDriverId && tripDriverId === id) return true;
    if (
      !name ||
      !isNamedDriver(trip.driverName) ||
      normPersonName(trip.driverName) !== name
    ) {
      return false;
    }
    return !nameShared || bindingEvidenceFor(driver, trip);
  });
}

/**
 * The proof that a SHARED-name dispatch belongs to THIS man (not to one of the
 * others filed under the same word) — the stored duty word that claims the
 * road, or the truck HR says is his.
 */
function bindingEvidenceFor(driver: Driver, trip: Trip): boolean {
  if (String(driver.status) === "On Trip") return true;
  const cap = capCode(displayCapFromTrip(trip));
  if (!cap) return false;
  return [driver.assignedTruck, driver.assignedTail].some(
    (pairing) => capCode(pairing) === cap,
  );
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
  roster?: Driver[],
): Trip | undefined {
  return liveTripsFor(driver, trips, excludeTripId, roster)[0];
}

/** Is this driver genuinely out on a live dispatch? */
export function driverIsOnLiveTrip(
  driver: Driver,
  trips: Trip[],
  roster?: Driver[],
): boolean {
  return liveTripFor(driver, trips, undefined, roster) !== undefined;
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
export function driverOpenDispatchCount(
  driver: Driver,
  trips: Trip[],
  roster?: Driver[],
): number {
  const fromServer = Number((driver as { openDispatches?: unknown }).openDispatches);
  const server = Number.isFinite(fromServer) && fromServer > 0 ? fromServer : 0;
  return Math.max(server, liveTripsFor(driver, trips, undefined, roster).length);
}

/** Is this driver still committed to a dispatch the platform has not closed? */
export function driverHasOpenDispatches(
  driver: Driver,
  trips: Trip[],
  roster?: Driver[],
): boolean {
  return driverOpenDispatchCount(driver, trips, roster) > 0;
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
 * The ONE word every board prints for a driver, decided from ONE source of
 * truth: the live dispatch list.
 *
 *   a live dispatch names him  -> "On Trip"   (the dispatch is the fact)
 *   HR filed Off Duty          -> "On Leave"  (HR's own decision, respected)
 *   HR filed Suspended         -> "Suspended"
 *   anything else              -> "Active"    (the register's ready-to-work word)
 *
 * This is the register's answer to "if they are on a trip, what will it be?":
 * the staff directory no longer prints the stored column (which only ever says
 * Active) — it reads the same dispatches the fleet, tracking and gate boards
 * read, so every surface answers with the same word.
 */
export type DriverStatusWord = "On Trip" | "On Leave" | "Suspended" | "Active";

export function driverStatusWord(
  driver: Driver,
  trips: Trip[],
  roster?: Driver[],
): DriverStatusWord {
  if (driverHasOpenDispatches(driver, trips, roster)) return "On Trip";
  if (driver.status === "Off Duty") return "On Leave";
  if (driver.status === "Suspended") return "Suspended";
  return "Active";
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
export function displayDutyStatus(
  driver: Driver,
  trips: Trip[],
  roster?: Driver[],
): DutyWord {
  if (driverHasOpenDispatches(driver, trips, roster)) return "In Transit";
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
    if (driverHasOpenDispatches(driver, trips, drivers)) {
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
export function driverIsAssignable(
  driver: Driver,
  trips: Trip[],
  excludeTripId?: string,
  roster?: Driver[],
): boolean {
  if (driver.status === "Suspended" || driver.status === "Off Duty") return false;
  if (liveTripFor(driver, trips, excludeTripId, roster) !== undefined) return false;
  // With no dispatch in hand to exclude, the server's count is the truth: a man
  // the platform still has on the road is never offered a second truck, even if
  // this browser never managed to load the trip list.
  if (!excludeTripId && Number((driver as { openDispatches?: unknown }).openDispatches) > 0) {
    return false;
  }
  return true;
}

/** The assignable roster, in the order it arrived (the roster's own ranking). */
export function assignableDrivers(
  drivers: Driver[],
  trips: Trip[],
  excludeTripId?: string,
): Driver[] {
  // The roster itself rides along: shared names cannot borrow the other man's
  // dispatch, so one Mohammed back at the yard stays offered while the other is
  // out on his run.
  return drivers.filter((d) => driverIsAssignable(d, trips, excludeTripId, drivers));
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
  roster?: Driver[],
): "should-be-free" | "should-be-on-trip" | null {
  const onTrip = driverIsOnLiveTrip(driver, trips, roster);
  if (driver.status === "On Trip" && !onTrip) return "should-be-free";
  if (onTrip && driver.status !== "On Trip") return "should-be-on-trip";
  return null;
}
