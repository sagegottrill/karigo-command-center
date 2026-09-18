import type { Trip } from "@/lib/fleetopsx/types";
import { ACTIVE_DISPATCH_BUCKETS, isInBucket } from "./status-buckets";
import { displayDispatchId } from "./request-id";

export type TrackingDelayStatus = "On Schedule" | "Slight delay" | "Significant Delay";

/**
 * Active Dispatch board = the shared ACTIVE_DISPATCH_BUCKETS definition
 * (scheduled + everything moving). A DECLINED request (`Stopped`) is never on
 * this board, even when a truck had already been assigned to it before the
 * decline — it is not cargo in motion.
 *
 * Tracking sees a dispatch only AFTER the Transport Manager's final approval
 * (status Scheduled). Fleet Ops' "Awaiting Approval" submissions go to the TM
 * alone — showing them here made Tracking receive assignments meant only for
 * the TM (Fortune, 16 Sept).
 */
export function isActiveDispatchTrip(trip: Trip) {
  return isInBucket(trip, ACTIVE_DISPATCH_BUCKETS);
}

/** Latest dispatch first — the board leads with the most recent movement. */
export function sortLatestFirst(a: Trip, b: Trip): number {
  const stamp = (t: Trip) =>
    new Date(t.dispatchedAt || t.assignedAt || t.createdAt || 0).getTime();
  return stamp(b) - stamp(a);
}

export function getTrackingDelayStatus(trip: Trip): TrackingDelayStatus {
  if (trip.status === "Delayed" && (trip.priority === "Critical" || trip.priority === "High")) {
    return "Significant Delay";
  }
  if (trip.status === "Delayed") {
    return "Slight delay";
  }
  return "On Schedule";
}

export const TRACKING_DELAY_COLOR: Record<TrackingDelayStatus, string> = {
  "On Schedule": "#0ACF83",
  "Slight delay": "#F99E1F",
  "Significant Delay": "#FF7262",
};

/** Canonical dispatch display id — defined once in request-id.ts. */
export const dispatchDisplayId = displayDispatchId;

/**
 * Dispatch-trip stages Tracking Ops updates, in physical order. Every stage can
 * carry any number of locations ("sub-dots"): Loading → In Transit →
 * At Destination → Offloaded → Return. The partner's timeline shows them under
 * the matching stage.
 */
export type TrackingLeg = "Loading" | "In Transit" | "At Destination" | "Offloaded" | "Return";

export const TRACKING_LEGS: TrackingLeg[] = [
  "Loading",
  "In Transit",
  "At Destination",
  "Offloaded",
  "Return",
];

/** Legacy rows stored "Outgoing"; everything maps onto the stage names above. */
export function normalizeLeg(leg?: string | null): TrackingLeg {
  const raw = (leg || "").trim().toLowerCase();
  if (raw === "return" || raw === "returning") return "Return";
  if (raw === "loading" || raw === "loaded") return "Loading";
  if (raw === "at destination" || raw === "destination") return "At Destination";
  if (raw === "offloaded" || raw === "offloading") return "Offloaded";
  return "In Transit";
}

export type LocationCheckpoint = {
  id: string;
  tripId: string;
  location: string;
  leg: TrackingLeg;
  at: string;
};

/** Case/space/punctuation-insensitive key so "Babangida.1" matches "babangida 1". */
export function normalizeSiteKey(value: string | null | undefined): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

/**
 * The loading sites the REQUEST was raised with, in request order.
 *
 * A partner picks one site for a single-loading request and several for a
 * multiple-loading one; `loadingSite` is the canonical list, `pickup` the
 * legacy single-site fallback. Tracking has to see every one of them, so this is
 * the single place that answers "what is this truck actually collecting?".
 */
/**
 * The partner company behind a dispatch — the key every "show me one partner"
 * filter uses. Never the consignee person: that is the partner's OWN customer.
 */
export function partnerOf(trip: Pick<Trip, "customer" | "customerConsignee">): string {
  return trip.customer && trip.customer !== "Customer Portal"
    ? trip.customer
    : trip.customerConsignee || "";
}

export function tripLoadingSites(trip: Pick<Trip, "loadingSite" | "pickup">): string[] {
  const raw =
    trip.loadingSite && trip.loadingSite.length > 0 ? trip.loadingSite : trip.pickup ? [trip.pickup] : [];
  const sites: string[] = [];
  for (const entry of raw) {
    for (const part of String(entry)
      .split(/[;,]/)
      .map((s) => s.trim())
      .filter(Boolean)) {
      if (!sites.some((s) => s.toLowerCase() === part.toLowerCase())) sites.push(part);
    }
  }
  return sites;
}

/**
 * One sub-dot under a stage. `logged` is false for a requested loading site the
 * Tracking team has not reached yet — the dot still shows, so the checklist is
 * visible instead of a site silently going missing.
 */
export type StageDot = {
  key: string;
  label: string;
  /** When it was logged (undefined while still outstanding). */
  at?: string;
  logged: boolean;
};

/**
 * Sub-dots for a stage, newest-last-log first.
 *
 * Loading is special: the requested sites lead the list in request order —
 * each one already logged with its time, or outstanding — followed by any extra
 * free-text locations. Other stages are simply their logged checkpoints.
 */
export function stageDots(
  stage: TrackingLeg,
  sites: string[],
  checkpoints: LocationCheckpoint[],
): StageDot[] {
  const forStage = checkpoints
    .filter((cp) => normalizeLeg(cp.leg) === stage)
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (stage !== "Loading" || sites.length === 0) {
    return forStage.map((cp) => ({ key: cp.id, label: cp.location, at: cp.at, logged: true }));
  }

  const claimed = new Set<string>();
  const siteDots: StageDot[] = sites.map((site, i) => {
    const key = normalizeSiteKey(site);
    const hit = forStage.find((cp) => normalizeSiteKey(cp.location) === key);
    if (hit) claimed.add(hit.id);
    return {
      key: `${key || "site"}-${i}`,
      label: site,
      at: hit?.at,
      logged: Boolean(hit),
    };
  });

  const extras = forStage
    .filter((cp) => !claimed.has(cp.id))
    .map((cp) => ({ key: cp.id, label: cp.location, at: cp.at, logged: true }));

  return [...siteDots, ...extras];
}

/** "2 of 3 sites loaded" — how far through a multiple-loading request we are. */
export function loadingSiteProgress(sites: string[], checkpoints: LocationCheckpoint[]) {
  if (sites.length === 0) return null;
  const logged = stageDots("Loading", sites, checkpoints).filter((d, i) => i < sites.length && d.logged).length;
  return { logged, total: sites.length };
}

import { fetchApi } from "./apiClient";

const CHECKPOINT_KEY = "fleetopsx_tracking_checkpoints";

export async function listCheckpoints(tripId: string): Promise<LocationCheckpoint[]> {
  const rows = await fetchApi<LocationCheckpoint[]>(`/tracking/${tripId}`).catch(() => []);
  return (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, leg: normalizeLeg(row.leg) }));
}

export async function addCheckpoint(input: {
  tripId: string;
  location: string;
  leg: LocationCheckpoint["leg"];
}): Promise<LocationCheckpoint> {
  return fetchApi('/tracking', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}
