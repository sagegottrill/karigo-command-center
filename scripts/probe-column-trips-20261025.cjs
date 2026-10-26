const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const auto = await p.trip.findMany({
      where: {
        OR: [
          { gateInBy: { contains: 'System' } },
          { gateInBy: { contains: 'Reconciled' } },
          { gateInBy: { contains: 'Auto' } },
          { gateOutBy: { contains: 'System' } },
          { gateOutBy: { contains: 'Reconciled' } },
          { gateOutBy: { contains: 'Auto' } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: { updatedAt: true, gateInBy: true, gateOutBy: true, status: true, truckReg: true, driverName: true, createdAt: true },
    });
    console.log('--- most recent AUTO-stamped trips:');
    for (const t of auto) console.log(t.updatedAt, '|', t.gateOutBy, '|', t.gateInBy, '|', t.status, '|', t.truckReg, '|', t.driverName, '| created:', t.createdAt);

    // Trips completed in the last 24h and what stamped them
    const recent = await p.trip.findMany({
      where: { updatedAt: { gte: new Date('2026-10-24T09:00:00Z') } },
      orderBy: { updatedAt: 'desc' },
      take: 60,
      select: { updatedAt: true, status: true, gateInBy: true, gateOutBy: true, truckReg: true },
    });
    console.log('--- trips updated since Oct 24 09:00 UTC (last stage stamps):');
    for (const t of recent) console.log(t.updatedAt, '|', t.status, '|out:', t.gateOutBy, '|in:', t.gateInBy, '|', t.truckReg);
    await p.$disconnect();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
