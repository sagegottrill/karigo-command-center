/**
 * RECONCILE-STUCK-TRUCKS (end-to-end flow, one-time)
 *
 * Evidence rule (read-only unless --apply): a truck still 'Out of Yard' whose
 * LAST naming dispatch is Completed — and which NO open dispatch names — is a
 * leftover of the historical bare completions; it belongs on Check Up, exactly
 * where the proper gate flow would have put it.
 *
 *   node reconcile-stuck-trucks.cjs          # dry run
 *   node reconcile-stuck-trucks.cjs --apply  # do it
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const OPEN = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'];
const key = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

(async () => {
  const open = await prisma.trip.findMany({ where: { status: { in: OPEN } }, select: { truckReg: true, tailNumber: true } });
  const openKeys = new Set();
  for (const t of open) {
    for (const v of [t.truckReg, t.tailNumber]) {
      for (const tok of String(v || '').split(/[\s/]+/)) {
        if (key(tok).length > 2) openKeys.add(key(tok));
      }
    }
  }
  const trucks = await prisma.truck.findMany({ select: { id: true, cabId: true, registration: true, status: true } });
  let moved = 0;
  for (const tr of trucks) {
    if (String(tr.status) !== 'Out of Yard') continue;
    const own = [key(tr.registration), key(tr.cabId)].filter((k) => k.length > 2);
    const namedOpen = own.some((o) => openKeys.has(o)) || [...openKeys].some((k) => own.some((o) => o === k));
    if (namedOpen) continue;
    // The truck's last naming dispatch decides: Completed => it came home.
    const last = await prisma.trip.findFirst({
      where: {
        OR: own.map((o) => ({ truckReg: { contains: o } })),
      },
      orderBy: { createdAt: 'desc' },
      select: { status: true },
    });
    if (!last || last.status !== 'Completed') {
      console.log(`  SKIP truck ${tr.cabId} (${tr.registration}) — last naming dispatch: ${last ? last.status : 'none'}`);
      continue;
    }
    console.log(`${APPLY ? 'moved' : 'WOULD move'} truck ${tr.cabId} (${tr.registration}): Out of Yard -> Check Up`);
    moved++;
    if (APPLY) await prisma.truck.update({ where: { id: tr.id }, data: { status: 'Check Up' } });
  }
  console.log(`${APPLY ? 'moved' : 'would move'} ${moved} trucks to Check Up.`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
