import type { Trip } from "./types";

/**
 * Single source of truth for trip-status semantics.
 *
 * Every dashboard card, queue filter and sidebar badge MUST derive its numbers
 * from these buckets — never hand-roll `trips.filter(t => t.status === …)` with
 * its own status list again. That is how the same fleet ended up showing
 * different numbers on different roles' screens.
 *
 * Live pipeline (backend `Trip.status`):
 *   Requested → Approved → Awaiting Approval → Scheduled
 *     → Loaded / En Route / Offloading / Returning / Delayed → Completed
 *   Stopped = DECLINED. It is the decline state end to end: the backend fires
 *   its notification as "Request Declined", the partner portal renders
 *   "Request Declined", and the TM's Partner Requests action sets it. A truck
 *   that merely halts mid-route is `Delayed` — so a declined request must never
 *   be counted or drawn as a moving vehicle, even if a truck had been assigned
 *   to it before the decline.
 */
export type TripBucket =
  | "pending" // Requested (also legacy Draft) — awaiting TM decision
  | "approved" // Approved — released to Fleet Operations for assignment
  | "awaiting" // Awaiting Approval — FO assigned truck/driver, TM to confirm
  | "scheduled" // Scheduled — on the dispatch board, not yet moving
  | "inTransit" // Loaded / En Route / Offloading / Returning / Delayed
  | "completed" // Completed
  | "declined"; // Stopped — rejected/cancelled request, assigned truck or not

/**
 * A trip counts as "assigned" when ANY assignment signal exists. FO writes
 * truckReg + driverName without headId in live data, so checking headId alone
 * misclassified assigned trips.
 *
 * Placeholders are NOT assignments: `Unassigned` is the request form's default
 * and `TBD` is what gets typed when the asset is not chosen yet — a dispatch
 * carrying either is still an empty slot, and treating it as crewed miscounts
 * the fleet desk's board.
 */
const isPlaceholder = (v: string | null | undefined): boolean =>
  !v || /^(unassigned|tbd)$/i.test(v.trim());

export function hasAssignment(
  t: Pick<Trip, "headId" | "truckReg" | "driverId" | "driverName">,
): boolean {
  return Boolean(
    t.headId ||
    (!isPlaceholder(t.truckReg) && t.truckReg!.trim() !== "") ||
    t.driverId ||
    !isPlaceholder(t.driverName),
  );
}

const BUCKET_BY_STATUS: Record<string, TripBucket> = {
  Requested: "pending",
  Draft: "pending", // legacy backend default — treat as a fresh request
  Approved: "approved",
  "Approved for Dispatch": "approved",
  "Awaiting Approval": "awaiting",
  Scheduled: "scheduled",
  Loaded: "inTransit",
  "En Route": "inTransit",
  Offloading: "inTransit",
  Returning: "inTransit",
  Delayed: "inTransit",
  Completed: "completed",
  // The Transport Manager's field endings (Fortune, 28 Oct): a run closed off
  // the gate is finished for every surface — the partner sees Completed, the
  // tracking boards drop it, the sweeps leave it alone. The WORD the TM chose
  // stays on the record so Fleet Ops can tell a customer return from a truck
  // the yard has physically taken back.
  "Returned to Customer": "completed",
  "Returned to Fleet Ops": "completed",
};

export function tripBucket(
  trip: Pick<Trip, "status" | "headId" | "truckReg" | "driverId" | "driverName">,
): TripBucket {
  const status = String(trip.status ?? "").trim();
  if (status === "Stopped") return "declined";
  return BUCKET_BY_STATUS[status] ?? "pending"; // unknown statuses stay visible as pending
}

export function isInBucket(
  trip: Pick<Trip, "status" | "headId" | "truckReg" | "driverId" | "driverName">,
  buckets: TripBucket[],
): boolean {
  return buckets.includes(tripBucket(trip));
}

/** The statuses that BELONG to a bucket, read off the map above.
 *
 * Derived, never retyped. Screens used to keep their own copies of "the moving
 * statuses" (Fleet Ops' table, the gate house, the TM's Security view). They
 * happened to agree — but a status added to one list and not the others is a
 * truck that moves on one board and not on another, which is exactly the
 * two-answers-for-one-fact problem this module exists to end.
 */
export function statusesInBucket(bucket: TripBucket): string[] {
  return Object.keys(BUCKET_BY_STATUS).filter((status) => BUCKET_BY_STATUS[status] === bucket);
}

/** The moving statuses — one word for all of them on every table. */
export const IN_TRANSIT_STATUSES: string[] = statusesInBucket("inTransit");

