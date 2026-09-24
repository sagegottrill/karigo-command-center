/**
 * Server patch: THE GATE'S RETURN STAMP ENDS THE DISPATCH.
 *
 * Why drivers are stranded. Availability is derived from the dispatch list — the
 * right default, because the duty word drifts. But POST /api/gate wrote a
 * GateEntry row and NOTHING ELSE: Security stamped a truck back into the yard,
 * the dispatch stayed 'Returning' for ever, and every one of those drivers was
 * held by a trip that had physically finished. 89 of 95 dispatches are open on
 * the live box; P0841 (Salihu Mohammed) alone carries two 'Returning' trips from
 * 19 and 21 September. He cannot be offered to the fleet desk, and pressing
 * "Available" cannot free him because the dispatch outranks the word.
 *
 * Two changes, both on this server:
 *
 *  1) A Return entry closes the dispatch it names — status Completed, gateInBy
 *     stamped with the guard who logged it — and frees the driver whose cycle
 *     just ended. The one place a trip is provably over is the gate.
 *
 *  2) PATCH /api/drivers/:id takes `closeDispatches` — the Transport Manager's
 *     absolute release. Where the gate never got the stamp, the authority ends
 *     the stale dispatch as Completed at the moment he frees the man, so the
 *     roster and the dispatch list cannot tell two different stories.
 *
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

const GATE_ANCHOR = `app.post('/api/gate', authenticate, async (req, res) => {
  const entry = await prisma.gateEntry.create({ data: req.body });`;

const GATE_REPLACEMENT = `app.post('/api/gate', authenticate, async (req, res) => {
  const entry = await prisma.gateEntry.create({ data: req.body });
  /*
   * CYCLE END. The gate's Return stamp is the one moment a trip is provably
   * over: the truck is physically back in the yard. Nothing used to read it, so
   * dispatches sat in 'Returning' for ever, the tracking board never let them go,
   * and their drivers stayed committed — invisible to the fleet desk and unable
   * to be handed another truck. Closing it here ends the cycle for the truck,
   * the board and the driver at the same instant.
   */
  if (entry.type === 'Return' && entry.tripId) {
    try {
      const OPEN_TRIP_STATUSES: string[] = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'];
      const trip = await prisma.trip.findUnique({ where: { id: entry.tripId } });
      if (trip && OPEN_TRIP_STATUSES.includes(String(trip.status))) {
        const actor = (req as any).user?.name || (req as any).user?.email || 'Security';
        const closed = await prisma.trip.update({
          where: { id: trip.id },
          data: { status: 'Completed', gateInBy: trip.gateInBy || actor },
        });
        // The driver's cycle ends with the truck's. Only 'On Trip' is moved, so
        // a Suspended or Off Duty record is never quietly overwritten.
        if (closed.driverName) {
          await prisma.driver.updateMany({
            where: { name: closed.driverName, status: 'On Trip' },
            data: { status: 'Active' },
          });
        }
        void notify('Gate Security', 'Dispatch Completed', 'Truck ' + closed.truckReg + ' is back in the yard — dispatch ' + dispatchRef(closed.id) + ' closed and the driver freed.', 'info', 'TransportManager,Fleet Operations,Security,Tracking', { module: 'Gate Security', eventKey: 'dispatch.completed', refId: closed.id, refLabel: dispatchRef(closed.id) });
      }
    } catch (e: any) {
      // A failed closure must never lose the gate stamp itself.
      console.error('gate return could not close the dispatch:', e?.message || e);
    }
  }`;

const DRIVER_ANCHOR = `app.patch('/api/drivers/:id', authenticate, async (req, res) => {
  try {
    const b = req.body || {};
    const data: any = {};
    for (const key of DRIVER_FIELDS) {
      if (b[key] !== undefined) data[key] = b[key] === null ? null : String(b[key]).trim();
    }`;

const DRIVER_REPLACEMENT = `app.patch('/api/drivers/:id', authenticate, async (req, res) => {
  try {
    const b = req.body || {};
    const data: any = {};
    for (const key of DRIVER_FIELDS) {
      if (b[key] !== undefined) data[key] = b[key] === null ? null : String(b[key]).trim();
    }
    /*
     * THE TRANSPORT MANAGER'S ABSOLUTE RELEASE (driver-release-patch).
     *
     * Availability comes from the dispatch list, which is the safe default — but
     * it lets a dispatch nobody closed hold a man hostage: he cannot be offered a
     * truck and the duty word cannot free him. closeDispatches ends those stale
     * trips as Completed as he is released, so the roster and the dispatch list
     * tell one story instead of two.
     */
    if (b.closeDispatches) {
      const OPEN_TRIP_STATUSES: string[] = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'];
      const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
      if (driver && driver.name) {
        const actor = (req as any).user?.name || (req as any).user?.email || 'Transport Manager';
        const stuck = await prisma.trip.findMany({
          where: { driverName: driver.name, status: { in: OPEN_TRIP_STATUSES } },
        });
        for (const trip of stuck) {
          await prisma.trip.update({
            where: { id: trip.id },
            data: { status: 'Completed', gateInBy: trip.gateInBy || actor },
          });
        }
        if (stuck.length) {
          void notify('HR & Personnel', 'Driver Released', driver.name + ' was released and ' + stuck.length + ' open dispatch' + (stuck.length === 1 ? '' : 'es') + ' closed with him.', 'warning', 'TransportManager,HR & Personnel,Fleet Operations,Tracking', { module: 'HR & Personnel', eventKey: 'driver.released', refId: driver.id, refLabel: driver.staffId || driver.name });
        }
      }
    }`;

must(src.includes(GATE_ANCHOR), "gate POST anchor found");
must(src.includes(DRIVER_ANCHOR), "driver PATCH anchor found");
must(!src.includes("CYCLE END. The gate's Return stamp"), "gate patch not already applied");
must(!src.includes("driver-release-patch"), "driver patch not already applied");

src = src.replace(GATE_ANCHOR, GATE_REPLACEMENT).replace(DRIVER_ANCHOR, DRIVER_REPLACEMENT);

// Compile before writing: a patch that breaks the API takes the yard down.
fs.writeFileSync("/tmp/index.patched.ts", src);
const ESBUILD = "/var/www/fleetopsx-api/node_modules/.bin/esbuild";
try {
  execFileSync(ESBUILD, ["/tmp/index.patched.ts", "--outfile=/tmp/index.patched.js"], {
    stdio: "pipe",
  });
  console.log("ok: esbuild compiles the patched file");
} catch (e) {
  console.error("FAIL: esbuild rejected the patch — nothing written");
  console.error(String(e.stderr || e.message).split("\n").slice(0, 12).join("\n"));
  process.exit(1);
}

fs.writeFileSync(FILE, src);
console.log("PATCHED " + FILE);
