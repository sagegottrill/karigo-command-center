/** Cleanup: remove every E2E throwaway trip (customer starts with E2E / marker rows). */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.trip.findMany({ where: { OR: [{ customer: { startsWith: 'E2E' } }, { customerConsignee: { startsWith: 'E2E' } }, { customer: { startsWith: 'E2ERB' } }] } });
  for (const r of rows) {
    await p.notification.deleteMany({ where: { refId: r.id } });
    await p.trackingCheckpoint.deleteMany({ where: { tripId: r.id } });
    await p.trip.delete({ where: { id: r.id } });
    console.log('deleted', r.id, '|', r.customer);
  }
  console.log('remaining E2E rows:', await p.trip.count({ where: { OR: [{ customer: { startsWith: 'E2E' } }, { customerConsignee: { startsWith: 'E2E' } }] } }));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
