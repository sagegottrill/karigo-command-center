/**
 * Server patch: the yard keeps itself true, and a truck can always come home.
 *
 * Two holes, one fix.
 *
 * 1. THE REGISTRY WAS TYPED BY HAND. A truck's "Out of Yard" / "Check Up" was
 *    whatever someone last set, so the yard count and the dispatch list could
 *    tell different stories. It is now a CONSEQUENCE of movement: a truck that
 *    leaves the gate is out, a truck whose return is logged goes to Check Up for
 *    engineering. Nobody types it again.
 *
 * 2. A TRUCK WITH NO DISPATCH COULD NEVER COME HOME. 37 trucks are physically
 *    out of the yard with no dispatch naming them (they left before the app
 *    went live), and the gate's return works on a dispatch — so there was
 *    nothing to log and they stayed out forever. `POST /api/gate/return` takes
 *    the truck the guard is looking at: it closes any open dispatch that names
 *    it (freeing the driver), logs the movement, and sets the truck to Check Up.
 */
const fs = require('fs');

const FILE = '/var/www/fleetopsx-api/index.ts';
let src = fs.readFileSync(FILE, 'utf8');

if (src.includes('coupleTruckRegistry')) {
  console.log('Yard coupling already present — nothing to do.');
  process.exit(0);
}

const HELPERS = `
// ---- The yard keeps itself true -------------------------------------------
//
// A truck's movement state is not an opinion someone types; it follows the
// dispatch. These helpers match a truck's own numbers (cap, plate) against the
// ones a dispatch carries — Trip.truckReg holds them TOGETHER, as
// "P062 (GGE98YK)", which is why matching is by containment rather than equality.
const TRUCK_KEY = (v: any) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

function truckKeysOf(trip: any): string[] {
  return [trip?.truckReg, trip?.tailNumber]
    .map((v) => TRUCK_KEY(v))
    .filter((k: string) => k.length > 2);
}

function truckMatches(truck: any, keys: string[]): boolean {
  const own = [TRUCK_KEY(truck?.registration), TRUCK_KEY(truck?.cabId)].filter((k) => k.length > 2);
  return own.some((o) => keys.some((k) => k.includes(o) || o.includes(k)));
}

/**
 * Move the trucks a dispatch names to the state the movement implies.
 * "out" = it has left the yard; "home" = it has come back to engineering.
 * Engineering's own verdicts (Maintenance, Accident) are never overwritten by
 * a movement; everything else follows the yard.
 */
async function coupleTruckRegistry(trip: any, movement: 'out' | 'home'): Promise<number> {
  try {
    const keys = truckKeysOf(trip);
    if (!keys.length) return 0;
    const trucks = await prisma.truck.findMany();
    const named = trucks.filter((t) => truckMatches(t, keys));
    let moved = 0;
    for (const truck of named) {
      const current = String(truck.status || '');
      if (movement === 'out') {
        if (current === 'Out of Yard') continue;
        await prisma.truck.update({ where: { id: truck.id }, data: { status: 'Out of Yard' } });
        moved += 1;
      } else {
        if (current === 'Check Up' || current === 'Maintenance' || current === 'Accident') continue;
        await prisma.truck.update({ where: { id: truck.id }, data: { status: 'Check Up' } });
        moved += 1;
      }
    }
    return moved;
  } catch (e: any) {
    console.error('[yard] couple failed:', e?.message || e);
    return 0;
  }
}

// ---- A truck comes home, dispatch or not -----------------------------------
app.post('/api/gate/return', authenticate, authorize('Security', 'Platform Admin', 'Transport Manager'), async (req: any, res) => {
  const raw = String(req.body?.truck || req.body?.plate || '').trim();
  if (!raw) return res.status(400).json({ error: 'truck (cap number or plate) is required' });
  const actor = (req as any).user?.name || (req as any).user?.email || 'Security';
  const stamp = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  try {
    const key = TRUCK_KEY(raw);
    const trucks = await prisma.truck.findMany();
    const truck = trucks.find((t) => truckMatches(t, [key])) || null;

    // Any dispatch still naming this truck is over — the truck is at the gate.
    const open = await prisma.trip.findMany({
      where: {
        status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] },
      },
    });
    const stillOpen = open.filter((t) => truckMatches(truck || { registration: raw, cabId: raw }, truckKeysOf(t)) || truckKeysOf(t).includes(key));

    let closed = 0;
    const freed: string[] = [];
    for (const trip of stillOpen) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: { status: 'Completed', eta: trip.eta || stamp, gateInBy: actor },
      });
      closed += 1;
      if (trip.driverName && trip.driverName !== 'Unassigned') {
        await prisma.driver.updateMany({
          where: { name: trip.driverName, status: 'On Trip' },
          data: { status: 'Active' },
        });
        freed.push(trip.driverName);
      }
    }

    // The truck itself goes to engineering, exactly as a returned truck should.
    if (truck && !['Check Up', 'Maintenance', 'Accident'].includes(String(truck.status))) {
      await prisma.truck.update({ where: { id: truck.id }, data: { status: 'Check Up' } });
    }

    try {
      await notify('Security', 'Truck returned',
        (truck ? truck.cabId + ' (' + truck.registration + ')' : raw) + ' was logged back into the yard by ' + actor +
          (closed ? '. ' + closed + ' open dispatch' + (closed === 1 ? '' : 'es') + ' closed with it.' : '.'),
        'success', 'Transport Manager,Security,Fleet Operations,Engineering',
        { module: 'Gate Security', eventKey: 'gate.truck_returned' });
    } catch (_) { /* the movement stands even if the alert fails */ }

    res.json({
      ok: true,
      truck: truck ? { id: truck.id, capId: truck.cabId, registration: truck.registration, status: 'Check Up' } : null,
      dispatchClosed: closed,
      driversFreed: freed,
      stamp,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
`;

// Anchor: just before the GET /api/gate route.
const ANCHOR = "app.get('/api/gate', authenticate, async (_req, res) => {";
if (!src.includes(ANCHOR)) {
  console.error('Anchor (GET /api/gate) not found — aborting without writing.');
  process.exit(1);
}
src = src.replace(ANCHOR, HELPERS.trimStart() + '\n' + ANCHOR);

// Anchor 2: the trip PATCH, right after the return-frees-driver block.
const RELEASE_MARK = "if ((raw.gateInBy !== undefined || data.gateInBy !== undefined) && String(trip.status) === 'Completed' && trip.driverName) {";
if (!src.includes(RELEASE_MARK)) {
  console.error('Anchor (driver release in PATCH /api/trips) not found — helpers written, coupling not. Re-run after fixing.');
  fs.writeFileSync(FILE, src);
  process.exit(1);
}
const COUPLING = `/* A MOVEMENT MOVES THE TRUCK. Leaving the gate puts it out of the yard; a
     * logged return sends it to engineering. Nobody types this again. */
    const movingHome = String(trip.status) === 'Completed' && (raw.eta !== undefined || raw.gateInBy !== undefined);
    const movingOut =
      ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'].includes(String(trip.status)) &&
      (raw.startTime !== undefined || raw.gateOutBy !== undefined);
    if (movingHome) void coupleTruckRegistry(trip, 'home');
    else if (movingOut) void coupleTruckRegistry(trip, 'out');
    ${RELEASE_MARK}`;
src = src.replace(RELEASE_MARK, COUPLING);

fs.writeFileSync(FILE, src);
console.log('Applied: yard coupling + POST /api/gate/return (truck-level return).');