/**
 * Gate semantics: a departure has happened once the truck is moving OR home.
 *
 * "Has this truck left the yard?" is asked by the gate house and by the
 * Transport Manager's own Security view, and both must answer identically — so
 * the set is built from the bucket map plus the one status that means "and it
 * came back", not written out a second time.
 */
export const GATE_DEPARTED_STATUSES: string[] = [
  ...IN_TRANSIT_STATUSES,
  ...statusesInBucket("completed"),
];

/** A truck on its way in, or already back. */
export const GATE_RETURNED_STATUSES: string[] = ["Returning", ...statusesInBucket("completed")];

/** Everything currently moving or dispatched (Tracking Operations board). */
export const ACTIVE_DISPATCH_BUCKETS: TripBucket[] = ["scheduled", "inTransit"];

/** Queue Fleet Operations works from — only TM-approved requests. */
export const FO_QUEUE_BUCKETS: TripBucket[] = ["approved"];

/** Queue the Transport Manager works from — brand-new partner requests. */
export const TM_REQUESTS_BUCKETS: TripBucket[] = ["pending"];

/** A trip that is neither finished nor rejected. */
export const OPEN_BUCKETS: TripBucket[] = [
  "pending",
  "approved",
  "awaiting",
  "scheduled",
  "inTransit",
];

export function countBuckets(
  trips: Array<Pick<Trip, "status" | "headId" | "truckReg" | "driverId" | "driverName">>,
): Record<TripBucket, number> {
  const counts = {
    pending: 0,
    approved: 0,
    awaiting: 0,
    scheduled: 0,
    inTransit: 0,
    completed: 0,
    declined: 0,
  } satisfies Record<TripBucket, number>;
  for (const trip of trips) counts[tripBucket(trip)] += 1;
  return counts;
}

/** Sortable timestamp — bad/absent dates sink to the oldest end, never NaN. */
function sortTime(value: string | null | undefined): number {
  const t = value ? new Date(value).getTime() : Number.NaN;
  return Number.isNaN(t) ? 0 : t;
}

type QueueTrip = Pick<
  Trip,
  "status" | "headId" | "truckReg" | "driverId" | "driverName" | "createdAt"
>;

/**
 * Shared "act-on-me first" ordering for every queue table.
 *
 * Two rules, in this order:
 *   1. lower rank rises to the top — whatever is asking for a decision leads the
 *      table instead of being scattered down the page;
 *   2. inside one rank, NEWEST FIRST. "First in goes down, the new ones come on
 *      top" is the client's rule for every table, and a page holds 20 rows: with
 *      an oldest-first sort the request that has just landed is pushed onto page
 *      two, underneath everything already handled.
 *
 * A bad date sorts last rather than poisoning the comparison with NaN.
 */
export function queueOrder(
  a: { rank: number; at?: string | null },
  b: { rank: number; at?: string | null },
): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  return sortTime(b.at) - sortTime(a.at);
}

/**
 * Where each request state sits in the Transport Manager's queue.
 *
 * Pending sits on TOP, at the TM's instruction: a Pending row is a request the
 * partner has raised and nobody has actioned at all yet — it is the only row in
 * this table that is stopped dead waiting on him, so it must never be buried
 * under rows he has already opened. Seen (opened, first approval given, no truck
 * on it yet) follows, then the rest of the work in the same action group.
 *
 * Scheduled and In transit are simply running and belong below; Completed and
 * Declined are over and sit at the bottom. Every state runs newest first, so the
 * request that has just arrived is the first row of its group.
 */
export const PARTNER_QUEUE_RANK: Record<PartnerUiStatus, number> = {
  // A returned request is the loudest thing in his queue — someone is blocked
  // until it is corrected and resent.
  Returned: 0,
  Pending: 1,
  Seen: 3,
  // Assigned rides with Seen: same waiting-for-final-approval zone, but the
  // partner now sees the vehicle went on.
  Assigned: 3,
  Scheduled: 4,
  "In transit": 5,
  Completed: 6,
  Declined: 7,
};

/**
 * Transport Manager's request queue: what needs him on top, newest first inside
 * each state, everything already moving or finished below it. Applied to the
 * table AND the CSV so what is exported matches what is on screen.
 */
export function partnerQueueOrder(a: QueueTrip, b: QueueTrip): number {
  return queueOrder(
    { rank: PARTNER_QUEUE_RANK[toPartnerUiStatus(a)], at: a.createdAt },
    { rank: PARTNER_QUEUE_RANK[toPartnerUiStatus(b)], at: b.createdAt },
  );
}

