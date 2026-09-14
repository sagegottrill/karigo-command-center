import type { Trip } from "./types";

/**
 * Canonical display-ID derivation — THE single source of truth.
 *
 * Every table, detail page, export and toast MUST use these helpers so one
 * trip carries the SAME identity across all roles:
 *   partner portal / TM approvals  → REQ-xxxxx (the transport request)
 *   dispatch lifecycle             → DIS-xxxxx (the same number, DIS- prefix)
 *
 * IDs are derived deterministically from the trip id, so REQ-78016 and
 * DIS-78016 always refer to the same shipment — and every page agrees.
 */

/** Stable non-zero alphanumeric tail of an id (UUID-safe, case-insensitive). */
function idTail(id: string): string {
  const clean = id.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
  return clean.slice(-5).padStart(5, "0");
}

/** The request identity: REQ-xxxxx for every trip, everywhere. */
export function displayRequestId(tripOrId: Trip | string): string {
  const id = typeof tripOrId === "string" ? tripOrId : tripOrId.id;
  if (/^REQ-/i.test(id)) return `REQ-${id.slice(4).toUpperCase()}`;
  return `REQ-${idTail(id)}`;
}

/** The dispatch identity: DIS-xxxxx — same number as the REQ, DIS- prefix. */
export function displayDispatchId(tripOrId: Trip | string): string {
  const id = typeof tripOrId === "string" ? tripOrId : tripOrId.id;
  if (/^DIS-/i.test(id)) return `DIS-${id.slice(4).toUpperCase()}`;
  if (/^REQ-/i.test(id)) return `DIS-${id.slice(4).toUpperCase()}`;
  return `DIS-${idTail(id)}`;
}

/** Back-compat alias (older pages export names). */
export const dispatchDisplayId = displayDispatchId;
