import type { Trip, TripStatus } from "@/lib/fleetopsx/types";
import { ACTIVE_DISPATCH_BUCKETS, hasAssignment, isInBucket, tripBucket } from "./status-buckets";

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

export function dispatchDisplayId(trip: Trip) {
  if (/^DIS-/i.test(trip.id)) return trip.id;
  const digits = trip.id.replace(/\D/g, "").slice(-5) || trip.id.slice(-5);
  return `DIS-${digits.padStart(5, "0")}`;
}

export type LocationCheckpoint = {
  id: string;
  tripId: string;
  location: string;
  leg: "Outgoing" | "Return";
  at: string;
};

import { fetchApi } from "./apiClient";

const CHECKPOINT_KEY = "fleetopsx_tracking_checkpoints";

export async function listCheckpoints(tripId: string): Promise<LocationCheckpoint[]> {
  return fetchApi(`/tracking/${tripId}`).catch(() => []);
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
