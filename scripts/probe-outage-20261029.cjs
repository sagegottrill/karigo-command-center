/** READ-ONLY probe: TM approval blocked + auto-return + gate roles, 29 Oct. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const MOVING = ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
const OPEN = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];

(async () => {
  // 1. The blocking dispatch from the screenshot.
  const blocked = await p.trip.findMany({
    where: { OR: [{ id: { contains: '8C11D' } }, { id: { contains: '8c11d' } }] },
  });
  console.log('## DIS-8C11D rows:', blocked.length);
  for (const t of blocked) {
    console.log(JSON.stringify({
      id: t.id, status: t.status, truckReg: t.truckReg, tail: t.tailNumber,
      driver: t.driverName, customer: t.customer, dropoff: t.dropoff,
      createdAt: t.createdAt, updatedAt: t.updatedAt, dispatchedAt: t.dispatchedAt,
      startTime: t.startTime, eta: t.eta, gateOutBy: t.gateOutBy, gateInBy: t.gateInBy,
    }, null, 1));
  }

  // 2. Every open dispatch right now.
  const open = await p.trip.findMany({
    where: { status: { in: OPEN } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, status: true, truckReg: true, tailNumber: true, driverName: true, updatedAt: true, createdAt: true },
  });
  console.log('\n## OPEN dispatches:', open.length);
  for (const t of open) console.log(' ', t.id, '|', t.status, '|', t.truckReg, '|', t.tailNumber, '|', t.driverName, '| upd', t.updatedAt);

  // 3. The truck register rows for the clashing truck tokens.
  const trucks = await p.truck.findMany({
    select: { id: true, cabId: true, registration: true, status: true, updatedAt: true },
  });
  const tok = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const hits = trucks.filter((t) => [t.cabId, t.registration].some((v) => ['RJA343XA', 'B013'].includes(tok(v))));
  console.log('\n## Truck rows matching RJA343XA / B013:');
  for (const t of hits) console.log(' ', t.cabId, '|', t.registration, '|', t.status, '| upd', t.updatedAt);

  // 4. Gate entries for those trucks, most recent 15 overall for context.
  const gates = await p.gateEntry.findMany({ orderBy: { timestamp: 'desc' }, take: 20 });
  console.log('\n## Last 20 gate entries:');
  for (const g of gates) console.log(' ', g.type, '|', g.truckReg, '|', g.timestamp, '|', g.loggedBy || '');

  // 5. Last 25 trip status-ish writes (updatedAt desc across all trips).
  const recent = await p.trip.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 25,
    select: { id: true, status: true, truckReg: true, driverName: true, updatedAt: true, gateInBy: true },
  });
  console.log('\n## 25 most recently touched trips:');
  for (const t of recent) console.log(' ', t.updatedAt, '|', t.id, '|', t.status, '|', t.truckReg, '|', t.driverName, '| inBy:', t.gateInBy);

  // 6. Audit log, last 3 hours — everything, to see System writes and human attempts.
  const since = new Date(Date.now() - 3 * 3600 * 1000);
  const audits = await p.auditLog.findMany({ where: { timestamp: { gte: since } }, orderBy: { timestamp: 'desc' }, take: 60 });
  console.log('\n## Audit log (3h):', audits.length);
  for (const a of audits) console.log(' ', a.timestamp, '|', a.user, '|', a.module, '|', a.action, '|', String(a.record).slice(0, 110));

  // 7. Security/gate accounts and their roles (the buttons question).
  const users = await p.user.findMany({
    where: { OR: [{ role: { contains: 'ecurity' } }, { role: { contains: 'Gate' } }, { roles: { contains: 'ecurity' } }, { roles: { contains: 'Gate' } }] },
    select: { id: true, name: true, email: true, role: true, roles: true, status: true },
  });
  console.log('\n## Security-ish accounts:');
  for (const u of users) console.log(' ', u.name, '|', u.email, '| role:', u.role, '| roles:', u.roles, '|', u.status);

  // 8. Login reports today.
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const logins = await p.loginReport.findMany({ where: { timestamp: { gte: dayStart } }, orderBy: { timestamp: 'desc' }, take: 40 });
  console.log('\n## Logins today:', logins.length);
  for (const l of logins) console.log(' ', l.timestamp, '|', l.name, '|', l.role, '|', l.status, '|', l.device || '', l.ip || '');

  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
