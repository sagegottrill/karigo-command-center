#!/usr/bin/env node
/**
 * One-shot server patch (run ON the box):
 *  1) Trip gains `gateOutBy` / `gateInBy` — WHICH security account stamped the
 *     gate log out / in. The Guard Activity Ledger the TM dashboard must show is
 *     "who scanned what, when", and until now the stamp carried no actor at all.
 *  2) LubricantDisbursal gains `signature` — the receiving driver's signature
 *     captured on the dispense dialog.
 *  3) PATCH /api/trips/:id whitelists the two new fields so the gate page can
 *     write them.
 * Idempotent: it checks for each piece before touching anything. Backs the file
 * up first. Restarts the API when it changed something.
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const FILE = "/var/www/fleetopsx-api/index.ts";
const PRISMA = "/var/www/fleetopsx-api/prisma/schema.prisma";

function die(msg) {
  console.error("FAIL: " + msg);
  process.exit(1);
}
function patchFile(file, transforms, label) {
  if (!fs.existsSync(file)) die(label + ": file missing " + file);
  const backup = file + ".bak-gate-actor";
  if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
  let src = fs.readFileSync(file, "utf8");
  let changed = 0;
  for (const [probe, find, replace] of transforms) {
    if (src.includes(probe)) {
      console.log(label + ": already has " + JSON.stringify(probe.slice(0, 40)) + " — skip");
      continue;
    }
    if (!src.includes(find)) die(label + ": anchor not found: " + JSON.stringify(find.slice(0, 60)));
    src = src.replace(find, replace);
    changed++;
  }
  if (changed) {
    fs.writeFileSync(file, src);
    console.log(label + ": " + changed + " edit(s) written");
  } else {
    console.log(label + ": nothing to do");
  }
  return changed;
}

let touched = 0;

// ---- 1. Prisma models -------------------------------------------------------
touched += patchFile(
  PRISMA,
  [
    [
      "gateOutBy",
      "model Trip {",
      "model Trip {\n  /// Which security account stamped Log Out at the gate (Guard Activity Ledger).\n  gateOutBy String?\n  /// Which security account stamped Log In (the return).\n  gateInBy  String?",
    ],
    [
      "signature",
      "model LubricantDisbursal {",
      "model LubricantDisbursal {\n  /// The receiving driver's signature captured at dispense time (data URL).\n  signature String?",
    ],
  ],
  "prisma",
);

// ---- 2. PATCH /api/trips/:id whitelist --------------------------------------
// The route copies a fixed field list from the body; the gate actor stamps must
// be on it or the client's write is silently dropped.
touched += patchFile(
  FILE,
  [
    [
      "gateOutBy",
      "['driverName', 'truckReg', 'requestedTruckType', 'tailType', 'pickup', 'dropoff', 'dropoffAddress', 'customerConsignee', 'customer', 'cargo', 'loadingSite', 'revenue', 'status', 'directCosts', 'tailNumber', 'sendBackReason', 'partnerNote', 'estimatedDate', 'startTime', 'estimatedDays', 'eta']",
      "['driverName', 'truckReg', 'requestedTruckType', 'tailType', 'pickup', 'dropoff', 'dropoffAddress', 'customerConsignee', 'customer', 'cargo', 'loadingSite', 'revenue', 'status', 'directCosts', 'tailNumber', 'sendBackReason', 'partnerNote', 'estimatedDate', 'startTime', 'estimatedDays', 'eta', 'gateOutBy', 'gateInBy']",
    ],
  ],
  "trips-patch",
);

// ---- 3. Lubricant disbursal POST: accept the signature ----------------------
// The disbursal create spreads req.body through a pick; find its pick list and
// add `signature`. Two possible shapes — try both.
(function patchDisbursal() {
  let src = fs.readFileSync(FILE, "utf8");
  if (/signature/.test(src) && /fuelType, quantity, dispensedBy/.test(src)) {
    console.log("disbursal: already passes signature — skip");
    return;
  }
  const before = src;
  // Shape A: explicit destructure
  src = src.replace(
    /const \{ tripId, fuelType, quantity, dispensedBy \}/,
    "const { tripId, fuelType, quantity, dispensedBy, signature }",
  );
  // Shape B: pick object
  src = src.replace(
    /dispensedBy: String\(req\.body\.dispensedBy \|\| ''\)\.trim\(\)/,
    "dispensedBy: String(req.body.dispensedBy || '').trim(),\n        signature: req.body.signature ? String(req.body.signature).slice(0, 200000) : null",
  );
  if (src !== before) {
    fs.writeFileSync(FILE, src);
    touched++;
    console.log("disbursal: signature accepted");
  } else {
    console.log("disbursal: no known shape matched — inspect manually");
  }
})();

// ---- 4. Push schema + restart ----------------------------------------------
if (touched) {
  try {
    console.log(execSync("cd /var/www/fleetopsx-api && npx prisma migrate dev --name gate_actor_signature --skip-seed 2>&1 | tail -4").toString());
  } catch (e) {
    console.log("migrate dev failed, trying db push: " + String(e.stdout || e));
    console.log(execSync("cd /var/www/fleetopsx-api && npx prisma db push --skip-generate 2>&1 | tail -4").toString());
  }
  console.log(execSync("pm2 restart fleetopsx-api 2>&1 | tail -2").toString());
  console.log("PATCHED (" + touched + " files touched) — server restarted");
} else {
  console.log("NOTHING CHANGED — no restart");
}
