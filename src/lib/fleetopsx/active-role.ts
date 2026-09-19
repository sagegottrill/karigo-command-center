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

/**
 * Roles allowed to LOG tracking checkpoints.
 *
 * Locating a truck is the Tracking department's job: they enter the checkpoint
 * history and move the delay status. Every other role (Transport Manager, Fleet
 * Ops, Security) opens the same page as pure visibility — they watch what
 * Tracking inputs, they never input it. Callers that label or gate a tracking
 * action MUST branch on this, so a viewer is never offered a logger's action.
 */
const TRACKING_LOG_ROLES = ["Tracking", "Platform Admin"];

export function canLogTracking(roles: string[]): boolean {
  return roles.some((r) => TRACKING_LOG_ROLES.includes(String(r)));
}

/**
 * Roles that may record a LOADING checkpoint.
 *
 * Collection is two departments' work at once: the Loading team standing at the
 * yard marks a site loaded the moment it happens, and Tracking — which owns the
 * journey — can log the same fact from the road. Both write ONE record (the
 * shared tracking checkpoint), so whichever gets there first is the truth and
 * the other simply agrees with it, instead of a second, conflicting entry.
 */
const LOADING_LOG_ROLES = ["Loading", "Loading Operations", "Platform Admin"];

export function canLogLoading(roles: string[]): boolean {
  return canLogTracking(roles) || roles.some((r) => LOADING_LOG_ROLES.includes(String(r)));
}

/**
 * The dispatch stages a role may pick from.
 *
 * Tracking walks the whole journey; the Loading department updates the Loading
 * stage only — that is their job, and the truck's later legs are not theirs to
 * move. A viewer gets nothing (the form is not shown at all).
 */
export function loggableLegs<T extends string>(roles: string[], allLegs: T[]): T[] {
  if (canLogTracking(roles)) return allLegs;
  if (canLogLoading(roles)) return allLegs.filter((leg) => String(leg) === "Loading");
  return [];
}

/** Roles that may see the Loading department's own board. */
const LOADING_VIEW_ROLES = [
  "Loading",
  "Loading Operations",
  "Tracking",
  "Tracking Operations",
  "Transport Manager",
  "Platform Admin",
  "Fleet Operations",
];

export function canViewLoading(roles: string[]): boolean {
  return roles.some((r) => LOADING_VIEW_ROLES.includes(String(r)));
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
