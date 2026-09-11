import type { Trip } from "./types";

/** Short display id for Partner/FO tables — never show raw UUIDs. */
export function displayRequestId(tripOrId: Trip | string): string {
  const id = typeof tripOrId === "string" ? tripOrId : tripOrId.id;
  if (/^REQ-/i.test(id)) return id.toUpperCase().startsWith("REQ-") ? id.replace(/^req-/i, "REQ-") : id;
  const digits = id.replace(/\D/g, "").slice(-5) || id.replace(/-/g, "").slice(-5);
  return `REQ-${digits.padStart(5, "0")}`;
}
