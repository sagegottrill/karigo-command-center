/** READ-ONLY check: was any real request sent back in the last 20 minutes? */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const since = new Date(Date.now() - 20 * 60 * 1000);
  const hits = await p.trip.findMany({
    where: { updatedAt: { gte: since }, OR: [{ sendBackReason: { contains: 'E2E' } }, { status: 'Approved' }] },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, status: true, truckReg: true, driverName: true, sendBackReason: true, updatedAt: true, customer: true, tailNumber: true },
  });
  console.log('recently updated Approved/E2E rows:', hits.length);
  for (const t of hits) {
    console.log(t.updatedAt.toISOString(), '|', t.id.slice(-5), '|', t.status, '|', t.truckReg, '|', t.driverName, '|', t.customer, '|', String(t.sendBackReason || '').slice(0, 60));
  }
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
