/** Figma 93:1374 / 42:700 Workplace List labels */
export const ADMIN_DEPARTMENTS = [
  "Transport Admin",
  "Fleet Operations",
  "Fuel Management",
  "Engineering and Maintenance",
  "Parts and Store",
  "Accounts",
  "HR and Personnel",
  "Security",
  "Drivers",
] as const;

export type AdminDepartment = (typeof ADMIN_DEPARTMENTS)[number];
