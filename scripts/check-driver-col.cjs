const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.$queryRaw`select "driverId", "driverStaffId" from "Trip" limit 1`;
  console.log('raw query ok:', JSON.stringify(rows));
  // and the generated client knows the field:
  const any = await p.trip.findFirst({ select: { driverId: true, driverStaffId: true, driverName: true } });
  console.log('client field ok:', JSON.stringify(any));
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message.slice(0, 300)); process.exit(1); });
