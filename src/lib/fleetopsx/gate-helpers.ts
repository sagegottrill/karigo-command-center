import { authService } from "@/lib/fleetopsx/services";

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
