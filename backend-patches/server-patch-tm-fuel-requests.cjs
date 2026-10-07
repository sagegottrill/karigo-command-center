#!/usr/bin/env node
/**
 * FleetOpsX server patch — TM fuel requests land cleared (the raise IS the
 * approval), and the TM can remove one of his own requests until it is
 * dispensed.
 *
 *   0b. REPAIR: the first version of this script anchored the POST edit on
 *       `status: 'Requested',` alone, which was NOT unique — it matched the
 *       first occurrence in the file (the procurement create inside the
 *       out-of-stock route) instead of the fuel POST route. That misplaced
 *       conditional is reverted here, and the POST edit now anchors on the
 *       unique two-line `note:` + `status:` pair in createFuelRequestRow's
 *       call site.
 *   1. POST /api/fuel-requests: when the caller holds Transport Manager or
 *      Platform Admin, the row is created Authorized, stamped with the raiser
 *      as the authorizer. The attendant then only dispenses.
 *   2. DELETE /api/fuel-requests/:id: raiser-only (Transport Manager /
 *      Platform Admin), only while the request has not been dispensed.
 *
 * Idempotent: every edit is anchored on unique code. Markers:
 * PFX-TM-CLEARED, PFX-TM-AUTH-STAMP, PFX-TM-DELETE.
 */
const fs = require("fs");

const FILE = "/var/www/fleetopsx-api/index.ts";
const MARK_POST = "// PFX-TM-CLEARED";
const MARK_DEL = "// PFX-TM-DELETE";
let s = fs.readFileSync(FILE, "utf8");
let touched = false;

/* ---------- 0. helper: does this caller hold the TM's clearing role? ---------- */

if (s.includes("function raisesAsTransportManager(")) {
  console.log("helper already present");
} else {
  const helperAnchor = "/** May this caller work the desk's queue (authorize / decline / dispense)? */";
  if (!s.includes(helperAnchor)) {
    console.error("FAIL: helper anchor not found");
    process.exit(1);
  }
  const helper = [
    "/**",
    " * Does this caller clear their own fuel raises? The Transport Manager's",
    " * raise IS the approval — it lands Authorized and the desk only dispenses",
    " * it. The platform administrator stands in the TM's shoes here.",
    " */",
    "function raisesAsTransportManager(req: any) {",
    "  const held: string[] = Array.isArray(req.user?.roles) ? req.user.roles : [String(req.user?.role || '')];",
    "  return held.includes('Transport Manager') || held.includes('Platform Admin');",
    "}",
    "",
  ].join("\n");
  s = s.replace(helperAnchor, helper + helperAnchor);
  touched = true;
  console.log("helper raisesAsTransportManager() added");
}

/* ---------- 0b. repair: the conditional must never sit on the procurement
   create (the original POST anchor matched the first `status: 'Requested'`
   in the file, inside the out-of-stock route). ---------- */

const wrongBlock = [
  "      linkedId: requisition.workOrder || requisition.id,",
  "      truckReg: requisition.truckReg,",
  "      // PFX-TM-CLEARED — the Transport Manager's raise IS the approval: it",
  "      // lands cleared and the desk only dispenses it.",
  "      status: raisesAsTransportManager(req) ? 'Authorized' : 'Requested',",
].join("\n");
if (s.includes(wrongBlock)) {
  s = s.replace(wrongBlock, [
    "      linkedId: requisition.workOrder || requisition.id,",
    "      truckReg: requisition.truckReg,",
    "      status: 'Requested',",
  ].join("\n"));
  touched = true;
  console.log("repair: misplaced conditional removed from the procurement create");
} else {
  console.log("repair: nothing to revert (procurement create is clean)");
}

/* ---------- 1. POST: TM raises land Authorized ---------- */

if (s.includes(MARK_POST)) {
  console.log("POST already patched (PFX-TM-CLEARED present)");
} else {
  const anchor = [
    "      note: String(req.body?.note || '').trim() || null,",
    "      status: 'Requested',",
  ].join("\n");
  if (!s.includes(anchor)) {
    console.error("FAIL: POST status anchor not found (note+status pair)");
    process.exit(1);
  }
  const replacement = [
    "      note: String(req.body?.note || '').trim() || null,",
    "      // PFX-TM-CLEARED — the Transport Manager's raise IS the approval: it",
    "      // lands cleared and the desk only dispenses it.",
    "      status: raisesAsTransportManager(req) ? 'Authorized' : 'Requested',",
  ].join("\n");
  s = s.replace(anchor, replacement);
  touched = true;
  console.log("POST patched: TM raises land Authorized");
}

