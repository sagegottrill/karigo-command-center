/**
 * READ-ONLY LIVE AUDIT — how much of the old damage is still in the data?
 * Run on the API host (node audit-live-cycle.cjs). Prints only, changes nothing.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const key = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
const OPEN = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];

(async () => {
  const open = await prisma.trip.findMany({
    where: { status: { in: OPEN.concat(['Stopped']) } },
    select: { id: true, status: true, driverName: true, truckReg: true, tailNumber: true, createdAt: true },
  });
  const spread = {};
  for (const t of open) spread[t.status] = (spread[t.status] || 0) + 1;
  console.log('OPEN TRIP SPREAD:', JSON.stringify(spread));

  const trucks = await prisma.truck.groupBy({ by: ['status'], _count: true });
  console.log('TRUCK SPREAD:', trucks.map((t) => t.status + '=' + t._count).join(', '));
  const tails = await prisma.tail.groupBy({ by: ['status'], _count: true });
  console.log('TAIL SPREAD:', tails.map((t) => t.status + '=' + t._count).join(', '));
  const drivers = await prisma.driver.groupBy({ by: ['status'], _count: true });
  console.log('DRIVER SPREAD:', drivers.map((t) => t.status + '=' + t._count).join(', '));

  // Truck home but on a live open dispatch — the old sweep-victim / gate-miss shape.
  const truckRows = await prisma.truck.findMany({ select: { id: true, cabId: true, registration: true, status: true } });
  const HOME = ['Check Up', 'Maintenance', 'Accident'];
  const homeKeys = new Set();
  for (const t of truckRows) {
    if (HOME.includes(String(t.status))) {
      const k1 = key(t.registration); const k2 = key(t.cabId);
      if (k1.length >= 4) homeKeys.add(k1);
      if (k2.length >= 4) homeKeys.add(k2);
    }
  }
  const stale = open.filter((t) =>
    truckKeysOf(t).some((k) => Array.from(homeKeys).some((h) => (k === h || k.includes(h) || h.includes(k)))));

  function truckKeysOf(trip) {
    return [trip.truckReg, trip.tailNumber]
      .map((v) => key(v))
      .filter((k) => k.length > 2);
  }

  console.log('HOME-TRUCK-WITH-OPEN-DISPATCH (candidates for healing):', stale.length);
  for (const t of stale.slice(0, 25))
    console.log('  ', t.status, '|', t.truckReg || '-', '|', t.driverName || '-', '| created', t.createdAt.toISOString().slice(0, 10));

  const staleReturning = open.filter((t) => t.status === 'Returning' && t.createdAt < new Date(Date.now() - 3 * 864e5));
  console.log('STALE RETURNING (older than 3 days):', staleReturning.length);
  for (const t of staleReturning.slice(0, 25))
    console.log('  ', t.truckReg, '|', t.driverName || '-', '|', t.createdAt.toISOString().slice(0, 10));

  const onTrip = await prisma.driver.count({ where: { status: 'On Trip' } });
  const heldNames = new Set(open.filter((t) => !['Stopped'].includes(t.status)).map((t) => String(t.driverName || '').trim().toLowerCase()).filter(Boolean));
  const orphanDrivers = await prisma.driver.findMany({ where: { status: 'On Trip' }, select: { id: true, name: true, truckReg: true, truckReg2: true } });
  const orphan = orphanDrivers.filter((d) => !heldNames.has(String(d.name || '').trim().toLowerCase()));
  console.log('DRIVERS ON TRIP:', onTrip, '| stranded (no open dispatch names them):', orphan.length);
  for (const d of orphan.slice(0, 15)) console.log('  ', d.name);

  await prisma.$disconnect();
})().catch((e) => { console.error('AUDIT FAILED:', e.message); process.exit(1); });
