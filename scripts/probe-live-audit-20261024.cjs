const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const logs = await p.auditLog.findMany({
      where: { timestamp: { gte: new Date('2026-10-23T00:00:00Z') } },
      orderBy: { timestamp: 'desc' },
      take: 120,
      select: { timestamp: true, user: true, module: true, action: true, record: true },
    });
    console.log('--- AuditLog last 120 since Oct 23:');
    for (const l of logs) console.log(l.timestamp, '|', JSON.stringify(l.user), '|', l.module, '|', l.action);
    await p.$disconnect();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
