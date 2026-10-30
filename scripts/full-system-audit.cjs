/** FULL LIVE-SYSTEM AUDIT — every invariant a healthy fleet must hold. READ-ONLY. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const tok = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
const keysOf = (t) => {
  const out = new Set();
  for (const v of [t.truckReg, t.tailNumber]) {
    const w = tok(v); if (w.length > 3) out.add(w);
    for (const piece of String(v || '').split(/[^0-9a-zA-Z]+/)) { const k = tok(piece); if (k && k.length > 3) out.add(k); }
  }
  return [...out];
};
const headTok = (v) => tok(String(v || '').split('/')[0]);

(async () => {
  const OPEN = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
  const open = await p.trip.findMany({ where: { status: { in: OPEN } } });

  console.log('=== 1. Open dispatches sharing a HEAD (a rig two loads at once) ===');
  const byHead = {};
  for (const t of open) { const h = headTok(t.truckReg); if (h) (byHead[h] = byHead[h] || []).push(t); }
  const headDupes = Object.entries(byHead).filter(([, v]) => v.length > 1);
  for (const [h, v] of headDupes) console.log(' ', h, '->', v.map((x) => x.id.slice(-5) + '/' + x.status).join(', '));
  console.log('  total:', headDupes.length);

  console.log('\n=== 2. Open dispatches sharing a TAIL (a body two loads at once) ===');
  const byTail = {};
  for (const t of open) { for (const k of keysOf(t)) { if (/^B\d/.test(k) || (t.tailNumber && tok(t.tailNumber) === k)) (byTail[k] = byTail[k] || []).push(t); } }
  const tailDupes = Object.entries(byTail).filter(([, v]) => v.length > 1);
  for (const [k, v] of tailDupes) console.log(' ', k, '->', v.map((x) => x.id.slice(-5) + '/' + x.status).join(', '));
  console.log('  total:', tailDupes.length);

  console.log('\n=== 3. Scheduled/open dispatches with NO truck (empty-approval hole) ===');
  const empty = open.filter((t) => !t.truckReg || /unassigned/i.test(t.truckReg));
  for (const t of empty) console.log(' ', t.id.slice(-5), '|', t.status, '| reg:', JSON.stringify(t.truckReg), '| drv:', t.driverName);
  console.log('  total:', empty.length);

  console.log('\n=== 4. Truck rows Assigned/Out of Yard with NO open dispatch naming them (stranded) ===');
  const trucks = await p.truck.findMany();
  const openKeys = new Set(open.flatMap((t) => keysOf(t)));
  const strandedT = trucks.filter((t) => ['Assigned', 'Out of Yard'].includes(String(t.status)) && !(openKeys.has(tok(t.cabId)) || openKeys.has(tok(t.registration))));
  console.log('  stranded trucks:', strandedT.length, 'of', trucks.filter((t) => ['Assigned', 'Out of Yard'].includes(String(t.status))).length, 'claimed rows');

  console.log('\n=== 5. Tail rows Assigned/Out of Yard with NO open dispatch naming them ===');
  const tails = await p.tail.findMany();
  const strandedTail = tails.filter((t) => ['Assigned', 'Out of Yard'].includes(String(t.status)) && !openKeys.has(tok(t.number)));
  console.log('  stranded tails:', strandedTail.length, 'of', tails.filter((t) => ['Assigned', 'Out of Yard'].includes(String(t.status))).length, 'claimed rows');

  console.log('\n=== 6. Drivers On Trip with no open dispatch holding them (ghosts) ===');
  const drivers = await p.driver.findMany({ where: { status: 'On Trip' } });
  const heldNames = new Set(open.map((t) => String(t.driverName || '').trim().toLowerCase()).filter(Boolean));
  const ghosts = drivers.filter((d) => !heldNames.has(String(d.name || '').trim().toLowerCase()));
  console.log('  ghosts:', ghosts.length, 'of', drivers.length, 'On Trip:', ghosts.map((d) => d.name).slice(0, 10).join(', '));

  console.log('\n=== 7. Awaiting-Approval queue age (rot) ===');
  const pending = await p.trip.findMany({ where: { status: { in: ['Awaiting Approval', 'Approved'] } }, orderBy: { createdAt: 'asc' } });
  const now = Date.now();
  const old = pending.filter((t) => now - new Date(t.createdAt).getTime() > 48 * 3600 * 1000);
  console.log('  pending:', pending.length, '| older than 48h:', old.length, old.slice(0, 6).map((t) => t.id.slice(-5) + '/' + t.createdAt.toISOString().slice(5, 10)).join(', '));

  console.log('\n=== 8. Fuel desk could pour for un-approved trips? ===');
  const deskLeak = await p.trip.findMany({ where: { status: { in: ['Awaiting Approval', 'Approved', 'Requested'] }, NOT: [{ status: 'Requested' }] }, select: { id: true, status: true } });
  console.log('  (informational — pour endpoint refuses; list now filtered) unapproved with allocations exist:', deskLeak.length);

  console.log('\n=== 9. Open dispatches whose head is in the yard per the registry (board disagreement) ===');
  const disagreement = open.filter((t) => {
    const h = headTok(t.truckReg);
    if (!h) return false;
    const row = trucks.find((x) => tok(x.cabId) === h || tok(x.registration) === h);
    return row && ['Available', 'Check Up'].includes(String(row.status));
  });
  for (const t of disagreement.slice(0, 8)) console.log(' ', t.id.slice(-5), '|', t.status, '|', t.truckReg, '| registry says:', (() => { const h = headTok(t.truckReg); const row = trucks.find((x) => tok(x.cabId) === h || tok(x.registration) === h); return row ? row.status : '?'; })());
  console.log('  total:', disagreement.length);

  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
