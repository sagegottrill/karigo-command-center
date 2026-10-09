/**
 * For the stuck trucks, pull the trip that names the plate and see whether it
 * is closed (Completed/Returned) — the return that never freed the asset.
 * Read-only evidence for the backlog fix.
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

  const trucks = await prisma.truck.findMany({ select: { id: true, cabId: true, registration: true, status: true, updatedAt: true } });
  const stuck = trucks.filter(
    (t) => String(t.status) === 'Out of Yard' &&
      ![...openKeys].some((k) => key(t.registration).includes(k) || key(t.cabId) === k),
  );

  console.log(`stuck trucks: ${stuck.length}`);
  for (const t of stuck) {
    const reg = String(t.registration || '').trim();
    const plate = reg.split(/[\s/]+/)[0];
    const trip = plate
      ? await prisma.trip.findFirst({
          where: { truckReg: { contains: plate } },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, driverName: true, updatedAt: true },
        })
      : null;
    console.log(
      `${t.cabId} | ${reg} | lastTrip: ${trip ? `${String(trip.id).slice(-6)} ${trip.status} drv=${trip.driverName || '-'} upd=${trip.updatedAt?.toISOString?.().slice(0, 16)}` : 'NONE'}`,
    );
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
