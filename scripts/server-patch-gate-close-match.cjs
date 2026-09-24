/**
 * Corrective pass: GateEntry has NO trip link.
 *
 * The first pass keyed the closure on `entry.tripId`, which does not exist on the
 * model — the guard's stamp names the TRUCK and the DRIVER, and nothing else. So
 * the closure could never fire. This matches the open dispatch on the plate the
 * gate stamped, or on the driver's name, and closes that one.
 *
 * GateEntry columns: id, type, truckReg, driver, purpose, status, timestamp.
 * Run ON the box from /var/www/fleetopsx-api.
 */
const fs = require("fs");
const { execFileSync } = require("child_process");

const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

const OLD = `  if (entry.type === 'Return' && entry.tripId) {
    try {
      const OPEN_TRIP_STATUSES: string[] = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'];
      const trip = await prisma.trip.findUnique({ where: { id: entry.tripId } });
      if (trip && OPEN_TRIP_STATUSES.includes(String(trip.status))) {`;

const NEW = `  if (entry.type === 'Return' && (entry.truckReg || entry.driver)) {
    try {
      /*
       * The stamp names the TRUCK and the GUARD-READ DRIVER — GateEntry has no
       * trip column. So the open dispatch is found by the plate on the stamp,
       * falling back to the driver's name: the gate reads both off the windscreen,
       * and either is enough to end the cycle that man and machine are on.
       */
      const OPEN_TRIP_STATUSES: string[] = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'];
      const plate = String(entry.truckReg || '').trim().toUpperCase();
      const plateKey = plate.split(/[\\s/]+/)[0] || '';
      const driverName = String(entry.driver || '').trim().toUpperCase();
      const openTrips = await prisma.trip.findMany({ where: { status: { in: OPEN_TRIP_STATUSES } } });
      const trip = openTrips.find((t: any) => {
        const tr = String(t.truckReg || '').toUpperCase();
        const trKey = tr.split(/[\\s/]+/)[0] || '';
        const tail = String(t.tailNumber || '').toUpperCase();
        if (plate && (tr === plate || tail === plate || (plateKey && trKey === plateKey) || (plateKey && trKey && tr.includes(plateKey)))) {
          return true;
        }
        return Boolean(driverName) && String(t.driverName || '').trim().toUpperCase() === driverName;
      });
      if (trip) {`;

must(src.includes(OLD), "first-pass gate block found");
must(!src.includes("GateEntry has no\n       * trip column"), "correction not already applied");

src = src.replace(OLD, NEW);

// The stamp must be recorded on the entry itself too, for the ledger's sake.
fs.writeFileSync("/tmp/index.patched.ts", src);
const ESBUILD = "/var/www/fleetopsx-api/node_modules/.bin/esbuild";
try {
  execFileSync(ESBUILD, ["/tmp/index.patched.ts", "--outfile=/tmp/index.patched.js"], { stdio: "pipe" });
  console.log("ok: esbuild compiles the patched file");
} catch (e) {
  console.error("FAIL: esbuild rejected the patch — nothing written");
  console.error(String(e.stderr || e.message).split("\n").slice(0, 12).join("\n"));
  process.exit(1);
}

fs.writeFileSync(FILE, src);
console.log("PATCHED " + FILE);
