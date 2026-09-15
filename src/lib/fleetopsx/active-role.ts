/**
 * Active-role override — one person, several departments.
 *
 * The Transport Manager / Platform Admin assigns a user every role they hold.
 * This preference only chooses WHICH assigned department is currently shown
 * (dashboard, portal chrome and role-scoped pages). It never grants access to
 * a role the user does not already have — server-side authorization is the
 * source of truth for that.
 */
const ACTIVE_ROLE_KEY = "fleetopsx_active_role";

/** The currently-selected role among the user's assigned roles (first assigned role by default). */
export function getActiveRole(roles: string[]): string {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(ACTIVE_ROLE_KEY);
      if (stored && roles.includes(stored)) return stored;
    } catch {
      /* ignore */
    }
  }
  return roles[0] ?? "";
}

/**
 * Roles allowed to see pricing the Transport Manager controls (the fuel-rate
 * card: Diesel/Gas price per litre, lubricant cost and the grand total built
 * from them). Fleet Operations enters LITRES only — it never sees the rate or
 * the money the TM applied to it.
 */
const TM_PRICING_ROLES = ["Transport Manager", "Platform Admin", "Accounts", "Accountant"];

/**
 * True when at least one of the user's roles may see TM-managed pricing.
 * Callers that render fuel-rate-derived money MUST branch on this.
 */
export function canSeeTmPricing(roles: string[]): boolean {
  return roles.some((r) => TM_PRICING_ROLES.includes(r));
}

/** Persist the department switch; pass null to clear the override. */
export function setActiveRole(role: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (role) localStorage.setItem(ACTIVE_ROLE_KEY, role);
    else localStorage.removeItem(ACTIVE_ROLE_KEY);
  } catch {
    /* ignore */
  }
}
