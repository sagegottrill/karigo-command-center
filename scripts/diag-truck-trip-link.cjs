/** Why do stuck trucks have no matching trip? Check how trips store truckReg and whether a cap-number join exists. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const sample = await prisma.trip.findMany({
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: { truckReg: true, status: true, createdAt: true },
  });
  console.log('sample trip truckReg values:');
  for (const s of sample) console.log(' ', JSON.stringify(s.truckReg), s.status);

  for (const probe of ['GGE109YK', 'P044', 'GGE91YK']) {
    const byReg = await prisma.trip.count({ where: { truckReg: { contains: probe } } });
    console.log(`trips containing "${probe}" in truckReg:`, byReg);
  }

  // Does the truck model have more identifying fields the trip might carry?
  const t = await prisma.truck.findFirst({ where: { cabId: 'P044' } });
  console.log('truck P044 row:', JSON.stringify(t));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
