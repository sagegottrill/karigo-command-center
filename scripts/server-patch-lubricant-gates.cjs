/**
 * Server patch: make every lubricant gate read the dispatch's LIFECYCLE STATUS.
 *
 * The UI moved to one rule — the Transport Manager's final approval IS the
 * release (Scheduled = released; Requested / Approved / Awaiting Approval =
 * waiting) — but the server still spoke the old dialect:
 *
 *   1. THE PUMP DISPENSED TO ANYTHING. POST /api/lubricant/disbursals checked
 *      stock, price and duplicates but never the dispatch's status, so an
 *      attendant could pump litres for a request the TM had not approved —
 *      and pump for a Completed trip nobody reconciled.
 *   2. THE "PENDING" LIST LIED. lubricantPending() only excluded
 *      Stopped/Declined/Completed/Returned, so every Scheduled, Loaded and
 *      En Route dispatch sat in the department's queue forever — the same
 *      "62 still waiting" lie the boards showed.
 *   3. THE APPROVALS ROUTE KEPT A DEAD MODEL. POST /api/lubricant/approvals
 *      stamped a legacy litres blob nothing in the new flow reads — and it
 *      did so even for Completed dispatches.
 *   4. THE REQUESTS QUEUE HAD ONE PILE. /api/lubricant/requests returned
 *      awaiting and released dispatches mixed, so each screen had to guess.
 *
 * Run ON the box from /var/www/fleetopsx-api (node scripts patch index.ts in
 * place; the UI already ships the same rule via approvalGate).
 */
const fs = require("fs");

const API = "/var/www/fleetopsx-api/index.ts";

