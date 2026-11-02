const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const drivers = await p.driver.findMany({ select: { id: true, name: true, status: true, staffId: true } });
  const byName = new Map();
  for (const d of drivers) {
    const k = (d.name || '').trim().toLowerCase();
    if (!k) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(d);
  }
  const dups = [...byName.entries()].filter(([, rows]) => rows.length > 1);
  console.log('roster rows:', drivers.length, '| duplicated names:', dups.length);
  const HOLDING = ['Awaiting Approval', 'Approved', 'Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
  for (const [k, rows] of dups) {
    const open = await p.trip.count({ where: { OR: rows.map(r => ({ driverName: { equals: rows[0].name, mode: 'insensitive' } })), status: { in: HOLDING } } });
    console.log(`- "${rows[0].name}" ×${rows.length} (${rows.map(r => r.staffId).join(', ')}) | open dispatches naming them: ${open}`);
  }
  // how the freeing rule would behave today: any open dispatch on a shared name
  const risky = [];
  for (const [k, rows] of dups) {
    const holding = await p.trip.findMany({
      where: { driverName: { equals: rows[0].name, mode: 'insensitive' }, status: { in: HOLDING } },
      select: { id: true, status: true, driverStaffId: true, driverName: true },
    });
    // count how many DISTINCT roster rows of this name currently hold status On Trip — a completion frees by name
    const onTrip = rows.filter(r => r.status === 'On Trip').length;
    if (onTrip > 0 && holding.length > 0) risky.push({ name: rows[0].name, onTrip, open: holding.length });
  }
  console.log('frees-by-name collisions waiting (both rows On Trip + open dispatch on shared name):', risky.length);
  for (const r of risky) console.log(' !', JSON.stringify(r));
})().then(() => p.$disconnect());
