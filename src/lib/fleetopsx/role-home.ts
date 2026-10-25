/**
 * Canonical first page per role — the top item of that role's sidebar/portal.
 *
 * Used by the login (role picker + direct entry), the header department switch,
 * and the /workspace/app landing redirect so every role always enters on its
 * own portal home instead of a shared manager overview.
 */
import { STORE_HOME } from "./store-routes";

const ROLE_HOME: Record<string, string> = {
  "Platform Admin": "/workspace/app",
  "Transport Manager": "/workspace/app",
  "Fleet Operations": "/workspace/app/dispatch",
  // The yard desk signs in onto the fleet registry — the register it owns.
  "Fleet Field Ops": "/workspace/app/fleet-registry",
  "Fleet Field Operations": "/workspace/app/fleet-registry",
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
  // The workshop signs in straight onto its merged board: requests and the
  // maintenance cycle in one Engineering page.
  Engineering: "/workspace/app/engineering-requests",
  "Engineering and Maintenance": "/workspace/app/engineering-requests",
  // The ENGINEERING MANAGER signs in straight onto that same page — his HOE
  // Review tab is where his decisions live. The workshop keeps its own board.
  "Head of Engineering": "/workspace/app/engineering-requests",
  "Engineering Manager": "/workspace/app/engineering-requests",
  // The Lubricant (fuel) department dispenses diesel and gas — its own portal,
  // opening on what is in the tank.
  Lubricant: "/workspace/app/lubricant-inventory",
  "Lubricant Manager": "/workspace/app/lubricant-inventory",
  "Lubricant Operations": "/workspace/app/lubricant-inventory",
  // The money desk signs in onto its own board: the dispatches it has to pay.
  Accounts: "/workspace/app/disbursal",
  Accountant: "/workspace/app/disbursal",
  // Roles without a dedicated Figma portal home stay on the Central Dashboard.
  Diesel: "/workspace/app",
  "Fuel Manager": "/workspace/app",
  // PROCUREMENT's lane is the store loop (PRD §5): the buying desk opens on
  // the store's own portal — the approved Store and Parts Inventory module —
  // and lands on the shelf (the portal's second, working page). The landing
  // comes from [store-routes.ts], the same registry the nav links read, so a
  // page move takes every entry point at once.
  Procurement: STORE_HOME,
  // The store is its own department — a store login must land on the store's
  // own desk, not the Transport Manager's overview (it used to fall through to
  // the admin dashboard with the manager's chrome).
  Inventory: "/workspace/app/inventory-desk",
  "Head of Inventory": "/workspace/app/inventory-desk",
  "Store Floor Attendant": "/workspace/app/inventory-desk",
  "Parts & Store": STORE_HOME,
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
