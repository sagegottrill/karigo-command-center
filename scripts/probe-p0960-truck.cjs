const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const trucks = await p.truck.findMany();
  const hit = trucks.filter((t) => /JHN506XA|B1002/i.test(`${t.cabId || ''} ${t.registration || ''}`));
  for (const t of hit) {
    const slim = {};
    for (const k of Object.keys(t)) slim[k] = t[k];
    console.log('TRUCK =', JSON.stringify(slim, null, 1));
  }
  // Any open trips on JHN506XA / B1002 from ALL drivers (who else runs this truck)
  const openOnTruck = await p.trip.findMany({
    where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'] }, truckRegistryTokenSeemsIrrelevant: undefined },
  }).catch(() => null);
  const openByReg = await p.trip.findMany({
    where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'] }, OR: [{ truckReg: { contains: 'JHN506XA' } }, { truckReg: { contains: 'B1002' } }] },
    orderBy: { startTime: 'desc' }, take: 12,
  }).catch((e) => { console.error('trip query err', e.message); return []; });
  console.log('open trips on JHN506XA/B1002:', openByReg.length);
  for (const t of openByReg) console.log(' -', t.id, t.status, '| driver:', t.driverName, '| start:', t.startTime, '| dispatchedAt:', t.dispatchedAt && t.dispatchedAt.toISOString && t.dispatchedAt.toISOString());
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
