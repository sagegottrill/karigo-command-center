const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const spread = await prisma.fuelRequest.groupBy({ by: ['status'], _count: true });
  console.log('FuelRequest spread:', JSON.stringify(spread));
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);
  const poured = await prisma.fuelRequest.findMany({
    where: { status: 'Dispensed', dispensedAt: { gte: startOfDay } },
    select: { fuelType: true, quantity: true, amount: true, dispensedAt: true },
  });
  let dL = 0, dC = 0, gK = 0, gC = 0;
  for (const p of poured) {
    if (p.fuelType === 'Diesel') { dL += p.quantity; dC += p.amount ?? 0; }
    else if (p.fuelType === 'Gas') { gK += p.quantity; gC += p.amount ?? 0; }
  }
  console.log(`today (UTC): pours=${poured.length} | Diesel ${dL}L (₦${dC}) | Gas ${gK}KG (₦${gC})`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
