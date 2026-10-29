/** Remove the two Oct-7/8 legacy E2E test rows, then verify /api/audit as the TM sees it. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const old = await p.auditLog.findMany({ where: { user: { startsWith: 'E2E ' } } });
  for (const a of old) {
    console.log('deleting legacy test row:', a.timestamp.toISOString().slice(0, 10), '|', a.user, '|', String(a.record).slice(0, 50));
    await p.auditLog.delete({ where: { id: a.id } });
  }
  console.log('legacy rows removed:', old.length);
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
