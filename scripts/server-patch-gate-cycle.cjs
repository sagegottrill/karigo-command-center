#!/usr/bin/env node
/**
 * Gate cycle parity patch — the two client reports, fixed at the SERVER:
 *
 *  1. "Truck goes out but TM/Fleet Operation still show it in": the Departure
 *     GateEntry only flipped the TRIP. The availability boards read the ASSET
 *     (Truck/Tail rows) and the driver record. This patch makes a Departure
 *     stamp open the whole cycle: trip → En Route (+ stamp + who), truck/tail
 *     → Out of Yard, driver → On Trip.
 *  2. "Return reflects the truck but not the driver": the release matched
 *     drivers only from status 'On Trip', but assignment sets drivers to
 *     'On Trip' FROM 'Available' OR 'Active' — so men assigned from 'Active'
 *     never came off the road. The release now accepts both words.
 *
 * Applied to BOTH server gate paths: POST /api/gate (Dispatch Log rows) and
 * POST /api/gate/return ("Return a truck"). Idempotent; backs up index.ts;
 * auto-reverts if the health probe fails.
 */

const { execFileSync, spawnSync } = require("node:child_process");

const SSH = ["-o", "BatchMode=yes", "root@2.28.45.216"];
const run = (cmd, okToFail = false) => {
  try {
    return execFileSync("ssh", [...SSH, cmd], { encoding: "utf8" });
  } catch (error) {
    if (okToFail) return null;
    throw error;
  }
};
const writeViaSsh = (remoteCmd, content) => {
  const res = spawnSync("ssh", [...SSH, remoteCmd], { input: content, encoding: "utf8" });
  if (res.status !== 0) throw new Error("ssh write failed: " + res.stderr);
};

const MARKER = "GATECYCLE:V1";

const HELPERS = `
// --- ${MARKER}:HELPERS ------------------------------------------------------
// The gate's stamps name the truck; the register holds the rest. One matcher
// for both directions: a GateEntry's plate/tail text vs a Trip's truckReg/tail,
// compared by stripped keys ("GML368XX" vs "GML368XX / B1001" must match).
function gatePlateKey(v) {
  return String(v || '').trim().toUpperCase().split(/[\\s/]+/)[0] || '';
}
async function gateCycleAssetsOut(truckReg, tailNumber) {
  const norm = (v) => String(v || '').trim().toUpperCase();
  try {
    if (norm(truckReg)) {
      const trucks = await prisma.truck.findMany();
      const truck = trucks.find((t) => norm(t.registration) === norm(truckReg) || norm(t.cabId) === norm(truckReg));
      if (truck && ['Active', 'Available', 'Assigned'].includes(String(truck.status))) {
        await prisma.truck.update({ where: { id: truck.id }, data: { status: 'Out of Yard' } });
      }
    }
    if (norm(tailNumber)) {
      const tails = await prisma.tail.findMany();
      const tail = tails.find((t) => norm(t.number) === norm(tailNumber));
      if (tail && ['Available', 'Assigned'].includes(String(tail.status))) {
        await prisma.tail.update({ where: { id: tail.id }, data: { status: 'Out of Yard' } });
      }
    }
  } catch (e) {
    console.error('gate cycle (out) bookkeeping failed:', e?.message || e);
  }
}
async function gateCycleDriverOnTrip(driverName) {
  const name = String(driverName || '').trim();
  if (!name || /^unassigned$/i.test(name)) return;
  try {
    await prisma.driver.updateMany({
      where: { name, status: { in: ['Available', 'Active'] } },
      data: { status: 'On Trip' },
    });
  } catch (e) {
    console.error('gate cycle (driver out) failed:', e?.message || e);
  }
}
// --- ${MARKER}:HELPERS:END --------------------------------------------------
`;

