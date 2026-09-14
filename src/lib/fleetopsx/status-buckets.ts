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
 *   Stopped = Declined when no truck is assigned (rejected request),
 *            significant delay when a truck IS assigned (stopped en route).
 */
export type TripBucket =
  | "pending" // Requested (also legacy Draft) — awaiting TM decision
  | "approved" // Approved — released to Fleet Operations for assignment
  | "awaiting" // Awaiting Approval — FO assigned truck/driver, TM to confirm
  | "scheduled" // Scheduled — on the dispatch board, not yet moving
  | "inTransit" // Loaded / En Route / Offloading / Returning / Delayed
  | "completed" // Completed
  | "declined" // Stopped without a truck — rejected request
  | "stoppedEnRoute"; // Stopped with a truck — significant delay, still active

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
};

export function tripBucket(trip: Pick<Trip, "status" | "headId">): TripBucket {
  const status = String(trip.status ?? "").trim();
  if (status === "Stopped") return trip.headId ? "stoppedEnRoute" : "declined";
  return BUCKET_BY_STATUS[status] ?? "pending"; // unknown statuses stay visible as pending
}

export function isInBucket(trip: Pick<Trip, "status" | "headId">, buckets: TripBucket[]): boolean {
  return buckets.includes(tripBucket(trip));
}

/** Everything currently moving or dispatched (Active Dispatch board). */
export const ACTIVE_DISPATCH_BUCKETS: TripBucket[] = ["scheduled", "inTransit", "stoppedEnRoute"];

/** Queue Fleet Operations works from — only TM-approved requests. */
export const FO_QUEUE_BUCKETS: TripBucket[] = ["approved"];

/** Queue the Transport Manager works from — brand-new partner requests. */
export const TM_REQUESTS_BUCKETS: TripBucket[] = ["pending"];

/** A trip that is neither finished nor rejected. */
export const OPEN_BUCKETS: TripBucket[] = ["pending", "approved", "awaiting", "scheduled", "inTransit", "stoppedEnRoute"];

export function countBuckets(trips: Array<Pick<Trip, "status" | "headId">>): Record<TripBucket, number> {
  const counts = {
    pending: 0,
    approved: 0,
    awaiting: 0,
    scheduled: 0,
    inTransit: 0,
    completed: 0,
    declined: 0,
    stoppedEnRoute: 0,
  } satisfies Record<TripBucket, number>;
  for (const trip of trips) counts[tripBucket(trip)] += 1;
  return counts;
}

/** Partner-portal label for a trip (dashboard + request-detail pages). */
export type PartnerUiStatus = "Pending" | "Approved" | "Declined" | "In transit" | "Completed";

export function toPartnerUiStatus(trip: Pick<Trip, "status" | "headId">): PartnerUiStatus {
  switch (tripBucket(trip)) {
    case "pending":
      return "Pending";
    case "approved":
    case "awaiting":
    case "scheduled":
      return "Approved";
    case "inTransit":
    case "stoppedEnRoute":
      return "In transit";
    case "completed":
      return "Completed";
    case "declined":
      return "Declined";
  }
}

/** Dispatch History display label (internal staff view). */
export type HistoryUiStatus = "In Transit" | "Pending" | "Declined" | "Completed";

export function toHistoryUiStatus(trip: Pick<Trip, "status" | "headId">): HistoryUiStatus {
  switch (tripBucket(trip)) {
    case "inTransit":
    case "stoppedEnRoute":
      return "In Transit";
    case "pending":
    case "approved":
    case "awaiting":
    case "scheduled":
      return "Pending";
    case "completed":
      return "Completed";
    case "declined":
      return "Declined";
  }
}
