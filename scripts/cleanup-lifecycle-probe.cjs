/** Remove the lifecycle probe trips (customerConsignee like 'Lifecycle Probe') from the live DB. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const found = await prisma.trip.findMany({
    where: { customerConsignee: { contains: 'Lifecycle Probe' } },
    select: { id: true, status: true, customer: true },
  });
  console.log('probe trips found:', found.length, JSON.stringify(found));
  for (const t of found) {
    await prisma.trip.delete({ where: { id: t.id } });
    console.log('deleted', String(t.id).slice(-6));
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
