/**
 * One-shot server patch (run ON the Hetzner box).
 *
 * ROOT CAUSE of the blank "Dispatched Date" everywhere: the ONLY thing that ever
 * stamped a departure was Security's gate page — and it is not being used. Of 42
 * live trips, 0 carried a gate stamp. Meanwhile Tracking was logging checkpoints
 * on 25 of the 30 live dispatches, so the board knew the trucks were out while
 * the date column, the delay clock, the partner's timeline and Fleet Ops'
 * "In Transit" all stayed empty.
 *
 * Fix (one place, every role benefits): the FIRST checkpoint logged against a
 * dispatch is the moment the truck was first seen moving.
 *   1. stamp Trip.startTime from that checkpoint,
 *   2. advance the trip from Scheduled → Loaded / En Route (the tracking leg
 *      decides which), so Fleet Ops sees it leave and the partner's timeline
 *      moves — forward only, never back, and never for a request the Transport
 *      Manager has not approved.
 *
 * Run with: node /tmp/patch-checkpoint-departure.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");

const must = (cond, label) => {
  if (!cond) {
    console.error("PATCH FAILED AT: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

if (src.includes("// checkpoint-departure-patch")) {
  console.log("already patched — nothing to do");
  process.exit(0);
}

// ---------------------------------------------------------------- helpers
const HELPERS = `
// checkpoint-departure-patch
/**
 * The trip status each tracking leg moves a dispatch to, and how far along that
 * is. A leg can only ever push the status FORWARD: a truck that has been logged
 * "In Transit" can never fall back to "Loaded" because someone re-logged an
 * earlier stop.
 */
const LEG_STATUS: Record<string, string> = {
  loading: 'Loaded',
  'in transit': 'En Route',
  'at destination': 'Offloading',
  offloaded: 'Offloading',
  return: 'Returning',
};
const ON_ROAD_RANK: Record<string, number> = {
  Scheduled: 0,
  Loaded: 1,
  'En Route': 2,
  Offloading: 3,
  Returning: 4,
  Completed: 5,
};

/** Advance a dispatch along the road from a logged leg (forward only). */
function statusFromLeg(current: string, leg: string): string | null {
  const target = LEG_STATUS[String(leg || '').trim().toLowerCase()];
  if (!target) return null;
  const from = ON_ROAD_RANK[String(current || '').trim()];
  const to = ON_ROAD_RANK[target];
  if (from === undefined || to === undefined) return null; // not on the road yet
  return to > from ? target : null;
}
// checkpoint-departure-patch-end
`;

{
  const anchor = "// --- TRACKING ---";
  must(src.includes(anchor), "tracking section anchor");
  src = src.replace(anchor, HELPERS.trim() + "\n\n" + anchor);
}

// ------------------------------------------------- POST /api/tracking body
const OLD_CREATE = `  const checkpoint = await prisma.trackingCheckpoint.create({
    data: { tripId, location, leg }
  });
  void notify('Operations', 'New Location has been Logged'`;
must(src.includes(OLD_CREATE), "POST /api/tracking create block");

const NEW_CREATE = `  const checkpoint = await prisma.trackingCheckpoint.create({
    data: { tripId, location, leg }
  });
  // FIRST MOVEMENT = DEPARTURE (checkpoint-departure-patch).
  // Security's gate page is the intended departure stamp, but in the field the
  // tracking crew's first checkpoint is what actually gets logged. Without this
  // the board's Dispatched Date, the delay clock, the partner's timeline and
  // Fleet Ops' "In Transit" all stayed empty on a truck that was plainly out.
  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (trip) {
      const data: Record<string, any> = {};
      if (!trip.startTime || !String(trip.startTime).trim()) {
        data.startTime = (checkpoint.at instanceof Date ? checkpoint.at : new Date()).toISOString();
      }
      const next = statusFromLeg(trip.status, leg);
      if (next) data.status = next;
      if (Object.keys(data).length > 0) {
        await prisma.trip.update({ where: { id: tripId }, data });
      }
    }
  } catch (e: any) {
    // A checkpoint must still be recorded even if the trip cannot be moved.
    console.error('departure stamp failed', e?.message);
  }
  void notify('Operations', 'New Location has been Logged'`;

src = src.replace(OLD_CREATE, NEW_CREATE);

fs.writeFileSync(FILE, src);
console.log("patched:", FILE);
