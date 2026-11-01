const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const d = await p.driver.findFirst({ where: { staffId: 'P0831' } });
  console.log('driver P0831 =', JSON.stringify(d && { staffId: d.staffId, name: d.name, status: d.status, truckReg: d.truckReg, truckReg2: d.truckReg2 }));
  const trucks = await p.truck.findMany();
  const t = trucks.filter((x) => /GGE88YK/i.test(`${x.registration || ''} ${x.cabId || ''}`));
  for (const x of t) console.log('truck =', JSON.stringify({ cabId: x.cabId, registration: x.registration, status: x.status }));
  const OPEN = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'];
  const openByDriver = await p.trip.findMany({ where: { status: { in: OPEN }, driverName: { contains: 'bashiru yahaya', mode: 'insensitive' } } });
  console.log('open trips naming Bashiru Yahaya:', openByDriver.length);
  for (const x of openByDriver) console.log(' -', x.id, x.status, x.driverName, x.truckReg);
  const openByTruck = await p.trip.findMany({ where: { status: { in: OPEN }, truckReg: { contains: 'GGE88YK' } } });
  console.log('open trips on GGE88YK:', openByTruck.length);
  for (const x of openByTruck) console.log(' -', x.id, x.status, x.driverName, x.truckReg);
  // recent requests awaiting dispatch decision
  const recent = await p.trip.findMany({ where: { OR: [{ status: 'Requested' }, { status: 'Awaiting Approval' }] }, orderBy: { createdAt: 'desc' }, take: 10 });
  console.log('recent Requested/Awaiting-Approval:');
  for (const x of recent) console.log(' -', x.id, x.status, '|', x.driverName, '|', x.truckReg, '| created:', x.createdAt && x.createdAt.toISOString());
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
