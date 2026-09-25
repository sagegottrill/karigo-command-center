/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * LIFECYCLE-COUPLING-V2: the yard follows the STATUS TRANSITION, whoever makes
 * it and however it arrives.
 *
 * The probe found the inconsistency: trucks sat "Available" while their
 * dispatches were En Route, and a driver stayed "On Trip" with no active
 * dispatch — because the movement rule only fired when the CLIENT sent
 * gateOutBy/gateInBy/startTime in the request body. The server derives those
 * stamps itself for gate accounts (GATE_ACTOR_V3) and the tracking route
 * advances status from checkpoints — in both paths `raw` carries nothing, so
 * `coupleTruckRegistry` never ran and the yard silently drifted out of step
 * with the road.
 *
 *   1. THE PATCH HANDLER COUPLES ON THE OUTCOME. movingOut/movingHome now read
 *      `data.status`/`trip.status` (the transition itself), so a gate-account
 *      En Route/Completed with server-derived stamps moves the truck exactly
 *      like a client-supplied one.
 *   2. THE TRACKING ROUTE COUPLES TOO. A checkpoint that advances a dispatch
 *      (first movement = departure, later legs, completion) now sends the
 *      named trucks out of the yard / home with the same helper.
 *   3. THE RETURN FREES THE DRIVER BY STATUS, NOT BY FIELD. The release now
 *      keys on the dispatch BEING Completed (and the driver name), so a
 *      completion that arrives without gateInBy still frees the man.
 *
 * Idempotent: safe to re-run.
 */
const fs = require("fs");
const INDEX = "/var/www/fleetopsx-api/index.ts";

const must = (ok, label) => {
  if (!ok) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

const raw = fs.readFileSync(INDEX, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const MARK = "// lifecycle-coupling-v2";

if (raw.includes(MARK)) {
  console.log("already patched — nothing to do");
  process.exit(0);
}

let src = raw;
const lines = src.split(/\r?\n/);
const findLine = (re, from = 0) => {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
};

/* ---- 1) the PATCH handler couples on the OUTCOME ----------------------- */

const oldMove = [
  "    const movingHome = String(trip.status) === 'Completed' && (raw.eta !== undefined || raw.gateInBy !== undefined);",
  "    const movingOut =",
  "      ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'].includes(String(trip.status)) &&",
  "      (raw.startTime !== undefined || raw.gateOutBy !== undefined);",
].join("\n");
const newMove = [
  "    // lifecycle-coupling-v2: the yard follows the TRANSITION, not the fields the",
  "    // client happened to send — the server derives gate stamps for gate accounts,",
  "    // so keying on raw.* left those trucks 'Available' while dispatched.",
  "    const movingHome = String(trip.status) === 'Completed';",
  "    const movingOut =",
  "      ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'].includes(String(trip.status));",
].join("\n");
must(src.includes(oldMove), "patch-handler movement rule found");
src = src.replace(oldMove, newMove);

// The driver release keys on the completion itself, not on gateInBy being sent.
const oldFree =
  "  if ((raw.gateInBy !== undefined || data.gateInBy !== undefined) && String(trip.status) === 'Completed' && trip.driverName) {";
const newFree = [
  "  // lifecycle-coupling-v2: a COMPLETED dispatch frees its driver — full stop.",
  "  // The old check demanded gateInBy in the request body, which a tracking-leg",
  "  // completion never carries, stranding the man as 'On Trip' with no load.",
  "  if (String(trip.status) === 'Completed' && before && before.status !== 'Completed' && trip.driverName) {",
].join("\n");
must(src.includes(oldFree), "driver-release rule found");
src = src.replace(oldFree, newFree);

/* ---- 2) the TRACKING route couples on its status advance ---------------- */

const anchor =
  "      if (Object.keys(data).length > 0) {\n        await prisma.trip.update({ where: { id: tripId }, data });\n      }";
must(src.includes(anchor), "tracking status-advance anchor found");
const replacement = [
  "      if (Object.keys(data).length > 0) {",
  "        await prisma.trip.update({ where: { id: tripId }, data });",
  "        // lifecycle-coupling-v2: a checkpoint that advances the dispatch moves the",
  "        // named trucks with it — first leg out of the yard, the arrival leg home.",
  "        const movedTrip = { ...trip, ...data };",
  "        if (String(movedTrip.status) === 'Completed') void coupleTruckRegistry(movedTrip, 'home');",
  "        else void coupleTruckRegistry(movedTrip, 'out');",
  "      }",
].join("\n");
src = src.replace(anchor, replacement);

src = lines.join(eol).includes(MARK) ? src : src; // lines were only used for discovery
src = src + (src.endsWith("\n") ? "" : eol);

/* ---- verify before writing ---------------------------------------------- */
must(src.includes(MARK), "marker present");
must(
  src.includes("const movingHome = String(trip.status) === 'Completed';"),
  "patch-handler outcome rule installed",
);
must(
  src.includes("before.status !== 'Completed' && trip.driverName"),
  "status-keyed driver release installed",
);
must(src.includes("void coupleTruckRegistry(movedTrip, 'out');"), "tracking coupling installed");

fs.writeFileSync(INDEX, src);
console.log("LIFECYCLE-COUPLING-V2 written to index.ts");
