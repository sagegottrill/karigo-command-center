/** Tracking users + recent Petroline-filed trips: did Tracking's raises land in the approval lifecycle? */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const trackers = await prisma.user.findMany({
    where: { OR: [{ role: { contains: 'Tracking' } }, { roles: { contains: 'Tracking' } }] },
    select: { email: true, name: true, role: true, roles: true },
    take: 8,
  });
  console.log('tracking users:', JSON.stringify(trackers, null, 1));

  const recent = await prisma.trip.findMany({
    where: { customer: 'Petroline' },
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: { id: true, status: true, createdAt: true, customerConsignee: true },
  });
  console.log('recent Petroline-filed trips:');
  for (const r of recent) {
    console.log(`  ${String(r.id).slice(-6)} ${r.status} | ${r.customerConsignee || '-'} | ${r.createdAt?.toISOString?.().slice(0, 16)}`);
  }

  // Any Requested trips at all, newest first — TM's approval queue live view.
  const reqd = await prisma.trip.count({ where: { status: 'Requested' } });
  console.log('trips awaiting approval (status Requested):', reqd);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
