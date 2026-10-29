/** One-off cleanup: remove the E2E guard-check throwaway trip. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const t = await p.trip.findMany({ where: { customer: 'E2E Guard Check' } });
  for (const r of t) {
    await p.notification.deleteMany({ where: { refId: r.id } });
    await p.trackingCheckpoint.deleteMany({ where: { tripId: r.id } });
    await p.trip.delete({ where: { id: r.id } });
    console.log('deleted throwaway', r.id);
  }
  console.log('remaining:', await p.trip.count({ where: { customer: 'E2E Guard Check' } }));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
