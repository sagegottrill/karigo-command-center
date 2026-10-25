#!/usr/bin/env node
/**
 * THE NAV REGRESSION CHECK — `npm run test:unit`.
 *
 * Offline unit checks for the department rail's route matching and the store
 * route registry. They exercise the REAL production rules — the pure module
 * the components import ([src/components/fleetopsx/department-nav-route.ts])
 * and the shared registry ([src/lib/fleetopsx/store-routes.ts]) — headlessly,
 * with no server and no browser, so the double-highlight bug (one click
 * lighting "Parts Request" AND "Store Inventory" at once) can never quietly
 * return in a refactor.
 *
 * Runs the TypeScript source directly (Node ≥23.6 strips types natively).
 * Wired into package.json as `test:unit`; CI and the pre-deploy routine
 * should call it before `npm run build`.
 */

const ok = [];
const failed = [];
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    ok.push(`  ok   ${name}`);
  } else {
    failed.push(`  FAIL ${name}\n       got:      ${a}\n       expected: ${e}`);
  }
}

(async () => {
  const { isPathActive, resolveActiveTo, isActiveRoute } =
    await import("../src/components/fleetopsx/department-nav-route.ts");
  const {
    STORE_HOME,
    STORE_PARTS_REQUEST,
    STORE_PROCUREMENT,
    STORE_ISSUE_HISTORY,
    STORE_PAGES,
    STORE_ROUTE_LITERALS,
  } = await import("../src/lib/fleetopsx/store-routes.ts");

  const STORE_RAIL = [...STORE_PAGES];

  /* --- 1. THE regression: exactly ONE active item per store route ---------- */
  for (const [route, label] of [
    [STORE_HOME, "Store Inventory"],
    [STORE_PARTS_REQUEST, "Parts Request"],
    [STORE_PROCUREMENT, "Procurement Request"],
    [STORE_ISSUE_HISTORY, "Issue History"],
  ]) {
    const lit = STORE_RAIL.filter((to) => isActiveRoute(route, to, STORE_RAIL));
    check(`${label} (${route}) lights exactly one rail item`, [...lit], [route]);
  }

  /* --- 2. The old bug, as a fixture --------------------------------------- */
  // /store/parts-request must NOT keep /store ("Store Inventory") selected.
  check(
    "the prefix (/store) stands down under a deeper match",
    isActiveRoute(STORE_PARTS_REQUEST, STORE_HOME, STORE_RAIL),
    false,
  );
  check(
    "the deeper page wins",
    isActiveRoute(STORE_PARTS_REQUEST, STORE_PARTS_REQUEST, STORE_RAIL),
    true,
  );
  check(
    "resolveActiveTo reports the single winner",
    resolveActiveTo(STORE_PARTS_REQUEST, STORE_RAIL),
    STORE_PARTS_REQUEST,
  );

  /* --- 3. Prefix-edge behaviour ------------------------------------------- */
  // One level deeper than any page (a future sub-route): still one winner.
  check(
    "a deeper hypothetical sub-route keeps its parent section lit",
    resolveActiveTo(`${STORE_PARTS_REQUEST}/detail`, STORE_RAIL),
    STORE_PARTS_REQUEST,
  );
  // Shared look-alikes: /store/parts-request-NOT-A-CHILD is NOT under /store.
  check(
    "hyphen-lookalike paths are not treated as children",
    isPathActive("/workspace/app/store-parts-request", STORE_PARTS_REQUEST),
    false,
  );
  check(
    "trailing '/' on the parent matches the section itself",
    isPathActive(`${STORE_HOME}/`, STORE_HOME),
    true,
  );
  // Off-rail routes highlight nothing.
  check(
    "an unrelated path lights nothing",
    resolveActiveTo("/workspace/app/nothing", STORE_RAIL),
    null,
  );

  /* --- 4. Alias safety ----------------------------------------------------- */
  check(
    "querying a destination that is not in the candidate list is false",
    isActiveRoute(STORE_PARTS_REQUEST, "/workspace/app/elsewhere", STORE_RAIL),
    false,
  );

  /* --- 5. Registry ↔ route-file literal drift ----------------------------- */
  const LITERAL_BY_REPO_FILE = {
    "workspace.app.store.index": "/workspace/app/store/",
    "workspace.app.store.parts-request": "/workspace/app/store/parts-request",
    "workspace.app.store.procurement": "/workspace/app/store/procurement",
    "workspace.app.store.issue-history": "/workspace/app/store/issue-history",
  };
  for (const [key, literal] of Object.entries(LITERAL_BY_REPO_FILE)) {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const scriptDir = path.dirname(process.argv[1]);
    const file = path.join(scriptDir, `../src/routes/${key}.tsx`);
    const text = fs.readFileSync(file, "utf8");
    check(
      `${key}.tsx declares createFileRoute(\"${literal}\")`,
      text.includes(`createFileRoute("${literal}")`),
      true,
    );
  }

  console.log([...ok, ...failed].join("\n"));
  if (ok.length) console.log(`\n${ok.length} checked, ${failed.length} failed`);
  if (failed.length) {
    console.error("\nNAV REGRESSION — fix before deploy.");
    process.exit(1);
  }
  process.exit(0);
})();
