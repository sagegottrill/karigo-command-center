const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const d = await p.driver.findFirst({ where: { staffId: 'P0960' } });
  console.log('driver=', JSON.stringify(d && { staffId: d.staffId, name: d.name, status: d.status, truckReg: d.truckReg, truckReg2: d.truckReg2 }));
  const disps = await p.trip.findMany({
    where: { status: { notIn: ['Completed', 'Cancelled'] }, driverName: { contains: 'abdullahi', mode: 'insensitive' } },
    orderBy: { startTime: 'desc' }, take: 15,
  });
  console.log('open-by-driverName count=', disps.length);
  for (const d0 of disps) console.log([d0.id, d0.status, d0.driverName, d0.plateNumber, d0.startTime, d0.returnedAt || ''].join(' | '));
  const all = await p.trip.findMany({ where: { driverName: { contains: 'abdullahi', mode: 'insensitive' } }, orderBy: { startTime: 'desc' }, take: 12 });
  console.log('recent any-status:');
  for (const x of all) console.log([x.id, x.status, x.driverName, x.plateNumber, x.startTime, x.returnedAt || ''].join(' | '));
  // Also check trucks and HR employee row
  const emp = await p.employee ? null : null;
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
