// One-off purge: hard-remove every account still flagged Deleted, plus its
// sign-in reports, so those addresses are free again.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const ghosts = await p.user.findMany({ where: { status: 'Deleted' }, select: { id: true, email: true, name: true, role: true } });
  console.log('ghosts found:', ghosts.length);
  for (const g of ghosts) console.log('  -', g.email, '|', g.name, '|', g.role, '|', g.id);
  if (ghosts.length) {
    const ids = ghosts.map(g => g.id);
    const reports = await p.loginReport.deleteMany({ where: { userId: { in: ids } } });
    const users = await p.user.deleteMany({ where: { id: { in: ids } } });
    console.log('deleted user rows:', users.count, '| login reports:', reports.count);
  }
  const left = await p.user.count({ where: { status: 'Deleted' } });
  const total = await p.user.count();
  console.log('remaining Deleted rows:', left, '| total users now:', total);
  await p.$disconnect();
})().catch(async (e) => { console.error('PURGE FAILED:', e.message); await p.$disconnect(); process.exit(1); });
