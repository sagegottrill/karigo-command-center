import type { User } from "@/lib/fleetopsx/types";

/** Seeded portal logins for role testing — not Figma “Manage Staff” rows. */
const PORTAL_SEED_EMAILS = new Set(
  [
    "admin@fleetopsx.com",
    "manager@petroline.ng",
    "fleet@petroline.ng",
    "hr@petroline.ng",
    "accounts@petroline.ng",
    "engineering@petroline.ng",
    "gate@petroline.ng",
  ].map((e) => e.toLowerCase()),
);

const PORTAL_SEED_USERNAMES = new Set([
  "admin",
  "manager",
  "fleet",
  "hr",
  "accounts",
  "engineering",
  "gate",
]);

function localPart(emailOrUsername: string) {
  const raw = emailOrUsername.trim().toLowerCase();
  const at = raw.indexOf("@");
  return at >= 0 ? raw.slice(0, at) : raw;
}

/** Partner / external company accounts belong on Manage Partner, not Manage Staff. */
export function isPartnerUser(user: User) {
  return (
    user.department === "External Partner" ||
    user.roles.includes("Customer Portals (External)") ||
    Boolean(user.partnerCompanyName)
  );
}

/**
 * Figma Manage Staff Account lists middle-office people (e.g. John Doe / Cara Chen),
 * not the Petroline role portal seeds (gate, fleet, manager, admin, …).
 */
export function isManageableStaffUser(user: User) {
  if (user.status === "Deleted") return false;
  if (isPartnerUser(user)) return false;
  if (user.roles.includes("Platform Admin")) return false;

  const email = (user.email ?? "").trim().toLowerCase();
  if (email && PORTAL_SEED_EMAILS.has(email)) return false;

  const username = localPart(user.username || email);
  if (username && PORTAL_SEED_USERNAMES.has(username)) return false;

  // Seed display names: "Petroline Security", "Petroline Fleet Ops", …
  if (/^petroline\s/i.test(user.name.trim())) return false;
  if (/^system\s+admin$/i.test(user.name.trim())) return false;

  return true;
}

/** Map live/API department labels toward Figma table copy. */
export function displayStaffDepartment(department: string) {
  switch (department) {
    case "Fleet Operations":
      return "Fleet Operation";
    case "HR and Personnel":
    case "HR":
      return "HR & Personnel";
    case "Transport Admin":
    case "Transport Manager":
      return "Transport Admin";
    case "Engineering":
    case "Engineering and Maintenance":
      return "Engineering and Maintenance";
    default:
      return department;
  }
}
