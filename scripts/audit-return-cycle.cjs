/**
 * Live audit of the return cycle: find every record a return SHOULD have
 * freed but did not — drivers On Trip with no open dispatch, trucks Out of
 * Yard with no open dispatch, tails Assigned/Out of Yard with none.
 *
 * Read-only. Run on the host:  node audit-return-cycle.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const key = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

(async () => {
  const open = await prisma.trip.findMany({
    where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } },
    select: { id: true, driverName: true, truckReg: true, tailNumber: true },
  });
  const openNames = new Set(open.map((t) => String(t.driverName || '').trim().toLowerCase()).filter(Boolean));
  const openKeys = new Set(open.flatMap((t) => {
    const tr = String(t.truckReg || '').toUpperCase();
    const tail = String(t.tailNumber || '').toUpperCase();
    return [tr, ...tr.split(/[\s/]+/), tail, ...tail.split(/[\s/]+/)].map(key).filter((k) => k.length > 1);
  }));

  // 1. Drivers marked On Trip whose name no open dispatch carries
  const drivers = await prisma.driver.findMany({ select: { id: true, name: true, status: true, truckReg: true, truckReg2: true } });
  const stuckDrivers = drivers.filter(
    (d) => String(d.status) === 'On Trip' && !openNames.has(String(d.name || '').trim().toLowerCase()),
  );
  console.log(`open dispatches: ${open.length}`);
  console.log(`drivers On Trip: ${drivers.filter((d) => String(d.status) === 'On Trip').length} | On Trip with NO open dispatch: ${stuckDrivers.length}`);
  stuckDrivers.forEach((d) => console.log(`  STUCK DRIVER: ${d.name} | truckReg: ${d.truckReg} | truckReg2: ${d.truckReg2}`));

  // 2. Trucks Out of Yard that no open dispatch names
  const trucks = await prisma.truck.findMany({ select: { id: true, cabId: true, registration: true, status: true } });
  const stuckTrucks = trucks.filter(
    (t) => String(t.status) === 'Out of Yard' &&
      ![...openKeys].some((k) => key(t.registration).includes(k) || key(t.cabId) === k),
  );
  console.log(`trucks Out of Yard: ${trucks.filter((t) => String(t.status) === 'Out of Yard').length} | with NO open dispatch: ${stuckTrucks.length}`);
  stuckTrucks.forEach((t) => console.log(`  STUCK TRUCK: ${t.cabId} | ${t.registration}`));

  // 3. Tails Assigned/Out of Yard that no open dispatch names
  const tails = await prisma.tail.findMany({ select: { id: true, number: true, status: true } });
  const stuckTails = tails.filter(
    (t) => ['Out of Yard', 'Assigned'].includes(String(t.status)) && !openKeys.has(key(t.number)),
  );
  console.log(`tails Out of Yard/Assigned: ${tails.filter((t) => ['Out of Yard', 'Assigned'].includes(String(t.status))).length} | with NO open dispatch: ${stuckTails.length}`);
  stuckTails.forEach((t) => console.log(`  STUCK TAIL: ${t.number} | ${t.status}`));

  // 4. Spread, for context
  const spread = {};
  for (const d of drivers) spread[d.status] = (spread[d.status] || 0) + 1;
  console.log('driver status spread:', JSON.stringify(spread));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
