import type { Trip, TripStatus } from "@/lib/fleetopsx/types";
import { ACTIVE_DISPATCH_BUCKETS, hasAssignment, isInBucket, tripBucket } from "./status-buckets";
import { displayDispatchId } from "./request-id";

export type TrackingDelayStatus = "On Schedule" | "Slight delay" | "Significant Delay";

/**
 * Active Dispatch board = the shared ACTIVE_DISPATCH_BUCKETS definition
 * (scheduled + everything moving, incl. a truck stopped en route) PLUS trips
 * Fleet Operations has already assigned but the TM hasn't final-approved yet
 * — a truck is committed at that point, so Tracking must see it. Previously
 * this raw list also matched a bare `Stopped` with no truck (declined cargo).
 */
export function isActiveDispatchTrip(trip: Trip) {
  if (isInBucket(trip, ACTIVE_DISPATCH_BUCKETS)) return true;
  return tripBucket(trip) === "awaiting" && hasAssignment(trip);
}

export function getTrackingDelayStatus(trip: Trip): TrackingDelayStatus {
  if (trip.status === "Delayed" && (trip.priority === "Critical" || trip.priority === "High")) {
    return "Significant Delay";
  }
  if (trip.status === "Delayed" || trip.status === "Stopped") {
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