const DEPARTURE_BLOCK = `
// --- ${MARKER}:DEPARTURE ----------------------------------------------------
// CYCLE OPEN. The gate's Departure stamp is the moment the truck physically
// left: the trip moves (if the stamp did not already carry it), the ASSET rows
// follow (truck and tail to Out of Yard — what the TM/Fleet availability
// boards read), and the driver goes On Trip. Without this, the boards kept
// saying "in the yard" while the gate had the truck on the road.
if (entry.type === 'Departure' && (entry.truckReg || entry.driver)) {
  try {
    const plateKey = gatePlateKey(entry.truckReg);
    const OPEN_TRIP_STATUSES = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
    const candidates = await prisma.trip.findMany({ where: { status: { in: OPEN_TRIP_STATUSES } } });
    const trip = candidates.find((t) => {
      const tr = String(t.truckReg || '').toUpperCase();
      const tail = String(t.tailNumber || '').toUpperCase();
      return (plateKey && (tr.includes(plateKey) || tail.includes(plateKey))) ||
        Boolean(entry.driver) && String(t.driverName || '').trim().toUpperCase() === String(entry.driver).trim().toUpperCase();
    });
    if (trip) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: {
          status: 'En Route',
          startTime: trip.startTime || autoStamp(entry.timestamp),
          gateOutBy: trip.gateOutBy || (req.user?.name || 'Security'),
        },
      });
    }
    await gateCycleAssetsOut(entry.truckReg, entry.tailNumber);
    await gateCycleDriverOnTrip(entry.driver);
  } catch (e) {
    console.error('gate departure cycle failed:', e?.message || e);
  }
}
// --- ${MARKER}:DEPARTURE:END ------------------------------------------------
`;

function stripMarker(src, marker) {
  const lines = src.split("\n");
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (line.includes(`${marker}:END`) || line.includes(`${marker}:HELPERS:END`) || line.includes(`${marker}:DEPARTURE:END`)) {
      skipping = false;
      continue;
    }
    if (line.includes(marker)) {
      skipping = true;
      continue;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

console.log("[1/6] Backing up index.ts…");
run("cd /var/www/fleetopsx-api && cp -n index.ts index.ts.bak-gatecycle");

console.log("[2/6] Fetching live source…");
const live = run("cat /var/www/fleetopsx-api/index.ts");
if (live.includes(MARKER)) {
  console.log("Already patched — nothing to do.");
  process.exit(0);
}
let src = live;

console.log("[3/6] Inserting cycle helpers before the gate log routes…");
const gateRouteAt = src.indexOf("app.get('/api/gate'");
if (gateRouteAt === -1) throw new Error("gate routes not found");
src = src.slice(0, gateRouteAt) + HELPERS + "\n" + src.slice(gateRouteAt);

console.log("[4/6] Wiring the DEPARTURE cycle into POST /api/gate…");
const returnAnchor = "  if (entry.type === 'Return' && (entry.truckReg || entry.driver)) {";
if (!src.includes(returnAnchor)) throw new Error("Return anchor not found");
src = src.replace(returnAnchor, DEPARTURE_BLOCK.trimEnd() + "\n" + returnAnchor);

console.log("[5/6] Fixing the driver release words in BOTH return paths…");
const before = src;
src = src.replaceAll(
  "where: { name: trip.driverName, status: 'On Trip' },",
  "where: { name: trip.driverName, status: { in: ['On Trip', 'Active'] } },",
);
src = src.replaceAll(
  "where: { name: closed.driverName, status: 'On Trip' },",
  "where: { name: closed.driverName, status: { in: ['On Trip', 'Active'] } },",
);
if (src === before) throw new Error("No driver-release site matched — aborting");

console.log("[6/6] Writing, restarting, probing…");
writeViaSsh("cat > /var/www/fleetopsx-api/index.ts.new && cd /var/www/fleetopsx-api && mv index.ts.new index.ts", src);
run("cd /var/www/fleetopsx-api && pm2 restart fleetopsx-api --update-env >/dev/null 2>&1 || pm2 restart fleetopsx-api");
execFileSync("sleep", ["4"]);
const health = run("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health", true);
console.log("health:", (health || "").trim());
if ((health || "").trim() !== "200") {
  console.error("BOOT FAILED — reverting");
  run("cd /var/www/fleetopsx-api && cp index.ts.bak-gatecycle index.ts && pm2 restart fleetopsx-api");
  process.exit(1);
}
console.log("OK — gate cycle parity is live.");
