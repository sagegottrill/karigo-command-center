/** READ-ONLY probe 2: the blocked approval, tail B013, audit around today. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // 1. The Awaiting Approval trip the TM could not approve.
  const t = await p.trip.findUnique({ where: { id: '8d095452-1d50-4fa4-8eaf-5736830fa6d0' } });
  if (t) {
    console.log('## BLOCKED TRIP 8d095452:');
    const { directCosts, ...rest } = t;
    console.log(JSON.stringify(rest, (k, v) => (k === 'password' ? undefined : v), 1).slice(0, 2400));
  }

  // 2. Head GGE93YK and tail B013 registry rows.
  const tok = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const trucks = await p.truck.findMany();
  const head = trucks.filter((x) => [x.cabId, x.registration].some((v) => ['GGE93YK', 'RJA343XA'].includes(tok(v))));
  console.log('\n## Head rows GGE93YK / RJA343XA:');
  for (const h of head) console.log(' ', h.id, '|', h.cabId, '|', h.registration, '|', h.status, '| upd', h.updatedAt);
  const tails = await p.tail.findMany();
  const b013 = tails.filter((x) => ['B013', 'B048'].includes(tok(x.number)));
  console.log('\n## Tail rows B013 / B048:');
  for (const b of b013) console.log(' ', b.id, '|', b.number, '|', b.status, '| upd', b.updatedAt);
  console.log('\n## Tail status counts:');
  const byStatus = {};
  for (const b of tails) byStatus[b.status] = (byStatus[b.status] || 0) + 1;
  console.log(JSON.stringify(byStatus));

  // 3. Audit log today 08:00 -> now, Dispatch module only.
  const dayStart = new Date('2026-10-29T08:00:00Z');
  const audits = await p.auditLog.findMany({ where: { timestamp: { gte: dayStart } }, orderBy: { timestamp: 'asc' }, take: 300 });
  console.log('\n## Audit log today (all):', audits.length);
  for (const a of audits) console.log(' ', a.timestamp, '|', a.user, '|', a.module, '|', a.action, '|', String(a.record).slice(0, 100));

  // 4. Logins today (all) + security accounts.
  const d0 = new Date('2026-10-29T00:00:00Z');
  const logins = await p.loginReport.findMany({ where: { timestamp: { gte: d0 } }, orderBy: { timestamp: 'asc' }, take: 100 });
  console.log('\n## Logins today:', logins.length);
  for (const l of logins) console.log(' ', l.timestamp, '|', l.name, '|', l.role, '|', l.status, '|', l.device || '');

  const users = await p.user.findMany({
    where: { OR: [{ role: { contains: 'ecurity' } }, { role: { contains: 'Gate' } }, { roles: { contains: 'ecurity' } }, { roles: { contains: 'Gate' } }] },
    select: { name: true, email: true, role: true, roles: true, status: true },
  });
  console.log('\n## Security-ish accounts:');
  for (const u of users) console.log(' ', u.name, '|', u.email, '| role:', u.role, '| roles:', u.roles, '|', u.status);

  // 5. How many trucks have >1 open dispatch (the stale pile-up)?
  const open = await p.trip.findMany({
    where: { status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } },
    select: { id: true, truckReg: true, status: true, updatedAt: true },
  });
  const byHead = {};
  for (const tr of open) {
    const headTok = tok(String(tr.truckReg || '').split('/')[0]);
    if (!headTok) continue;
    (byHead[headTok] = byHead[headTok] || []).push(tr);
  }
  const dupes = Object.entries(byHead).filter(([, v]) => v.length > 1);
  console.log('\n## Heads with MULTIPLE open dispatches:', dupes.length);
  for (const [h, v] of dupes) console.log(' ', h, '->', v.map((x) => x.status + ' ' + x.id.slice(-5) + ' (' + x.updatedAt.toISOString().slice(5, 16) + ')').join(' | '));

  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