/* ---------- 1b. stamp the raiser as the authorizer on cleared rows ---------- */

if (s.includes("PFX-TM-AUTH-STAMP")) {
  console.log("auth stamp already present");
} else {
  const createAnchor = "    });\n    try {\n      const unit = lubricantUnit(row.fuelType);\n      const who = source === 'Walk-In Sale'";
  if (!s.includes(createAnchor)) {
    console.error("FAIL: POST create anchor not found");
    process.exit(1);
  }
  const stamp = [
    "    });",
    "    // PFX-TM-AUTH-STAMP — a cleared raise carries WHO cleared it: the raiser",
    "    // himself, so the desk's screen shows the authority in force without a",
    "    // second person ever having touched the row.",
    "    if (row.status === 'Authorized' && !row.authorizedBy) {",
    "      await prisma.fuelRequest.update({",
    "        where: { id: row.id },",
    "        data: { authorizedBy: row.requestedBy, authorizedAt: row.createdAt || new Date() },",
    "      }).catch(() => undefined);",
    "      row.authorizedBy = row.requestedBy;",
    "      row.authorizedAt = row.createdAt || new Date();",
    "    }",
    "    try {",
    "      const unit = lubricantUnit(row.fuelType);",
    "      const who = source === 'Walk-In Sale'",
  ].join("\n");
  s = s.replace(createAnchor, stamp);
  touched = true;
  console.log("auth stamp added");
}

/* ---------- 2. DELETE: raiser removes an un-dispensed request ---------- */

if (s.includes(MARK_DEL)) {
  console.log("DELETE already patched (PFX-TM-DELETE present)");
} else {
  const route = [
    "",
    "// PFX-TM-DELETE — the Transport Manager removing one of his own raises.",
    "// His word created it, so his word can withdraw it — but only while nothing",
    "// has been poured against it; once the desk dispenses, the draw is history",
    "// and correcting it becomes a decision on the record, not a delete.",
    "app.delete('/api/fuel-requests/:id', authenticate, async (req: any, res) => {",
    "  const row = await prisma.fuelRequest.findUnique({ where: { id: req.params.id } });",
    "  if (!row) return res.status(404).json({ error: 'Fuel request not found' });",
    "  const isRaiser = !!row.requestedById && !!req.user?.id && row.requestedById === req.user.id;",
    "  if (!raisesAsTransportManager(req) || !isRaiser) {",
    "    return res.status(403).json({ error: 'Only the Transport Manager who raised a request can remove it.' });",
    "  }",
    "  if (row.status === 'Dispensed') {",
    "    return res.status(409).json({ error: row.reference + ' was already dispensed — it can no longer be removed.' });",
    "  }",
    "  await prisma.fuelRequest.delete({ where: { id: row.id } });",
    "  try {",
    "    await notify('Lubricant', 'Fuel request removed — ' + row.reference,",
    "      row.reference + ' • ' + row.quantity.toLocaleString() + ' ' + lubricantUnit(row.fuelType) + ' of ' + row.fuelType +",
    "      ' for ' + (row.requestedFor || row.requestedBy) + ' was withdrawn by ' + (req.user?.name || 'the Transport Manager') + '.',",
    "      'warning', 'Lubricant,Lubricant Manager,Fuel Manager,Fleet Operations',",
    "      { module: 'Fuel & Lubricant', eventKey: 'fuel.request_removed', refLabel: row.reference });",
    "  } catch (_) { /* the removal stands even if the alert fails */ }",
    "  res.json({ ok: true, removed: row.reference });",
    "});",
    "",
  ].join("\n");

  const anchor = "app.patch('/api/fuel-requests/:id', authenticate, async (req: any, res) => {";
  if (!s.includes(anchor)) {
    console.error("FAIL: PATCH route anchor not found");
    process.exit(1);
  }
  s = s.replace(anchor, route + anchor);
  touched = true;
  console.log("DELETE route added");
}

/* ---------- helpers must exist ---------- */

for (const helper of ["function mayWorkFuelDesk("]) {
  if (!s.includes(helper)) {
    console.error("FAIL: helper missing on server: " + helper);
    process.exit(1);
  }
}

if (touched) {
  fs.writeFileSync(FILE, s, "utf8");
  console.log("saved " + FILE);
} else {
  console.log("nothing to change; file untouched");
}
