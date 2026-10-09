/** Internal (Petroline-filed) delivery requests and their lifecycle status — where do Tracking's requests land? */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.trip.findMany({
    where: { customer: 'Petroline' },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { id: true, status: true, customerConsignee: true, cargo: true, dropoff: true, createdAt: true },
  });
  console.log('Petroline-filed trips:', rows.length);
  for (const r of rows) {
    console.log(
      `${String(r.id).slice(-6)} ${r.status} | ${r.customerConsignee || '-'} | ${r.cargo || '-'} | ${r.dropoff || '-'} | ${r.createdAt?.toISOString?.().slice(0, 16)}`,
    );
  }

  const pending = await prisma.trip.findMany({
    where: { status: 'Requested' },
    orderBy: { createdAt: 'desc' },
    take: 12,
    select: { id: true, customer: true, customerConsignee: true, createdAt: true },
  });
  console.log('--- trips with status Requested (awaiting approval):', pending.length);
  for (const r of pending) {
    console.log(
      `${String(r.id).slice(-6)} | ${r.customer} | ${r.customerConsignee || '-'} | ${r.createdAt?.toISOString?.().slice(0, 16)}`,
    );
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
