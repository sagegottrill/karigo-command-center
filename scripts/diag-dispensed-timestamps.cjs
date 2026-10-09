const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.fuelRequest.findMany({
    where: { status: 'Dispensed' },
    orderBy: { dispensedAt: 'desc' },
    take: 8,
    select: { reference: true, fuelType: true, quantity: true, amount: true, dispensedAt: true, createdAt: true },
  });
  for (const r of rows) {
    console.log(
      `${r.reference} ${r.fuelType} ${r.quantity} ₦${r.amount} | dispensedAt: ${r.dispensedAt?.toISOString?.() ?? r.dispensedAt} | createdAt: ${r.createdAt?.toISOString?.() ?? r.createdAt}`,
    );
  }
  console.log('now:', new Date().toISOString());
  console.log('host TZ:', process.env.TZ || 'unset');
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
