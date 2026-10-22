import { authService } from "@/lib/fleetopsx/services";

/** Figma 93:1374 / 42:700 Workplace List labels (+ Tracking Ops department). */
export const ADMIN_DEPARTMENTS = [
  "Transport Admin",
  "Fleet Operations",
  "Fleet Field Operations",
  "Tracking Operations",
  "Loading Operations",
  "Lubricant",
  "Fuel Management",
  "Engineering and Maintenance",
  "Head of Engineering",
  "Parts and Store",
  "Accounts",
  "HR and Personnel",
  "Security",
  "Drivers",
] as const;

export type AdminDepartment = (typeof ADMIN_DEPARTMENTS)[number];

/** Map Figma department labels → live RoleKey used by the API. */
export function departmentToRoleKey(department: string): string {
  switch (department) {
    case "Transport Admin":
      return "Transport Manager";
    case "Fleet Operations":
    case "Fuel Management":
      return "Fleet Operations";
    // The YARD desk — it registers heads/tails and reports trucks returning
    // from trip. Its own role, distinct from the dispatch-planning Fleet Ops.
    case "Fleet Field Operations":
      return "Fleet Field Ops";
    case "Tracking Operations":
      return "Tracking";
    case "Loading Operations":
      return "Loading";
    case "Lubricant":
      return "Lubricant";
    case "Engineering and Maintenance":
      return "Engineering";
    // The ENGINEERING MANAGER is its own seat: he approves what the workshop
    // raises and does not need a workshop login to do it.
    case "Head of Engineering":
      return "Head of Engineering";
    case "Parts and Store":
      return "Parts & Store";
    case "Accounts":
      return "Accounts";
    case "HR and Personnel":
      return "HR";
    case "Security":
      return "Security";
    case "Drivers":
      return "Driver";
    default:
    // The lane-leak rule: an unmapped department NEVER silently becomes the
    // Transport Manager — the wrong default issued the manager's role (his
    // sidebar, his approvals, his access) to a staff account nobody made a
    // manager. The tick list is ADMIN_DEPARTMENTS, so this only fires when a
    // new department label exists before its mapping does; making it loud
    // keeps every account in its own lane.
    throw new Error(`Unknown department "${department}" — add its RoleKey mapping before issuing the role.`);
  }
}

/**
 * Every live RoleKey that grants a department's portal.
 *
 * The admin checklist uses Figma labels ("Security", "HR and Personnel"), the
 * API stores RoleKeys ("Security", "HR"), and a few roles carry historical
 * spellings ("Gate Security", "HR & Personnel"). A staff member picking the
 * department on the sign-in form must match on any of them — and the role we
 * then activate must be one the account actually holds.
 */
const DEPARTMENT_ROLE_ALIASES: Record<string, string[]> = {
  "Transport Admin": ["Transport Manager", "Platform Admin"],
  "Fleet Operations": ["Fleet Operations", "Fuel Management", "Fuel Manager"],
  "Fleet Field Operations": ["Fleet Field Ops", "Fleet Field Operations"],
  "Tracking Operations": ["Tracking", "Tracking Operations"],
  "Loading Operations": ["Loading", "Loading Operations"],
  // The department that dispenses diesel and gas has its own portal; the older
  // "Fuel Manager" spelling is kept so an account created before it still lands
  // in the right place.
  Lubricant: ["Lubricant", "Lubricant Manager", "Lubricant Operations", "Fuel Manager"],
  "Fuel Management": ["Fleet Operations", "Fuel Manager", "Lubricant"],
  "Engineering and Maintenance": ["Engineering"],
  "Head of Engineering": ["Head of Engineering", "Engineering Manager"],
  "Parts and Store": ["Parts & Store", "Parts and Store"],
  Accounts: ["Accounts", "Accountant"],
  "HR and Personnel": ["HR", "HR & Personnel", "HR and Personnel"],
  Security: ["Security", "Gate Security", "Gate"],
  Drivers: ["Driver"],
};

/** RoleKeys that grant the given department (primary mapping + aliases, deduped). */
export function departmentRoleKeys(department: string): string[] {
  return Array.from(new Set([departmentToRoleKey(department), ...(DEPARTMENT_ROLE_ALIASES[department] ?? [])]));
}

/**
 * The STOREHOUSE's own seats — the accounts that keep the shelf.
 *
 * PRD §1 and §2 are theirs, not Engineering's: the bulk Excel intake, manual
 * entries, unit costs and minimum thresholds are set by the storehouse (or the
 * TM on its oversight board). The issued RoleKey for the department is
 * "Parts & Store"; the other spellings cover accounts minted before the
 * department split so a legacy store login does not lose its keys.
 */
export const STORE_ROLES = ["Parts & Store", "Parts and Store", "Inventory"] as const;

/** True on a storekeeper account — the department that actually works the store. */
export function isStorekeeper(): boolean {
  if (typeof window === "undefined") return false;
  return authService.getRoles().some((r: any) => STORE_ROLES.includes(r));
}

/**
 * The department checklist label for a stored RoleKey — the inverse of
 * `departmentToRoleKey`, used to show an EXISTING account's departments ticked in
 * the checklist. A role several departments claim ("Fleet Operations" also grants
 * Fuel Management) resolves to the first, so one role never ticks two boxes.
 */
export function roleKeyToDepartment(role: string): string | null {
  for (const department of ADMIN_DEPARTMENTS) {
    if (departmentRoleKeys(department).includes(role)) return department;
  }
  return null;
}

/**
 * The role actually stored on the user that grants this department, or null
 * when they do not hold it. Always activate the RETURNED role — never the
 * department label — so the session only ever carries a real assigned role.
 */
export function roleForDepartment(department: string, roles: string[]): string | null {
  const keys = departmentRoleKeys(department);
  return roles.find((r) => keys.includes(r)) ?? null;
}

/** True when the user holds a role that grants this department's portal. */
export function canAccessDepartment(department: string, roles: string[]): boolean {
  return roleForDepartment(department, roles) !== null;
}
