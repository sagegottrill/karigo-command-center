/** Check: do partner "Seen" requests have later sibling trips for the same company+route? */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const seen = await p.trip.findMany({
    where: { status: { in: ['Awaiting Approval', 'Approved'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, status: true, customer: true, dropoff: true, createdAt: true },
  });
  const moving = await p.trip.findMany({
    where: { status: { in: ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Scheduled'] } },
    select: { id: true, customer: true, dropoff: true, createdAt: true, status: true, truckReg: true },
  });
  let hits = 0;
  for (const s of seen) {
    const sib = moving.filter(
      (m) =>
        m.customer === s.customer &&
        (m.dropoff || '').toLowerCase().includes((s.dropoff || '').toLowerCase().slice(0, 5)) &&
        new Date(m.createdAt) > new Date(s.createdAt),
    );
    if (sib.length) {
      hits++;
      console.log('SEEN', s.id.slice(-5), '|', s.customer, '->', s.dropoff, '(' + s.createdAt.toISOString().slice(5, 10) + ') sibling:', sib.map((x) => x.id.slice(-5) + '/' + x.status + '/' + x.truckReg).join(' | '));
    }
  }
  console.log('sibling pairs:', hits, 'of', seen.length, 'seen trips');
  const byC = {};
  for (const m of moving) byC[m.customer] = (byC[m.customer] || 0) + 1;
  console.log('moving loads by customer:', JSON.stringify(byC));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
