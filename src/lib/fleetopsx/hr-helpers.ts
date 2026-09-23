import { authService } from "@/lib/fleetopsx/services";
import type { DriverStatus } from "@/lib/fleetopsx/types";

/**
 * Shared by every HR & Personnel page (Staff Records, Licence & Compliance,
 * Duty Roster) so the three cannot disagree about who maintains a staff record
 * or what a duty status looks like.
 */

/**
 * Who works the department's boards, and who may only read them.
 *
 * HR & Personnel runs the register day to day, and the **Transport Manager has
 * the same controls**: he is the one who has to onboard a driver mid-shift or
 * release one whose duty status has gone stale, and routing that through a
 * second department is how a dispatch sits unassigned. Everywhere else the TM
 * supervises rather than acts; on staff records he is a second pair of hands on
 * the same desk.
 *
 * Fleet Operations may open the boards to read them, and nothing more.
 */
export const HR_OWNER_ROLES = [
  "HR",
  "HR & Personnel",
  "HR and Personnel",
  "Transport Manager",
  "Platform Admin",
];

/** Who may open the boards at all: the department itself, its supervisor, Fleet Ops. */
export const HR_ACCESS_ROLES = [...HR_OWNER_ROLES, "Transport Manager", "Fleet Operations"];

export function rolesCanMaintainStaff() {
  if (typeof window === "undefined") return false;
  return authService.getRoles().some((r: any) => HR_OWNER_ROLES.includes(r));
}

/** Duty status → its pill, in the portal's own tones. */
export function dutyPillClass(status: DriverStatus) {
  switch (status) {
    case "Available":
      return "bg-[#34C759] text-white";
    case "On Trip":
      return "bg-[#F99E1F] text-white";
    case "Off Duty":
      return "bg-[#627084] text-white";
    case "Suspended":
      return "bg-[#ED351D] text-white";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export const DUTY_STATUSES: DriverStatus[] = ["Available", "On Trip", "Off Duty", "Suspended"];

/**
 * The value the driver column actually stores for each duty status.
 *
 * The register's own convention is `Active` for a driver ready to work (76 of
 * 105 live rows) while the screens read and say "Available"; `mapDriver` treats
 * the two as the same thing. Writing the stored spelling keeps the column from
 * accumulating a second word for one meaning.
 */
export function dutyStatusForWrite(status: DriverStatus): string {
  return status === "Available" ? "Active" : status;
}
