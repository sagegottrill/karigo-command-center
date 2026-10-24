const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const users = await p.user.findMany({
    where: { OR: [{ name: { contains: 'ecurity' } }, { email: { contains: 'gate@petroline' } }] },
  });
  console.log('security-ish accounts:');
  for (const u of users) {
    console.log(u.email, '|', u.name, '| roles:', JSON.stringify(u.roles), '| created:', u.createdAt, '| updated:', u.updatedAt);
  }

  const recent = await p.trip.findMany({
    where: { OR: [{ gateInBy: { contains: 'Petroline' } }, { gateOutBy: { contains: 'Petroline' } }] },
    orderBy: { updatedAt: 'desc' },
    take: 10,
    select: { id: true, gateInBy: true, gateOutBy: true, status: true, updatedAt: true, createdAt: true },
  });
  console.log('--- recent trips stamped Petroline*:');
  for (const t of recent) console.log(t.gateInBy, '|', t.gateOutBy, '|', t.status, '| upd:', t.updatedAt, '| created:', t.createdAt);

  const stamps = await p.trip.findMany({
    orderBy: { updatedAt: 'desc' },
    where: { updatedAt: { gte: new Date('2026-10-22T00:00:00Z') } },
    take: 40,
    select: { gateInBy: true, gateOutBy: true, status: true, updatedAt: true },
  });
  console.log('--- last 40 updated trips stamps (Oct 22+):');
  for (const t of stamps) console.log(t.status, '| in:', t.gateInBy, '| out:', t.gateOutBy, '|', t.updatedAt);

  const logs = await p.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 15, select: { action: true, user: true, createdAt: true } });
  console.log('--- last audit rows:');
  for (const l of logs) console.log(l.createdAt, '|', l.user, '|', l.action);

  const trs = await p.$queryRawUnsafe('SELECT "gateInBy", count(*)::int AS n FROM "Trip" WHERE "gateInBy" IS NOT NULL AND "updatedAt" > now() - interval \'3 days\' GROUP BY 1 ORDER BY n DESC LIMIT 12');
  console.log('--- stamp counts, last 3 days (gateInBy):');
  for (const r of trs) console.log(r.n, '|', r.gateInBy);

  const outs = await p.$queryRawUnsafe('SELECT "gateOutBy", count(*)::int AS n FROM "Trip" WHERE "gateOutBy" IS NOT NULL AND "updatedAt" > now() - interval \'3 days\' GROUP BY 1 ORDER BY n DESC LIMIT 12');
  console.log('--- stamp counts, last 3 days (gateOutBy):');
  for (const r of outs) console.log(r.n, '|', r.gateOutBy);

  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
