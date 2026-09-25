import { authService } from "@/lib/fleetopsx/services";
import { displayDriverSalary } from "@/lib/fleetopsx/display-ids";
import type { Driver, DriverStatus } from "@/lib/fleetopsx/types";

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

/**
 * The next free payroll number, in the register's own shape.
 *
 * Taken from the roster rather than from a counter, because the register is the
 * only record of what has already been issued: the highest number in use is
 * SL-00829, so the form suggests SL-00830 — the same series, spelled the same
 * way, instead of an invented ID from a different scheme that would then have
 * to be reconciled against payroll by hand.
 */
export function nextStaffNumber(drivers: Driver[]): string {
  let best: { prefix: string; digits: string; value: number } | null = null;
  for (const d of drivers) {
    const code = (displayDriverSalary(d) || d.employeeId || "").trim();
    const m = /^(.*?)(\d+)$/.exec(code);
    if (!m) continue;
    const value = Number(m[2]);
    if (!best || value > best.value) best = { prefix: m[1] ?? "", digits: m[2] ?? "", value };
  }
  if (!best) return "SL-00001";
  const next = String(best.value + 1).padStart(best.digits.length, "0");
  return `${best.prefix}${next}`;
}

export function rolesCanMaintainStaff() {
  if (typeof window === "undefined") return false;
  return authService.getRoles().some((r: any) => HR_OWNER_ROLES.includes(r));
}

/** Duty status → its pill, in the portal's own tones. */
export function dutyPillClass(status: DriverStatus | "In Transit") {
  switch (status) {
    case "Available":
    case "Active": // the register's seed word for the same free state
      return "bg-[#34C759] text-white";
    // "On Trip" and "In Transit" share one amber: a man on the road wears the
    // same colour whether the word came from HR or from his live dispatch.
    case "On Trip":
    case "In Transit":
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

export const DUTY_STATUSES: DriverStatus[] = [
  "Available",
  "Active",
  "On Trip",
  "Off Duty",
  "Suspended",
];

/**
 * The departments a staff record can be filed under.
 *
 * These are the words HR actually recruit against — the department a man
 * belongs to, not the desk he happens to be sitting at today. The list is the
 * one the department's own board offers, spelled the same way it is spoken on
 * the floor, so a record can be searched by what the person answering the
 * phone would say.
 */
export const HR_DEPARTMENTS = [
  "Transport Management",
  "HR and Personnel",
  "Driver",
  "Accounts Management",
  "Fleet Operations",
  "Diesel Management",
  "Parts and Inventory Management",
  "Tracking",
  "Security and Gate House",
] as const;

/**
 * EMPLOYMENT status — HR's own decision about the person, which is a different
 * question from the duty he is on today.
 *
 * The staff register asked both questions with one control: the picker offered
 * "In Transit", a word that belongs to a dispatch, so HR could file a man as
 * being on a trip he had not been given. Employment is Active / On Leave /
 * Suspended and nothing else; whether he is on the road is derived from the
 * dispatches that name him, and the register says so in its own column.
 */
export type EmploymentStatus = "Active" | "On Leave" | "Suspended";

export const EMPLOYMENT_STATUSES: EmploymentStatus[] = ["Active", "On Leave", "Suspended"];

/**
 * The word the driver column STORES for each employment decision — the column's
 * own spelling, not the screen's reading.
 *
 * `Available` is what the register says; `Active` is what the column holds (76
 * of its 105 live rows read Active, and `mapDriver` treats the two as one).
 * Writing the screen's word literally is how one meaning ends up with two
 * spellings in the same column, so Active is written as Active.
 */
export function employmentStatusForWrite(status: EmploymentStatus): string {
  switch (status) {
    case "Active":
      return "Active";
    case "On Leave":
      // The register's own word for a man who is employed but not offerable.
      return "Off Duty";
    case "Suspended":
      return "Suspended";
  }
}

/**
 * The employment decision behind a record.
 *
 * "On Trip" is deliberately read as Active: a man out on a dispatch HR never
 * sent him on is employed and ready, and the dispatch — not this column — is
 * what draws his duty.
 */
export function employmentStatusOf(driver: Driver): EmploymentStatus {
  switch (driver.status) {
    case "Suspended":
      return "Suspended";
    case "Off Duty":
      return "On Leave";
    default:
      return "Active";
  }
}

/**
 * The word the staff register prints in its Status column: the DEPARTMENT's
 * decision about the person — Active, On Leave or Suspended.
 *
 * The register used to print the duty word instead (a man the dispatch list knew
 * about read In Transit), which mixed two questions in one column: what HR has
 * filed, and where somebody else has sent him today. Who is on the road belongs
 * to the fleet and tracking boards, which read the dispatches directly; the
 * staff register answers for the staff file.
 */
export function staffStatusLabel(driver: Driver): EmploymentStatus {
  return employmentStatusOf(driver);
}

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
