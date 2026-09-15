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
