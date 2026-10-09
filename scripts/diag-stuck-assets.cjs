/**
 * For each truck flagged STUCK (Out of Yard, no open dispatch): was there a
 * recent trip that has since closed (Returned) whose return never flipped the
 * asset? Prints last trip per stuck truck so the backlog can be fixed from
 * evidence, not guesswork. Read-only.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const key = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

(async () => {
  const open = await prisma.trip.findMany({
    where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } },
    select: { id: true, truckReg: true, tailNumber: true },
  });
  const openKeys = new Set(open.flatMap((t) => {
    const tr = String(t.truckReg || '').toUpperCase();
    const tail = String(t.tailNumber || '').toUpperCase();
    return [tr, ...tr.split(/[\s/]+/), tail, ...tail.split(/[\s/]+/)].map(key).filter((k) => k.length > 1);
  }));

  const trucks = await prisma.truck.findMany({ select: { id: true, cabId: true, registration: true, status: true } });
  const stuck = trucks.filter(
    (t) => String(t.status) === 'Out of Yard' &&
      ![...openKeys].some((k) => key(t.registration).includes(k) || key(t.cabId) === k),
  );

  console.log(`stuck trucks: ${stuck.length}`);
  for (const t of stuck) {
    const reg = String(t.registration || '').trim();
    const trips = await prisma.trip.findMany({
      where: {
        OR: [
          { truckReg: { contains: reg } },
          reg ? { truckReg: { contains: reg.split(/[\s/]+/)[0] } } : undefined,
        ].filter(Boolean),
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
      select: { id: true, status: true, truckReg: true, driverName: true, updatedAt: true, returnedAt: true },
    }).catch(() => []);
    const last = trips[0];
    console.log(
      `${t.cabId} | ${reg} | lastTrip: ${last ? `${String(last.id).slice(-6)} ${last.status} ret=${last.returnedAt ? 'yes' : 'no'} upd=${last.updatedAt?.toISOString?.().slice(0, 16)}` : 'none'}`,
    );
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
