/** Diagnose the "wrong" approval error: what does the QA trip actually hold vs DIS-60CD8? */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const tok = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

(async () => {
  // 1. The trip the TM is approving.
  const trips = await p.trip.findMany({
    where: { OR: [{ driverName: { contains: 'QA Driver 2' } }, { driverName: { contains: 'QA Driver' } }] },
    orderBy: { updatedAt: 'desc' },
    take: 6,
    select: { id: true, status: true, truckReg: true, tailNumber: true, tailType: true, driverName: true, customer: true, updatedAt: true }
  });
  console.log('## QA-driver trips:');
  for (const t of trips) console.log(' ', t.updatedAt.toISOString().slice(5, 16), '|', t.id.slice(-5), '|', t.status, '| reg:', JSON.stringify(t.truckReg), '| tail:', JSON.stringify(t.tailNumber), '| drv:', t.driverName, '|', t.customer);

  // 2. The blocking dispatch DIS-60CD8.
  const d = await p.trip.findMany({ where: { id: { endsWith: '60CD8' } }, select: { id: true, status: true, truckReg: true, tailNumber: true, driverName: true } });
  console.log('\n## DIS-60CD8:');
  for (const t of d) console.log(' ', t.id, '|', t.status, '| reg:', JSON.stringify(t.truckReg), '| tail:', JSON.stringify(t.tailNumber), '| drv:', t.driverName);

  // 3. The registry rows behind the QA trucks.
  const trucks = await p.truck.findMany();
  const relevant = trucks.filter((t) => ['TESTABC123', 'ABCGRA67', 'ABCGRA78', 'TESABCDE', 'TEST234'].includes(tok(t.cabId)) || ['TESTABC123', 'ABCGRA67', 'ABCGRA78', 'TESABCDE', 'TEST234'].includes(tok(t.registration)));
  console.log('\n## Registry rows (QA trucks):');
  for (const t of relevant) console.log(' ', t.id.slice(-6), '| cab:', t.cabId, '| reg:', t.registration, '| status:', t.status);

  // 4. Replay the approval guard for the newest QA trip.
  const pending = trips.find((t) => ['Awaiting Approval', 'Approved'].includes(t.status));
  if (pending) {
    const keysOf = (t) => {
      const out = new Set();
      for (const v of [t.truckReg, t.tailNumber]) {
        const w = tok(v); if (w && w.length > 2) out.add(w);
        for (const piece of String(v || '').split(/[^0-9a-zA-Z]+/)) { const k = tok(piece); if (k && k.length > 2) out.add(k); }
      }
      return [...out];
    };
    const own = keysOf(pending);
    console.log('\n## Pending trip', pending.id.slice(-5), 'keys:', own.join(', '));
    const open = await p.trip.findMany({
      where: { id: { not: pending.id }, status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } },
      select: { id: true, truckReg: true, tailNumber: true, driverName: true, status: true },
    });
    for (const o of open) {
      const k = keysOf(o);
      const hit = k.filter((x) => own.includes(x));
      if (hit.length) console.log('  CLASH with', o.id.slice(-5), o.status, JSON.stringify(o.truckReg), '| shared keys:', hit.join(', '));
    }
  }
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