/**
 * The PARTNER's own default order for their dashboard list.
 *
 * The OWNER's order (26 Oct 2026, after Sabar Stein reached out): what is
 * still WAITING ON PETROLINE leads — Pending first, then Seen — and only
 * after that what is already moving. The earlier mirror-of-the-TM's order
 * (In transit above Pending) was built for truck-spotting on the road, but
 * the front desk reads the page as a work queue: the request that has not
 * been acted on yet is what they came to see. Returned (sent back for
 * correction) still sits above everything the partner did not cause, but
 * under the two statuses the owner named first. A big partner (Saba runs
 * dozens of orders a day) reads the top of the list and knows immediately
 * which of their requests still needs an answer.
 */
export const PARTNER_PORTAL_RANK: Record<PartnerUiStatus, number> = {
  Pending: 0,
  Seen: 1,
  // Assigned is progress the partner wants near the top — their truck is going on.
  Assigned: 2,
  Returned: 3,
  "In transit": 4,
  Scheduled: 5,
  Completed: 6,
  Declined: 7,
};

/** Partner-portal priority order: act-on-me rank first, newest first inside it. */
export function partnerPortalOrder(
  a: { status: PartnerUiStatus; at?: string | null },
  b: { status: PartnerUiStatus; at?: string | null },
): number {
  return queueOrder(
    { rank: PARTNER_PORTAL_RANK[a.status], at: a.at },
    { rank: PARTNER_PORTAL_RANK[b.status], at: b.at },
  );
}

/**
 * Human-facing request label, shared by the Transport Manager's request table
 * and the partner portal.
 *
 * `Seen` is the TM's FIRST approval: the request has been acknowledged, the
 * partner can see it was read, but no truck has been dispatched yet.
 * `Assigned` is the rung Fortune asked for (31 Oct 2026): Fleet Operations has
 * hung a vehicle and driver on the request — the partner sees progress past
 * "Seen" the moment that happens, instead of an acknowledged word that stuck.
 * `Scheduled` is the FINAL approval, when the dispatch is on the board.
 * There is no "Approved" state in the pipeline — Pending, Seen, Assigned,
 * Scheduled, In transit, Completed, Declined.
 *
 * How these line up with the internal words (toInternalUiStatus) — one rung
 * each, so a partner and a TM looking at the same trip are reading the same
 * fact in their own vocabulary rather than two different stories:
 *   Pending ↔ Pending      Seen ↔ Approved (no crew yet)
 *   Assigned ↔ Awaiting Approval (crewed, TM has still to release it)
 *   Scheduled ↔ Scheduled  In transit ↔ In Transit
 *   Completed ↔ Completed and the TM's two field endings
 *   Declined ↔ Declined    Returned ↔ Pending + the TM's correction note
 */
export type PartnerUiStatus =
  "Pending" | "Seen" | "Assigned" | "Scheduled" | "Declined" | "In transit" | "Completed" | "Returned";

export function toPartnerUiStatus(
  trip: Pick<Trip, "status" | "headId" | "truckReg" | "driverId" | "driverName">,
): PartnerUiStatus {
  switch (tripBucket(trip)) {
    case "pending":
      // A Requested trip that carries the TM's return note was sent BACK to
      // the partner to correct — it must never read Pending again, which is
      // the word for a request nobody has looked at yet (Shula: "the status
      // is misleading — the partners can't see that their request was
      // returned").
      if (isReturnedRequest(trip)) return "Returned";
      return "Pending";
    case "approved":
    case "awaiting":
      if (hasAssignment(trip)) return "Assigned";
      return "Seen";
    case "scheduled":
      return "Scheduled";
    case "inTransit":
      return "In transit";
    case "completed":
      return "Completed";
    case "declined":
      return "Declined";
  }
}

/**
 * A request the Transport Manager sent BACK for correction. It lives in the
 * pending BUCKET (the partner can still edit and resubmit it) but must never
 * be PRESENTED as pending — every reader asks the note, not just the status.
 */
export function isReturnedRequest(
  trip: Pick<Trip, "partnerNote"> & Partial<Pick<Trip, "status">>,
): boolean {
  const status = String(trip.status ?? "Requested").trim();
  return Boolean(trip.partnerNote?.trim()) && (status === "Requested" || status === "Draft");
}

/**
 * The stamp the "Date Approved" column / field is allowed to show.
 *
 * A request that was declined must NOT keep showing a date under a heading
 * that reads Approved — the client hit exactly that after declining a request
 * that had already been assigned a truck, so the row advertised an approval
 * that never applied. Pending requests are not approved either. Everything
 * still renders "—" until there is a real approval to point at.
 */
