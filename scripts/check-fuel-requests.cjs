/** Dump recent FuelRequisition rows (the /api/fuel table) — where are the tracking people's requests? */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.fuelRequisition.findMany({
    orderBy: { createdAt: 'desc' },
    take: 12,
  });
  console.log('FuelRequisition rows:', rows.length);
  rows.forEach((r) => console.log(
    `${r.id.slice(-6)} | truck: ${r.truckReg} | driver: ${r.driverName} | litres: ${r.requiredLitres} (approved: ${r.approvedLitres ?? '-'}) | status: ${r.status} | created: ${r.createdAt?.toISOString?.() || r.createdAt}`,
  ));
  const spread = await prisma.fuelRequisition.groupBy({ by: ['status'], _count: true });
  console.log('status spread:', JSON.stringify(spread));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
