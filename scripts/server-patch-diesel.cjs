/**
 * Server patch: the three things the Transport Manager's diesel view needs and
 * the platform cannot currently answer.
 *
 *  1. AUTHORIZATION. Fleet Ops computes what a dispatch needs; nobody authorizes
 *     it. `POST /api/lubricant/approvals` records the TM's litres on the trip's
 *     own directCosts JSON (no migration), so "awaiting my approval" and
 *     "approved, not yet collected" become two different lists instead of one
 *     pile of 57.
 *  2. THE CAP THAT MAKES IT REAL. The disbursal route now refuses to pump more
 *     than the authorized litres — the "one litre more" case the theft alert
 *     exists for is stopped at the pump, not just flagged afterwards. A dispatch
 *     with no authorization still dispenses (57 are waiting), and the board
 *     marks those as unauthorized rather than pretending they were approved.
 *  3. INBOUND PRICE. LubricantRestock had no unit cost, so the tank could only
 *     ever be valued at the TM's selling price. A nullable unitCost lets a
 *     delivery carry what it actually cost.
 *
 * Run ON the box from /var/www/fleetopsx-api.
 */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const API = "/var/www/fleetopsx-api/index.ts";
const must = (ok, label) => {
  if (!ok) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

/* ------------------------------------------------------------------ schema -- */

{
  const raw = fs.readFileSync(SCHEMA, "utf8");
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const lines = raw.split(/\r?\n/);

  const rStart = lines.findIndex((l) => /^model LubricantRestock\b/.test(l));
  must(rStart !== -1, "LubricantRestock model");
  const rEnd = lines.findIndex((l, i) => i > rStart && /^\}/.test(l));
  must(rEnd !== -1, "LubricantRestock closes");
  // `unitCost` already exists on InventoryItem — the guard has to be this
  // model's own block, not the file at large.
  if (!raw.split(/\r?\n/).slice(rStart, rEnd).some((l) => /^\s+unitCost\b/.test(l))) {
    const start = rStart;
    const end = rEnd;
    const loggedBy = lines.findIndex(
      (l, i) => i > start && i < end && /^\s+loggedBy\s+String\s*$/.test(l),
    );
    must(loggedBy !== -1, "LubricantRestock.loggedBy");
    lines.splice(
      loggedBy + 1,
      0,
      "  /// What the delivery actually cost per litre, when the buyer knows it.",
      "  unitCost Float?",
    );
    fs.writeFileSync(SCHEMA, lines.join(eol));

    const check = fs.readFileSync(SCHEMA, "utf8").split(/\r?\n/);
    const s2 = check.findIndex((l) => /^model LubricantRestock\b/.test(l));
    const e2 = check.findIndex((l, i) => i > s2 && /^\}/.test(l));
    must(check.slice(s2, e2).join("\n").includes("unitCost"), "unitCost inside LubricantRestock only");
    console.log("schema written");
  } else {
    console.log("ok: schema already carries unitCost");
  }
}

/* --------------------------------------------------------------- index.ts --- */

const src0 = fs.readFileSync(API, "utf8");
const eol = src0.includes("\r\n") ? "\r\n" : "\n";
let lines = src0.split(/\r?\n/);
const insertBefore = (test, add, label) => {
  const at = lines.findIndex((l) => test.test(l));
  must(at !== -1, label);
  lines.splice(at, 0, ...add);
  console.log("ok: " + label);
};
const replaceLine = (test, add, label) => {
  const at = lines.findIndex((l) => test.test(l));
  must(at !== -1, label);
  lines.splice(at, 1, ...add);
  console.log("ok: " + label);
};

const has = (needle) => lines.some((l) => l.includes(needle));

