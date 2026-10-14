/**
 * One-shot server patch (run ON the API server, like the other
 * backend-patches/server-patch-*.cjs) for the FleetOpsX mobile Engineering &
 * Maintenance portal (2026-10-13).
 *
 * APPLIED (2026-10-14): PATCH /api/tails/:id — Engineering may set a tail's
 * status (a tail cleared at check-up goes back to Available, a defective one
 * to Maintenance). Trucks already allowed Engineering.
 *
 * SUPERSEDED — DO NOT APPLY: the original sections 2–3 of this patch used a
 * body.status "HOE Review" flow for fuel requests. The live API already runs
 * a NEWER HOE flow (status chain Requested → HOE Approved → Authorized plus
 * POST /api/fuel-requests/:id/hoe-review), so those sections must stay out.
 * The script below applies ONLY the tails fix and verifies the newer HOE
 * flow is present.
 *
 * Parts requests need no server change: /inventory-requisitions accepts the
 * "HOE Review" status already, and the HOE's approval sets "Pending" — the
 * Transport Manager's existing approval queue.
 *
 * Run with: node /tmp/server-patch-engineering-hoe.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const FILE = process.argv[2] || "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");

const TAILS_FROM =
  "app.patch('/api/tails/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {";
const TAILS_TO =
  "app.patch('/api/tails/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {";

if (src.includes(TAILS_TO)) {
  console.log("skip: tails Engineering fix already applied");
} else {
  const at = src.indexOf(TAILS_FROM);
  if (at < 0 || src.indexOf(TAILS_FROM, at + TAILS_FROM.length) >= 0) {
    console.error("FAILED (tails): the expected code was not found exactly once — nothing written.");
    process.exit(1);
  }
  if (src.includes("ENG-HOE-REVIEW")) {
    console.error("FAILED: live file carries the superseded ENG-HOE-REVIEW block — restore it before re-running.");
    process.exit(1);
  }
  src = src.slice(0, at) + TAILS_TO + src.slice(at + TAILS_FROM.length);
  fs.writeFileSync(FILE + ".bak-engineering-hoe", fs.readFileSync(FILE));
  fs.writeFileSync(FILE, src);
  console.log("ok: tails Engineering fix applied (backup at " + FILE + ".bak-engineering-hoe)");
}

// Verify the newer HOE flow is still intact (informational, never writes).
const hasHoeChain =
  src.includes("HOE Approved") && src.includes("/api/fuel-requests/:id/hoe-review");
console.log(
  hasHoeChain
    ? "ok: newer HOE flow present (Requested → HOE Approved → Authorized + hoe-review endpoint)"
    : "WARN: newer HOE flow markers not found — inspect the fuel endpoints before restarting",
);
