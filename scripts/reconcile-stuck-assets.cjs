/**
 * Reconcile the return cycle backlog: a truck/tail whose last naming trip is
 * Completed but which still reads Out of Yard / Assigned never got freed when
 * security logged the return (18 trucks completed 8 Oct 14:56 alone).
 *
 * Read-only by default; run with --fix to apply:
 *   node reconcile-stuck-assets.cjs          # dry run: prints what it would do
 *   node reconcile-stuck-assets.cjs --fix    # frees the stuck assets
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FIX = process.argv.includes('--fix');
const key = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
const OPEN = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];

(async () => {
  const open = await prisma.trip.findMany({
    where: { status: { in: OPEN } },
    select: { truckReg: true, tailNumber: true },
  });
  const openKeys = new Set(open.flatMap((t) => {
    const tr = String(t.truckReg || '').toUpperCase();
    const tail = String(t.tailNumber || '').toUpperCase();
    return [tr, ...tr.split(/[\s/]+/), tail, ...tail.split(/[\s/]+/)].map(key).filter((k) => k.length > 1);
  }));

  // Status vocabularies, so the fix writes words the boards already read.
  const truckSpread = {};
  for (const t of await prisma.truck.findMany({ select: { status: true } }))
    truckSpread[t.status] = (truckSpread[t.status] || 0) + 1;
  const tailSpread = {};
  for (const t of await prisma.tail.findMany({ select: { status: true } }))
    tailSpread[t.status] = (tailSpread[t.status] || 0) + 1;
  console.log('truck status spread:', JSON.stringify(truckSpread));
  console.log('tail status spread:', JSON.stringify(tailSpread));

  const trucks = await prisma.truck.findMany({ select: { id: true, cabId: true, registration: true, status: true } });
  let fixedTrucks = 0;
  for (const t of trucks) {
    if (String(t.status) !== 'Out of Yard') continue;
    if ([...openKeys].some((k) => key(t.registration).includes(k) || key(t.cabId) === k)) continue;
    const plate = String(t.registration || '').trim().split(/[\s/]+/)[0];
    const trip = plate
      ? await prisma.trip.findFirst({
          where: { truckReg: { contains: plate } },
          orderBy: { createdAt: 'desc' },
          select: { status: true },
        })
      : null;
    if (!trip || trip.status !== 'Completed') {
      console.log(`SKIP truck ${t.cabId} (${t.registration}) — no Completed trip names it (${trip ? trip.status : 'none'})`);
      continue;
    }
    if (FIX) {
      await prisma.truck.update({ where: { id: t.id }, data: { status: 'Check Up' } });
    }
    fixedTrucks++;
    console.log(`${FIX ? 'FIXED' : 'WOULD FIX'} truck ${t.cabId} (${t.registration}): Out of Yard -> Check Up`);
  }

  const tails = await prisma.tail.findMany({ select: { id: true, number: true, status: true } });
  let fixedTails = 0;
  for (const t of tails) {
    if (!['Out of Yard', 'Assigned'].includes(String(t.status))) continue;
    if (openKeys.has(key(t.number))) continue;
    const num = String(t.number || '').trim();
    const trip = num
      ? await prisma.trip.findFirst({
          where: { tailNumber: { contains: num } },
          orderBy: { createdAt: 'desc' },
          select: { status: true },
        })
      : null;
    if (!trip || trip.status !== 'Completed') {
      console.log(`SKIP tail ${t.number} — no Completed trip names it (${trip ? trip.status : 'none'})`);
      continue;
    }
    if (FIX) {
      await prisma.tail.update({ where: { id: t.id }, data: { status: 'Check Up' } });
    }
    fixedTails++;
    console.log(`${FIX ? 'FIXED' : 'WOULD FIX'} tail ${t.number}: ${t.status} -> Check Up`);
  }

  console.log(`${FIX ? 'fixed' : 'would fix'} ${fixedTrucks} trucks, ${fixedTails} tails`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