/* 1 — the approval reader, next to the request reader it belongs with. */
if (!has("function tripLubricantApproval")) {
  insertBefore(
    /^async function lubricantPending\(limit = 200\) \{/,
    [
      "/**",
      " * What the Transport Manager authorized for this dispatch, if anything.",
      " *",
      " * Stored on the trip's own directCosts JSON beside the request it answers,",
      " * so an authorization can never drift from the litre figure it is capping.",
      " */",
      "function tripLubricantApproval(directCosts: any) {",
      "  const dc = directCosts && typeof directCosts === 'object' ? directCosts : {};",
      "  const litres = Number(dc.lubricantApprovedLitres);",
      "  if (!Number.isFinite(litres) || litres <= 0) return null;",
      "  return {",
      "    litres,",
      "    by: String(dc.lubricantApprovedBy || ''),",
      "    at: String(dc.lubricantApprovedAt || ''),",
      "  };",
      "}",
      "",
    ],
    "tripLubricantApproval helper",
  );
}

/* 2 — the authorization route itself. */
if (!has("app.post('/api/lubricant/approvals'")) {
  insertBefore(
    /^app\.get\('\/api\/lubricant\/overview'/,
    [
      "// ---- Authorization: the Transport Manager releasing litres to a dispatch --",
      "//",
      "// Fleet Ops' number is what the dispatch *needs*; this is what the yard may",
      "// actually pump. Recorded on the trip's directCosts so the approval travels",
      "// with the dispatch the gate, the pump and this board all read.",
      "app.post('/api/lubricant/approvals', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req: any, res) => {",
      "  const tripId = String(req.body?.tripId || '').trim();",
      "  const revoke = Boolean(req.body?.revoke);",
      "  const litres = Number(req.body?.litres);",
      "  const by = String(req.body?.by || '').trim() || 'Transport Manager';",
      "  if (!tripId) return res.status(400).json({ error: 'tripId is required' });",
      "  if (!revoke && (!Number.isFinite(litres) || litres <= 0)) {",
      "    return res.status(400).json({ error: 'litres must be a positive number' });",
      "  }",
      "  try {",
      "    const trip = await prisma.trip.findUnique({ where: { id: tripId } });",
      "    if (!trip) return res.status(404).json({ error: 'Dispatch not found' });",
      "    const dc = trip.directCosts && typeof trip.directCosts === 'object' ? { ...(trip.directCosts as any) } : {};",
      "    if (revoke) {",
      "      delete dc.lubricantApprovedLitres;",
      "      delete dc.lubricantApprovedBy;",
      "      delete dc.lubricantApprovedAt;",
      "    } else {",
      "      dc.lubricantApprovedLitres = litres;",
      "      dc.lubricantApprovedBy = by;",
      "      dc.lubricantApprovedAt = new Date().toISOString();",
      "    }",
      "    const updated = await prisma.trip.update({ where: { id: tripId }, data: { directCosts: dc } });",
      "    try {",
      "      await notify('Lubricant',",
      "        revoke ? 'Diesel authorization withdrawn' : 'Diesel allocation authorized',",
      "        revoke",
      "          ? 'The allocation for ' + dispatchRef(tripId) + ' was withdrawn by ' + by + '.'",
      "          : litres.toLocaleString() + ' ' + (dc.lubricantType || 'Diesel') + ' authorized for ' +",
      "            dispatchRef(tripId) + ' by ' + by + '.',",
      "        revoke ? 'warning' : 'success',",
      "        'Lubricant,Lubricant Manager,Fleet Operations,Transport Manager');",
      "    } catch (_) { /* the authorization stands even if the alert fails */ }",
      "    res.json({ ok: true, tripId, approval: tripLubricantApproval(updated.directCosts) });",
      "  } catch (e: any) {",
      "    res.status(500).json({ error: e.message });",
      "  }",
      "});",
      "",
    ],
    "lubricant approval route",
  );
}

/* 3 — carry the approval on both queues the TM reads. */
if (!has("approval: tripLubricantApproval(trip.directCosts)")) {
  replaceLine(
    /^      request,$/,
    [
      "      request,",
      "      approval: tripLubricantApproval(trip.directCosts),",
      "      approvedByFleetOps: !!(trip.directCosts as any)?.lubricantApprovedLitres,",
    ],
    "requests payload carries the approval",
  );
}
if (!has("approval: tripLubricantApproval(trip ? trip.directCosts : null)")) {
  replaceLine(
    /^        \.\.\.\(vehicles\[r\.tripId\] \|\| \{ driver: null, head: null, tail: null \}\),$/,
    [
      "        ...(vehicles[r.tripId] || { driver: null, head: null, tail: null }),",
      "        approval: tripLubricantApproval(trip ? trip.directCosts : null),",
    ],
    "disbursal rows carry the approval",
  );
}

/* 4 — the pump cannot exceed what was authorized. */
if (!has("authorizedLitres")) {
  insertBefore(
    /^    const stock = await ensureLubricantStock\(fuelType\);$/,
    [
      "    // The authorization is a cap, not a suggestion: an attendant who is about",
      "    // to dispense more than the Transport Manager released is stopped here,",
      "    // with the figure that was released quoted back.",
      "    const authorizedLitres = tripLubricantApproval((trip as any).directCosts);",
      "    if (authorizedLitres && quantity > authorizedLitres.litres) {",
      "      return res.status(409).json({",
      "        error: 'The Transport Manager authorized ' + authorizedLitres.litres.toLocaleString() +",
      "          ' ' + lubricantUnit(fuelType) + ' for ' + dispatchRef(tripId) + ' — ' +",
      "          quantity.toLocaleString() + ' cannot be dispensed. Ask for the extra litres first.',",
      "      });",
      "    }",
    ],
    "disbursal cap",
  );
}

/* 5 — a delivery can carry what it cost. */
if (!has("unitCost: Number.isFinite(restockCost)")) {
  insertBefore(
    /^\s+if \(!loggedBy\) return res\.status\(400\)\.json\(\{ error: 'loggedBy is required' \}\);\s*$/,
    [
      "    const unitCost = Number(req.body?.unitCost);",
      "    const restockCost = Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null;",
    ],
    "restock price read",
  );
  replaceLine(
    /^\s+data: \{ reference: lubricantRef\(fuelType, count \+ 1\), fuelType, quantity, loggedBy \},\s*$/,
    [
      "      data: { reference: lubricantRef(fuelType, count + 1), fuelType, quantity, loggedBy, unitCost: restockCost },",
    ],
    "restock price stored",
  );
}

fs.writeFileSync(API, lines.join(eol));
console.log("index.ts written");

/* ------------------------------------------------------------------- data --- */

(async () => {
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "LubricantRestock" ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION`,
  );
  console.log("applied: LubricantRestock.unitCost");
  const cols = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'LubricantRestock' AND column_name = 'unitCost'`,
  );
  must(cols.length === 1, "column exists");
  await prisma.$disconnect();
})();
