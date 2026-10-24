const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const lr = await p.loginReport.findMany({ orderBy: { timestamp: 'desc' }, take: 25 });
    console.log('--- LoginReport last 25:');
    for (const l of lr) console.log(l.timestamp, '|', JSON.stringify(l.user), '|', l.action || '', l.device || '');

    // Trips that moved Awaiting Approval -> Approved/Scheduled today: who paid for the change?
    const rows = await p.$queryRawUnsafe(
      "SELECT \"gateInBy\",\"gateOutBy\",count(*)::int AS n FROM \"Trip\" " +
      "WHERE \"directCosts\"->>'approvedAt' IS NOT NULL AND \"updatedAt\" > now() - interval '1 day' GROUP BY 1,2 ORDER BY n DESC LIMIT 10"
    ).catch(() => null);
    if (rows) console.log('--- approval-fingerprints (directCosts.approvedAt), last day:', JSON.stringify(rows));
    await p.$disconnect();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
