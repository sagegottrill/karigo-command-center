/**
 * Canonical first page per role — the top item of that role's sidebar/portal.
 *
 * Used by the login (role picker + direct entry), the header department switch,
 * and the /workspace/app landing redirect so every role always enters on its
 * own portal home instead of a shared manager overview.
 */
const ROLE_HOME: Record<string, string> = {
  "Platform Admin": "/workspace/app",
  "Transport Manager": "/workspace/app",
  "Fleet Operations": "/workspace/app/dispatch",
  Security: "/workspace/app/gate",
  Gate: "/workspace/app/gate",
  "Gate Security": "/workspace/app/gate",
  Tracking: "/workspace/app/active-dispatch",
  "Tracking Operations": "/workspace/app/active-dispatch",
  // The Loading department works the SAME board as Tracking, scoped to
  // collecting: one page, one set of checkpoints, no second board to keep in
  // step. What they can DO there is what differs.
  Loading: "/workspace/app/active-dispatch",
  "Loading Operations": "/workspace/app/active-dispatch",
  HR: "/workspace/app/hr",
  "HR & Personnel": "/workspace/app/hr",
  // The workshop signs in straight onto its own board of work orders.
  Engineering: "/workspace/app/engineering",
  "Engineering and Maintenance": "/workspace/app/engineering",
  // The Lubricant (fuel) department dispenses diesel and gas — its own portal,
  // opening on what is in the tank.
  Lubricant: "/workspace/app/lubricant-inventory",
  "Lubricant Manager": "/workspace/app/lubricant-inventory",
  "Lubricant Operations": "/workspace/app/lubricant-inventory",
  // Roles without a dedicated Figma portal home stay on the Central Dashboard.
  Accounts: "/workspace/app",
  Diesel: "/workspace/app",
  "Fuel Manager": "/workspace/app",
  Procurement: "/workspace/app",
  // The store is its own department — a store login must land on the store's
  // own desk, not the Transport Manager's overview (it used to fall through to
  // the admin dashboard with the manager's chrome).
  Inventory: "/workspace/app/inventory-desk",
  "Head of Inventory": "/workspace/app/inventory-desk",
  "Store Floor Attendant": "/workspace/app/inventory-desk",
  "Parts & Store": "/workspace/app/parts",
  "Customer Portals (External)": "/workspace/customer-portal/dashboard",
};

const DEFAULT_HOME = "/workspace/app";

/** First page for a role (top of that role's sidebar). */
export function getRoleHome(role: string | undefined | null): string {
  return (role && ROLE_HOME[role]) || DEFAULT_HOME;
}

/**
 * First page for the current session: the active department if set,
 * otherwise the first assigned role that has its own portal home.
 */
export function getActiveRoleHome(roles: string[], active?: string): string {
  return getRoleHome(active ?? roles[0]);
}
