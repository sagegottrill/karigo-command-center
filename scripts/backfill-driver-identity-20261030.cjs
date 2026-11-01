/* One-off backfill (30 Oct 2026): stamp Trip.driverId/driverStaffId on open
 * dispatches whose typed driverName matches EXACTLY ONE roster driver
 * (case-insensitive). Shared names are left unbound — no identity guesswork. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const OPEN = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
(async () => {
  const trips = await p.trip.findMany({
    where: { status: { in: OPEN }, OR: [{ driverId: null }, { driverId: '' }] },
    select: { id: true, driverName: true },
  });
  const drivers = await p.driver.findMany({ select: { id: true, staffId: true, name: true } });
  let bound = 0, skippedShared = 0, skippedUnknown = 0;
  const detail = [];
  for (const t of trips) {
    const name = String(t.driverName || '').trim();
    if (!name || name === 'Unassigned') { skippedUnknown++; continue; }
    const matches = drivers.filter((d) => String(d.name || '').trim().toLowerCase() === name.toLowerCase());
    if (matches.length === 1) {
      await p.trip.update({
        where: { id: t.id },
        data: { driverId: matches[0].id, driverStaffId: matches[0].staffId },
      });
      bound++;
      detail.push([t.id, name, matches[0].staffId]);
    } else if (matches.length === 0) {
      skippedUnknown++;
      detail.push([t.id, name, '(no roster match — left unbound)']);
    } else {
      skippedShared++;
      detail.push([t.id, name, '(shared name — left unbound)']);
    }
  }
  console.log(`open trips scanned: ${trips.length}, bound: ${bound}, shared-name left: ${skippedShared}, unmatched left: ${skippedUnknown}`);
  for (const d of detail) console.log(' -', d.join(' | '));
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