export function approvedStampOf(
  trip: Pick<Trip, "status" | "headId" | "truckReg" | "driverId" | "driverName" | "dispatchedAt">,
): string | null {
  const bucket = tripBucket(trip);
  if (bucket === "declined" || bucket === "pending") return null;
  return trip.dispatchedAt ?? null;
}

/**
 * THE internal vocabulary for a dispatch status — board, Dispatch History, the
 * dispatch details panel and its printed copy, the gate list, the tracking board
 * and the role dashboards all print this word and nothing else.
 *
 * It used to be several vocabularies. The Fleet Ops board said "Awaiting
 * Approval" and "Approved"; Dispatch History folded both into "Scheduled"; the
 * details panel printed the raw DB status; the gate and the tracking board
 * printed "Loaded" / "En Route" / "Approved for Dispatch". One dispatch could
 * therefore be described three ways on three screens — and the client hit the
 * worst of it: a board row reading "Scheduled" whose own timeline said the
 * Transport Manager had still to approve the dispatch.
 *
 * Each word here is a DISTINCT stage, so nobody has to guess which one a
 * dispatch is actually in:
 *   Pending            — with the Transport Manager, nobody has actioned it
 *   Approved           — he approved the request; Fleet Ops has still to crew it
 *   Awaiting Approval  — Fleet Ops crewed it; he has still to release the dispatch
 *   Sent Back          — he returned the crewed dispatch to Fleet Ops
 *   Scheduled          — released, on the board, not yet moving
 *   In Transit         — out of the yard (loading / running / offloading)
 *   Completed          — delivered and closed
 *   Returned to …      — the TM's field endings, kept as words of their own
 *   Declined           — rejected (DB status `Stopped`)
 */
export type InternalUiStatus =
  | "Pending"
  | "Approved"
  | "Awaiting Approval"
  | "Sent Back"
  | "Scheduled"
  | "In Transit"
  | "Completed"
  | "Returned to Customer"
  | "Returned to Fleet Ops"
  | "Declined";

/** Every internal word, in lifecycle order — filter menus and CSVs read this. */
export const INTERNAL_UI_STATUSES: InternalUiStatus[] = [
  "Pending",
  "Approved",
  "Awaiting Approval",
  "Sent Back",
  "Scheduled",
  "In Transit",
  "Completed",
  "Returned to Customer",
  "Returned to Fleet Ops",
  "Declined",
];

/** Pill colours, shared so the same word never wears two colours. */
export const INTERNAL_STATUS_CLASS: Record<InternalUiStatus, string> = {
  Pending: "bg-[#FC0] text-[#1B2432]",
  Approved: "bg-[#34C759] text-white",
  "Awaiting Approval": "bg-[#FC0] text-[#1B2432]",
  "Sent Back": "bg-[#141A1F] text-white",
  Scheduled: "bg-[#CB30E0] text-white",
  "In Transit": "bg-[#30B0C7] text-white",
  Completed: "bg-[#007AFF] text-white",
  "Returned to Customer": "bg-[#627084] text-white",
  "Returned to Fleet Ops": "bg-[#627084] text-white",
  Declined: "bg-[#ED351D] text-white",
};

export function toInternalUiStatus(trip: {
  status: Trip["status"] | string;
  sendBackReason?: string | null;
}): InternalUiStatus {
  const status = String(trip.status ?? "").trim();
  // A dispatch the TM sent back to Fleet Ops is not a green approval: the send
  // back wipes the crew and costs and hands the config back for re-assignment.
  if (status === "Approved" && trip.sendBackReason?.trim()) return "Sent Back";
  if (status === "Stopped") return "Declined";
  // One word for the whole on-road stretch — loading, running, offloading and
  // the drive home all read "In Transit".
  if (IN_TRANSIT_STATUSES.includes(status)) return "In Transit";
  switch (status) {
    case "Requested":
    case "Draft":
      return "Pending";
    case "Approved":
    case "Approved for Dispatch":
      return "Approved";
    case "Awaiting Approval":
      return "Awaiting Approval";
    case "Scheduled":
      return "Scheduled";
    case "Completed":
      return "Completed";
    case "Returned to Customer":
      return "Returned to Customer";
    case "Returned to Fleet Ops":
      return "Returned to Fleet Ops";
    default:
      // An unknown status stays visible rather than vanishing off every board.
      return "Pending";
  }
}

