const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    // The rows the client screenshotted read "AAA395YP", "AAA392YP" (plate only)
    // where siblings read "P083 (FST567YL)". Find the trips behind them.
    const trips = await p.trip.findMany({
      where: { truckReg: { contains: 'AAA' } },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, truckReg: true, status: true, createdAt: true, customerConsignee: true, tailType: true, requestedTruckType: true },
    });
    console.log('--- trips naming an AAA* truck:', trips.length);
    for (const t of trips) console.log(t.truckReg, '|', t.status, '|', t.customerConsignee, '|', t.createdAt, '| type:', t.requestedTruckType);

    const tr = await p.$queryRawUnsafe(
      `SELECT "truckReg", count(*)::int AS n FROM "Trip" WHERE "truckReg" IS NOT NULL GROUP BY 1 ORDER BY n DESC LIMIT 8`
    );
    console.log('--- most-used truckReg values:', JSON.stringify(tr).slice(0, 800));

    // trucks named with an AAA/plate-only registration?
    const t2 = await p.$queryRawUnsafe(
      `SELECT "cabId","registration",status,"createdAt" FROM "Truck" WHERE "registration" ~* 'AAA' LIMIT 20`
    );
    console.log('--- trucks with AAA-ish registration:', JSON.stringify(t2, null, 0).slice(0, 900));
    await p.$disconnect();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
