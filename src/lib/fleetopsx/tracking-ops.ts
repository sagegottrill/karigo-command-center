import type { Trip, TripStatus } from "@/lib/fleetopsx/types";

export type TrackingDelayStatus = "On Schedule" | "Slight delay" | "Significant Delay";

const ACTIVE_STATUSES: TripStatus[] = [
  "Scheduled",
  "Loaded",
  "En Route",
  "Offloading",
  "Returning",
  "Delayed",
  "Stopped",
];

export function isActiveDispatchTrip(trip: Trip) {
  return ACTIVE_STATUSES.includes(trip.status);
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

const CHECKPOINT_KEY = "fleetopsx_tracking_checkpoints";

function readCheckpoints(): LocationCheckpoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CHECKPOINT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocationCheckpoint[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCheckpoints(rows: LocationCheckpoint[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(rows));
}

export function listCheckpoints(tripId: string): LocationCheckpoint[] {
  return readCheckpoints().filter((c) => c.tripId === tripId);
}

export function addCheckpoint(input: {
  tripId: string;
  location: string;
  leg: LocationCheckpoint["leg"];
}): LocationCheckpoint {
  const row: LocationCheckpoint = {
    id: `LOC-${Date.now()}`,
    tripId: input.tripId,
    location: input.location.trim(),
    leg: input.leg,
    at: new Date().toISOString(),
  };
  writeCheckpoints([row, ...readCheckpoints()]);
  return row;
}
