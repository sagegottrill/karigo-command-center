/** Probe: partner-visible trips stuck at Seen (Awaiting Approval/Approved) with vehicles assigned + physical departure signs. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const trips = await p.trip.findMany({
    where: { status: { in: ['Awaiting Approval', 'Approved', 'Approved for Dispatch'] } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, status: true, truckReg: true, driverName: true, customer: true, startTime: true, gateOutBy: true, dispatchedAt: true, updatedAt: true },
  });
  console.log('## Partner-facing "Seen" trips:', trips.length);
  for (const t of trips.slice(0, 20)) {
    const departed = Boolean(String(t.startTime || '').trim() || String(t.gateOutBy || '').trim());
    console.log(' ', t.updatedAt.toISOString().slice(5, 16), '|', t.id.slice(-5), '|', t.status, '| reg:', t.truckReg || '—', '| drv:', t.driverName || '—', '| departed:', departed, '|', t.customer);
  }
  // Partner companies with trips currently in transit (for contrast)
  const moving = await p.trip.findMany({
    where: { status: { in: ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } },
    select: { id: true, customer: true, truckReg: true, status: true },
    take: 50,
  });
  console.log('\n## Moving trips (render "In transit"):', moving.length);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
