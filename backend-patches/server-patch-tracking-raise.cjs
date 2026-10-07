#!/usr/bin/env node
/**
 * VPS patch: Tracking may RAISE a delivery request.
 *
 * Fortune, 07/10/2026: "Tracking Department should be able to do this — they
 * should also be able to make request same, but TM must approve, that's all."
 *
 * The raise screen (/workspace/app/new-request) posts to POST /api/trips. That
 * route's authorize() list named Platform Admin, Transport Manager, Fleet
 * Operations and Customer Portals (External) — Tracking was missing, so a
 * Tracking login would have been refused at the door even with the form open.
 *
 * The patch adds 'Tracking' to that list and nothing else. Approval is NOT
 * granted: the raised request lands as status Requested and the TM approves it
 * exactly like every other request (the form's own notification is already
 * actionRoles: ["Transport Manager"]). GET /api/trips and the /api/partner-sites
 * endpoints the form reads are authenticate-only, so no other gate moves.
 *
 * Idempotent (marker PFX-TRACKING-RAISE). Run from the API directory on the VPS:
 *   node server-patch-tracking-raise.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");

const MARKER = "PFX-TRACKING-RAISE";
const OLD =
  "app.post('/api/trips', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Customer Portals (External)'),";
const NEW =
  "app.post('/api/trips', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Customer Portals (External)', 'Tracking'),  /* PFX-TRACKING-RAISE */";

const file = process.argv[2] || "index.ts";
let src;
try {
  src = fs.readFileSync(file, "utf8");
} catch (e) {
  console.error(`Cannot read ${file}: ${e.message}`);
  process.exit(1);
}

if (src.includes(MARKER)) {
  console.log(`${MARKER}: already applied — nothing to change.`);
  process.exit(0);
}

const hits = src.split(OLD).length - 1;
if (hits !== 1) {
  console.error(`ANCHOR-MISMATCH: expected exactly 1 occurrence of the POST /api/trips authorize line, found ${hits}.`);
  console.error("The route line may have drifted — patch by hand against index.ts.bak-tracking instead.");
  process.exit(1);
}

fs.writeFileSync(file, src.replace(OLD, NEW), "utf8");
console.log(`${MARKER}: OK — 'Tracking' added to POST /api/trips authorize list. Restart the API to load it.`);
