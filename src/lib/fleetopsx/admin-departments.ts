/** Figma 93:1374 / 42:700 Workplace List labels (+ Tracking Ops department). */
export const ADMIN_DEPARTMENTS = [
  "Transport Admin",
  "Fleet Operations",
  "Tracking Operations",
  "Fuel Management",
  "Engineering and Maintenance",
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
    case "Tracking Operations":
      return "Tracking";
    case "Engineering and Maintenance":
      return "Engineering";
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
      return "Transport Manager";
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
  "Tracking Operations": ["Tracking", "Tracking Operations"],
  "Fuel Management": ["Fleet Operations", "Fuel Manager"],
  "Engineering and Maintenance": ["Engineering"],
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
