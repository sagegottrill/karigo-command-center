const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const acts = await p.auditLog.findMany({
      where: { user: { contains: 'Petroline Security' } },
      orderBy: { timestamp: 'desc' },
      take: 10,
      select: { timestamp: true, user: true, action: true, module: true },
    });
    console.log('--- audit rows by user "Petroline Security" (last 10):');
    for (const a of acts) console.log(a.timestamp, '|', a.action, '|', a.module);
    if (!acts.length) console.log('(none — the account has done nothing in the audit trail)');

    const trips = await p.trip.findMany({
      where: { OR: [{ gateInBy: 'Petroline Security' }, { gateOutBy: 'Petroline Security' }] },
      orderBy: { updatedAt: 'desc' },
      take: 5,
      select: { updatedAt: true, gateInBy: true, gateOutBy: true, status: true },
    });
    console.log('--- most recent trips stamped literally "Petroline Security":');
    for (const t of trips) console.log(t.updatedAt, '|', t.gateOutBy, '|', t.gateInBy, '|', t.status);
    await p.$disconnect();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
