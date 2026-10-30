/** CLEANUP: remove all E2E-SUP throwaways + their audit rows. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.trip.findMany({ where: { customer: { startsWith: 'E2E Sup' } } });
  for (const r of rows) {
    await p.notification.deleteMany({ where: { refId: r.id } });
    await p.auditLog.deleteMany({ where: { record: r.id } });
    await p.trackingCheckpoint.deleteMany({ where: { tripId: r.id } });
    await p.trip.delete({ where: { id: r.id } });
    console.log('deleted', r.id.slice(-5), '|', r.status);
  }
  console.log('remaining:', await p.trip.count({ where: { customer: { startsWith: 'E2E Sup' } } }));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
