/**
 * THE STORE'S ROUTES — the single registry of where each store page lives.
 *
 * This file is the reason the store portal cannot drift apart again: the
 * department nav ([src/components/fleetopsx/department-sidebar.tsx]), the role
 * landing ([src/lib/fleetopsx/role-home.ts]) and the regression check
 * ([scripts/verify-department-nav.cjs]) all read the SAME constants, so
 * renaming a page here moves every link at once, and a typo fails the type
 * check instead of shipping a dead link.
 *
 * The TanStack route files keep their `createFileRoute("…")` string literals —
 * the typed router derives their types FROM those literals and each literal is
 * anchored to the route file's own path, so that layer cannot drift. This
 * registry is the link layer on top of it, and the unit check mirrors every
 * literal so any mismatch is caught the moment someone runs the tests.
 */

/** The shelf: add stock lines and view the listing. */
export const STORE_HOME = "/workspace/app/store";

/** Approved engineering tickets waiting for the store floor to hand over. */
export const STORE_PARTS_REQUEST = "/workspace/app/store/parts-request";

/** The buys the store raises for the Transport Manager. */
export const STORE_PROCUREMENT = "/workspace/app/store/procurement";

/** The dispense ledger — every part that left the shelf, signed out. */
export const STORE_ISSUE_HISTORY = "/workspace/app/store/issue-history";

/** All the store's own pages (rail order). */
export const STORE_PAGES = [
  STORE_PARTS_REQUEST,
  STORE_HOME,
  STORE_PROCUREMENT,
  STORE_ISSUE_HISTORY,
] as const;

/** Every route file of the store portal, as `createFileRoute` must declare it.
 * The index route carries a trailing slash ("/store/") — that is its real URL
 * literal, not an accident, and the unit check asserts it. */
export const STORE_ROUTE_LITERALS: Readonly<Record<(typeof STORE_PAGES)[number], string>> = {
  [STORE_PARTS_REQUEST]: "/workspace/app/store/parts-request",
  [STORE_HOME]: "/workspace/app/store/",
  [STORE_PROCUREMENT]: "/workspace/app/store/procurement",
  [STORE_ISSUE_HISTORY]: "/workspace/app/store/issue-history",
};
