const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const TRUCK_KEY = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
function truckKeysOf(trip) {
  const out = new Set();
  for (const v of [trip && trip.truckReg, trip && trip.tailNumber]) {
    const whole = TRUCK_KEY(v);
    if (whole.length > 3) out.add(whole);
    for (const token of String(v || '').split(/[^0-9a-zA-Z]+/)) {
      const k = TRUCK_KEY(token);
      if (k && k.length > 3) out.add(k);
    }
  }
  return Array.from(out);
}
(async () => {
  const t = await p.trip.findUnique({ where: { id: '50cf874d-97d3-4993-9807-2b375b650ac4' } });
  console.log('trip 50cf874d —', JSON.stringify({ created: t.createdAt && t.createdAt.toISOString(), updated: t.updatedAt && t.updatedAt.toISOString(), status: t.status, driver: t.driverName, reg: t.truckReg, tail: t.tailNumber, customer: t.customer, cargo: t.cargo, pickup: t.pickup, dropoff: t.dropoff }));
  // simulate ASSET-BUSY-AT-ASSIGNMENT with data.truckReg = "GGE88YK", tailNumber = "B016"
  const regHeadToken = TRUCK_KEY('GGE88YK');
  const tailToken = TRUCK_KEY('B016');
  const trucks = await p.truck.findMany();
  const headRow = trucks.find((x) => TRUCK_KEY(x.cabId) === regHeadToken || TRUCK_KEY(x.registration) === regHeadToken);
  const tails = await p.tail.findMany();
  const tailRow = tails.find((x) => TRUCK_KEY(x.number) === tailToken);
  console.log('headRow =', headRow && { cabId: headRow.cabId, status: headRow.status }, ' tailRow =', tailRow && { number: tailRow.number, status: tailRow.status });
  const openSibs = await p.trip.findMany({ where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } }, select: { id: true, truckReg: true, driverName: true, tailNumber: true } });
  const held = openSibs.filter((s) => (headRow && truckKeysOf(s).includes(TRUCK_KEY(headRow.cabId))) || (tailRow && truckKeysOf(s).includes(tailToken)));
  console.log('blocking open dispatches (head GGE88YK or tail B016):', held.length);
  for (const s of held) console.log('  -', s.id, s.status, s.driverName, s.truckReg, 'tail:', s.tailNumber);
  // Who else holds B054?
  const b054 = openSibs.filter((s) => truckKeysOf(s).includes(TRUCK_KEY('B054')));
  console.log('open dispatches on B054:', b054.length);
  for (const s of b054) console.log('  -', s.id, s.status, s.driverName, s.truckReg, 'tail:', s.tailNumber);
  // How many open dispatches does Bashiru Yahaya carry?
  const byName = openSibs.filter((s) => /bashiru/i.test(String(s.driverName || '')));
  console.log('open dispatches naming any Bashiru:', byName.length);
  for (const s of byName) console.log('  -', s.id, s.status, s.driverName, s.truckReg, 'tail:', s.tailNumber);
  // Any ACTIVE gate-relevant order in the queue the user could be confirming?
  const q = await p.trip.findMany({ where: { status: { in: ['Requested', 'Awaiting Approval'] } }, orderBy: { createdAt: 'desc' }, take: 6 });
  console.log('queue items:', q.length);
  for (const s of q) console.log('  -', s.id, s.status, s.customer, s.createdAt && s.createdAt.toISOString());
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
