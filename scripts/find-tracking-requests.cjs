/** The 6 Pending LubricantDisbursal rows in full: who poured, for which trip, and the review fields. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.lubricantDisbursal.findMany({
    where: { status: 'Pending' },
    orderBy: { createdAt: 'desc' },
  });
  console.log('Pending LubricantDisbursal rows:', rows.length);
  for (const r of rows) {
    const trip = r.tripId ? await prisma.trip.findUnique({ where: { id: r.tripId }, select: { truckReg: true, driverName: true, status: true, customer: true, dropoff: true } }) : null;
    console.log(
      `${r.id.slice(-6)} | ref: ${r.reference || '-'} | type: ${r.fuelType} ${r.quantity} | trip: ${r.tripId ? r.tripId.slice(-6) : '-'} ` +
      `| truck: ${trip?.truckReg || '-'} | driver: ${trip?.driverName || '-'} | customer: ${trip?.customer || '-'} ` +
      `| dispensedBy: ${r.dispensedBy || '-'} | createdAt: ${r.createdAt?.toISOString?.()}`,
    );
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
