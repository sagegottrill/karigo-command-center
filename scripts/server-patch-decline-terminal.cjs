/**
 * Server patch: a DECLINED request is closed — it cannot be put back on the road.
 * (run ON the Hetzner box: node server-patch-decline-terminal.cjs, then restart the API)
 *
 * Why: the dispatch lifecycle has several writers — the gate logging a departure,
 * tracking logging a location, fleet assigning a truck, the TM scheduling — and
 * each of them PATCHes a trip status. Nothing checked whether the request had
 * already been declined, so a later action could set a Stopped trip back to
 * "En Route" and the row reappeared as "In transit" for the customer and for the
 * Transport Manager. That is the defect behind "Declined is still showing
 * In transit": the decline was real, then written over.
 *
 * The rule now enforced at the API:
 *   - once a trip is Stopped, any write that would set a DIFFERENT status is
 *     refused with 409, whatever role sends it;
 *   - the single exception is the deliberate reversal: the Transport Manager (or
 *     Platform Admin) sending it back to "Requested", which is the documented
 *     "return to the customer to correct" path.
 *
 * Idempotent: re-running reports "skip".
 */
const fs = require("fs");

const FILE = "/var/www/fleetopsx-api/index.ts";

const ANCHOR = `  const before = await prisma.trip.findUnique({ where: { id: req.params.id } });
  const trip = await prisma.trip.update({ where: { id: req.params.id }, data });`;

const GUARD = `  const before = await prisma.trip.findUnique({ where: { id: req.params.id } });
  // A DECLINED request is CLOSED. No later action may move it back onto the
  // road: a gate departure, a tracking location, a fleet assignment and a
  // scheduling all write a live status, and without this check any one of them
  // turned a declined request back into "In transit" for the customer and for
  // the Transport Manager. The only accepted move away from Stopped is the
  // deliberate reversal — the Transport Manager (or Platform Admin) returning it
  // to the customer as "Requested" to correct.
  if (before && before.status === 'Stopped' && data.status !== undefined && data.status !== 'Stopped') {
    const mayReopen =
      !isPartner &&
      data.status === 'Requested' &&
      ['Transport Manager', 'Platform Admin'].includes(req.user.role);
    if (!mayReopen) {
      return res.status(409).json({
        error:
          'This request was declined and is closed — it cannot be set to "' +
          data.status +
          '". The Transport Manager can return it to the customer to re-raise instead.',
      });
    }
  }
  const trip = await prisma.trip.update({ where: { id: req.params.id }, data });`;

const MUST_ONE = (cond, what) => {
  if (!cond) {
    console.error("FAILED:", what);
    process.exit(1);
  }
};

const src = fs.readFileSync(FILE, "utf8");

if (src.includes("was declined and is closed")) {
  console.log("skip: terminal-decline guard already applied");
} else {
  MUST_ONE(src.includes(ANCHOR), "PATCH /trips anchor (before + update)");
  fs.writeFileSync(FILE, src.replace(ANCHOR, GUARD));
  console.log("applied: declined requests are terminal (409 on any revival)");
}

console.log("PATCH OK — restart the API (pm2 restart fleetopsx-api) to load it.");
