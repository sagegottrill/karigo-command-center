const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const spread = await prisma.lubricantDisbursal.groupBy({ by: ['status'], _count: true });
  console.log('disbursal status spread:', JSON.stringify(spread));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
