/**
 * RECONCILE-STALE-RETURNING (driver-duty fix, one-time)
 *
 * Closes only the trips with hard evidence they are over:
 *   - status `Returning` (the truck was already headed home) and older than 14 days, OR
 *   - truck is physically home (Check Up / Maintenance / Accident) while the trip is still open.
 *
 * Every closure stamps gateInBy honestly ('Reconciled <date> — stale returning
 * dispatch'), never as Security, and afterwards frees roster drivers the same
 * way the API does: by exact name OR registered truck identity, never touching
 * Suspended/Off Duty/Deleted rows.
 *
 *   node reconcile-stale-returning.cjs          # dry run: what WOULD change
 *   node reconcile-stale-returning.cjs --apply  # do it
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const OPEN = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
const HOME = ['Check Up', 'Maintenance', 'Accident'];
const key = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

(async () => {
  const cutoff = new Date(Date.now() - 14 * 864e5);
  const open = await prisma.trip.findMany({
    where: { status: { in: OPEN } },
    select: { id: true, driverName: true, truckReg: true, tailNumber: true, status: true, createdAt: true, gateInBy: true, eta: true },
  });
  const trucks = await prisma.truck.findMany({ select: { cabId: true, registration: true, status: true } });
  const truckHome = new Set(trucks.filter((t) => HOME.includes(String(t.status))).map((t) => key(t.registration)));
  const truckByCab = new Map(trucks.map((t) => [key(t.cabId), t]));

  const stale = open.filter((t) => {
    const plate = key(String(t.truckReg || '').split(/[\s/]+/)[0]);
    const isHome = truckHome.has(plate) || (truckByCab.has(plate) && HOME.includes(String(truckByCab.get(plate).status)));
    return (t.status === 'Returning' && t.createdAt < cutoff) || (isHome && ['Returning', 'Delayed'].includes(t.status));
  });
  console.log(`open trips: ${open.length} | stale-evidence closures: ${stale.length} ${APPLY ? '(APPLYING)' : '(dry run)'}`);
  for (const t of stale) {
    console.log(`  would close ${t.status} ${t.truckReg} | ${t.driverName || '-'} | created ${t.createdAt.toISOString().slice(0, 10)}`);
  }

  if (APPLY && stale.length) {
    const stamp = 'Reconciled ' + new Date().toISOString().slice(0, 10) + ' — stale returning dispatch';
    const nowStamp = new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    let closedCount = 0;
    for (const t of stale) {
      await prisma.trip.update({
        where: { id: t.id },
        data: {
          status: 'Completed',
          // return-stamp-on-gate-return parity: eta carries the readable return
          // time; never wipe an eta that already exists.
          eta: t.eta && String(t.eta).trim() ? t.eta : nowStamp,
          gateInBy: t.gateInBy && String(t.gateInBy).trim() ? t.gateInBy : stamp,
        },
      });
      closedCount++;
    }
    // Free drivers afterwards, with the API's own identities: exact name OR
    // registered truck, never a fragment, never over an HR-protected status.
    const drivers = await prisma.driver.findMany({ select: { id: true, name: true, status: true, truckReg: true, truckReg2: true } });
    const remaining = await prisma.trip.findMany({
      where: { status: { in: OPEN } },
      select: { driverName: true, truckReg: true, tailNumber: true },
    });
    const headKeyOf = (v) => key(String(v || '').split(/[\s/]+/)[0]) || null;
    let freed = 0;
    for (const d of drivers) {
      if (!['On Trip', 'Active'].includes(String(d.status))) continue;
      const nameKey = String(d.name || '').trim().toLowerCase();
      const ownTrucks = [d.truckReg, d.truckReg2].map(headKeyOf).filter(Boolean);
      const stillOn = remaining.some((t) => {
        if (String(t.driverName || '').trim().toLowerCase() === nameKey) return true;
        const headKey = headKeyOf(t.truckReg);
        const tailKey = headKeyOf(t.tailNumber);
        return ownTrucks.includes(headKey) || ownTrucks.includes(tailKey);
      });
      if (!stillOn && String(d.status) === 'On Trip') {
        await prisma.driver.update({ where: { id: d.id }, data: { status: 'Active' } });
        console.log('  freed driver:', d.name);
        freed++;
      }
    }
    console.log(`closed ${closedCount} dispatches, freed ${freed} drivers.`);
  } else if (!APPLY) {
    console.log('dry run only — rerun with --apply to write.');
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
