import { authService } from "@/lib/fleetopsx/services";
import { GATE_DEPARTED_STATUSES, GATE_RETURNED_STATUSES } from "@/lib/fleetopsx/status-buckets";
import type { Trip } from "@/lib/fleetopsx/types";

/**
 * Shared by the gate house's own portal and the Transport Manager's view of it,
 * so the two cannot disagree about who may open the gate log and who may write
 * to it.
 *
 * The gate is a department like any other: **Security logs the movement** — the
 * departure stamp when a truck leaves the yard and the return that closes the
 * dispatch — while the Transport Manager reads the same log as oversight. The
 * TM needs the visibility (a dispatch that has not left, or a truck that never
 * came back, is his problem) but not the pen: two people writing the same gate
 * stamp is how a departure ends up logged twice or an hour apart.
 */

/** The roles that work the gate house: logging departures and returns. */
export const GATE_OWNER_ROLES = ["Security", "Gate Security", "Gate", "Platform Admin"];

/** Who may open the gate log at all: the department itself and its supervisor. */
export const GATE_ACCESS_ROLES = [...GATE_OWNER_ROLES, "Transport Manager"];

/** True for the gate house itself — never for the Transport Manager reading it. */
export function rolesCanWorkTheGate() {
  if (typeof window === "undefined") return false;
  return authService.getRoles().some((r: any) => GATE_OWNER_ROLES.includes(r));
}

/* ------------------------------------------------------------------ movement */

/**
 * The movements the gate house is responsible for, read off the dispatch.
 *
 * The gate page and the Transport Manager's Security Oversight section both
 * need to answer "has this truck left?" and "has it come back?", and they must
 * answer it the same way — a departure counted on one board and not the other
 * is worse than not counting it at all. These three functions are the single
 * definition; `Departure`/`Returned` are the words shown when the status says a
 * stamp exists but no readable timestamp was ever written.
 */
/* The membership comes from the shared bucket map — this file keeps only the
 * gate's READING of it (a stamp, or the word when no readable stamp exists). */
const DEPARTED_STATUSES = GATE_DEPARTED_STATUSES;
const RETURNED_STATUSES = GATE_RETURNED_STATUSES;

/** The gate's real departure stamp, or null while the truck is still inside. */
export function gateDepartureStamp(trip: Trip): string | null {
  if (!DEPARTED_STATUSES.includes(String(trip.status))) return null;
  const stamp = String(trip.startTime ?? "").trim();
  return stamp && stamp !== "—" && stamp !== "-" ? stamp : "Departed";
}

/** The gate's real return stamp, or null while the truck is still out. */
export function gateReturnStamp(trip: Trip): string | null {
  if (!RETURNED_STATUSES.includes(String(trip.status))) return null;
  const stamp = String(trip.eta ?? "").trim();
  return stamp && stamp !== "—" && stamp !== "-" ? stamp : "Returned";
}

/** Has the truck left the yard and not come back? */
export function isOutOfYard(trip: Trip): boolean {
  return gateDepartureStamp(trip) !== null && gateReturnStamp(trip) === null;
}

/**
 * Any stored stamp → a moment, or null when it cannot be read. The column holds
 * either an ISO string or the gate's own "15 Sept 2026, 08:51".
 */
export function parseGateStamp(value: unknown): Date | null {
  const text = String(value ?? "").trim();
  if (!text || text === "—" || text === "-") return null;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `2026-09-15` + `08:51` — the two lines the gate log prints. */
export function splitGateStamp(value: string): { date: string; time: string } | null {
  const d = parseGateStamp(value);
  if (!d) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/**
 * Gate-to-gate duration in hours for a dispatch that both left and returned,
 * or null when either stamp is missing/unreadable. This is the trip's TRUE
 * on-road time, measured by the gate rather than reported by the driver.
 */
export function gateTurnaroundHours(trip: Trip): number | null {
  const out = parseGateStamp(gateDepartureStamp(trip));
  const back = parseGateStamp(gateReturnStamp(trip));
  if (!out || !back) return null;
  const hours = (back.getTime() - out.getTime()) / 3_600_000;
  return hours >= 0 ? hours : null;
}

/**
 * When the Transport Manager expects a truck back: the gate departure plus the
 * turnaround he set at final approval. Null when either half is missing — an
 * expectation we cannot compute is not an expectation, and inventing one would
 * flag an honest trip as overdue.
 */
export function expectedReturnAt(trip: Trip): Date | null {
  const days = Number(trip.estimatedDays ?? 0);
  if (!days || days <= 0) return null;
  const out = parseGateStamp(gateDepartureStamp(trip)) ?? parseGateStamp(trip.dispatchedAt);
  if (!out) return null;
  return new Date(out.getTime() + days * 86_400_000);
}

/** Whole days between two moments, floored at zero. */
export function daysBetween(from: string | Date | null | undefined, to: Date): number | null {
  const start = from instanceof Date ? from : parseGateStamp(from);
  if (!start) return null;
  return Math.max(0, (to.getTime() - start.getTime()) / 86_400_000);
}