const must = (ok, label) => {
  if (!ok) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

const raw = fs.readFileSync(API, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);

const has = (needle) => raw.includes(needle);

/** First line index matching re, or -1. */
function findLine(re, from = 0) {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
}

/**
 * Insert block AFTER the first line matching findRe that appears at or after
 * the first line matching anchorRe — so an insertion lands inside the route
 * the anchor names, never inside whatever route merely comes first.
 */
function insertAfterWithin(anchorRe, findRe, block, label) {
  if (block.length && has(block.find((l) => l.trim() !== "") || label)) {
    console.log("skip: " + label + " (already present)");
    return;
  }
  const anchorIdx = findLine(anchorRe);
  must(anchorIdx !== -1, label + " (anchor route found)");
  const at = findLine(findRe, anchorIdx);
  must(at !== -1, label + " (insertion point found)");
  lines.splice(at + 1, 0, ...block);
  console.log("ok: " + label);
}

function insertBefore(re, block, label) {
  if (block.length && has(block.find((l) => l.trim() !== "") || label)) {
    console.log("skip: " + label + " (already present)");
    return;
  }
  const idx = findLine(re);
  must(idx !== -1, label + " (anchor found)");
  lines.splice(idx, 0, ...block);
  console.log("ok: " + label);
}

function replaceLine(re, block, label) {
  if (block.length && has(block.find((l) => l.trim() !== "") || label)) {
    console.log("skip: " + label + " (already present)");
    return;
  }
  const idx = findLine(re);
  must(idx !== -1, label + " (anchor found)");
  lines.splice(idx, 1, ...block);
  console.log("ok: " + label);
}

/* The one gate, server-side: the TM's final approval (status Scheduled) is the
 * release; anything moving or finished was cleared by it earlier. */
if (!has("LUBRICANT_RELEASED_STATUSES")) {
  insertBefore(
    /^function tripLubricantRequest\(/,
    [
      "// The lifecycle gate every lubricant screen and route now shares with the",
      "// UI: the Transport Manager's final approval IS the release, so 'released'",
      "// is a status, not a litres figure somebody recorded beside the trip.",
      "const LUBRICANT_RELEASED_STATUSES = ['Scheduled', 'Loaded', 'En Route', 'Offloading', 'Returning', 'Delayed', 'Completed'];",
      "function lubricantGate(status: unknown) {",
      "  return LUBRICANT_RELEASED_STATUSES.includes(String(status ?? '').trim()) ? 'released' : 'waiting';",
      "}",
      "",
    ],
    "lifecycle gate helper",
  );
} else {
  console.log("skip: lifecycle gate helper (already present)");
}

/* 1 — the pump refuses an uncleared (or dead) dispatch. The duplicate check is
 * unique to the dispense route, so the gate lands directly above it. */
insertAfterWithin(
  /^app\.post\('\/api\/lubricant\/disbursals'/,
  /^    const duplicate = await prisma\.lubricantDisbursal\.findFirst/,
  [
    "    // The gate before the pump: a dispatch the Transport Manager has not",
    "    // cleared (Requested / Approved / Awaiting Approval) cannot be drawn",
    "    // from, and a declined or finished one is not a ticket at all. Stock",
    "    // checks below only matter once the trip itself is allowed to fuel.",
    "    if (['Stopped', 'Declined'].includes(String(trip.status ?? '').trim())) {",
    "      return res.status(409).json({",
    "        error:",
    "          dispatchRef(tripId) +",
    "          ' was ' +",
    "          (String(trip.status).toLowerCase() === 'stopped' ? 'declined' : String(trip.status).toLowerCase()) +",
    "          ' — there is nothing to dispense for.',",
    "      });",
    "    }",
    "    if (lubricantGate(trip.status) !== 'released') {",
    "      return res.status(409).json({",
    "        error:",
    "          'The Transport Manager has not cleared ' + dispatchRef(tripId) +",
    "          ' yet (status: ' + (String(trip.status || 'Requested') || 'Requested') +",
    "          ') — his approval is the release; ask him to approve the dispatch first.',",
    "      });",
    "    }",
    "",
  ],
  "pump gate on dispatch status",
);

/* 2 — the pending list speaks the lifecycle: each row carries its gate, so the
 * department can split "waiting on him" from "already released" and screens
 * never have to guess again. */
replaceLine(
  /^    pending\.push\(\{ trip: t, request: req \}\);$/,
  [
    "    // The TM's final approval IS the release: a Scheduled or moving dispatch",
    "    // was cleared when it was scheduled and must never sit here as waiting —",
    "    // and a declined trip is dead, not pending. The gate rides the row so",
    "    // every reader asks the same question.",
    "    pending.push({ trip: t, request: req, gate: lubricantGate(t.status) });",
  ],
  "pending rows carry their gate",
);

/* 3 — the approvals route warns that the model retired, and refuses the dead.
 * Anchored inside its own route (the litres validation is unique to it). */
insertAfterWithin(
  /^app\.post\('\/api\/lubricant\/approvals'/,
  /^    if \(!trip\) return res\.status\(404\)\.json\(\{ error: 'Dispatch not found' \}\);$/,
  [
    "    // The release is the Transport Manager's final approval in the request",
    "    // lifecycle — there is no separate litres step to record any more.",
    "    // Refuse the dead (declined / finished) and warn on everything else:",
    "    // kept only so older clients do not hard-fail while they catch up.",
    "    const approvalStatus = String(trip.status ?? '').trim();",
    "    if (['Stopped', 'Declined', 'Completed', 'Returned'].includes(approvalStatus)) {",
    "      return res.status(409).json({",
    "        error: dispatchRef(tripId) + ' is ' + (approvalStatus || 'dead') + ' — there is nothing left to release.',",
    "      });",
    "    }",
    "    console.warn(",
    "      '[lubricant/approvals] legacy litres release on ' + dispatchRef(tripId) +",
    "        ' — the release is the Transport Manager\\'s final approval; this endpoint is retired.',",
    "    );",
    "",
  ],
  "approvals route refuses the dead and warns on the retired model",
);

/* 4 — the requests queue names each row's side of the gate. */
replaceLine(
  /^      approvedByFleetOps: !!\(trip\.directCosts as any\)\?\.lubricantApprovedLitres,$/,
  [
    "      approvedByFleetOps: !!(trip.directCosts as any)?.lubricantApprovedLitres,",
    "      gate: lubricantGate(trip.status),",
  ],
  "requests rows carry their gate",
);

fs.writeFileSync(API, lines.join(eol));
console.log("index.ts written");
