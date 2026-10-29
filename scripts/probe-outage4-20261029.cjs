/** READ-ONLY probe 4: registry flips today — is anything auto-returning trucks/tails? */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const dayStart = new Date('2026-10-29T00:00:00Z');
  const trucks = await p.truck.findMany({ where: { updatedAt: { gte: dayStart } }, orderBy: { updatedAt: 'desc' } });
  console.log('## Trucks touched today:', trucks.length);
  for (const t of trucks.slice(0, 25)) console.log(' ', t.updatedAt.toISOString().slice(5, 19), '|', t.cabId, '|', t.registration, '|', t.status);
  const tails = await p.tail.findMany({ where: { updatedAt: { gte: dayStart } }, orderBy: { updatedAt: 'desc' } });
  console.log('\n## Tails touched today:', tails.length);
  for (const t of tails.slice(0, 30)) console.log(' ', t.updatedAt.toISOString().slice(5, 19), '|', t.number, '|', t.status);

  // Notifications about asset status changes today
  const notes = await p.notification.findMany({
    where: { createdAt: { gte: dayStart }, title: { contains: 'Asset' } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  console.log('\n## Asset notifications today:', notes.length);
  for (const n of notes.slice(0, 20)) console.log(' ', n.createdAt.toISOString().slice(5, 19), '|', n.title, '|', String(n.body).slice(0, 100));

  // Any trips that changed status today to Completed/Returning — with WHO closed them
  const done = await p.trip.findMany({
    where: { status: { in: ['Completed', 'Returning', 'Stopped'] }, updatedAt: { gte: dayStart } },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, status: true, truckReg: true, driverName: true, updatedAt: true, gateInBy: true },
  });
  console.log('\n## Trips closed/returning today:', done.length);
  for (const t of done) console.log(' ', t.updatedAt.toISOString().slice(5, 19), '|', t.id.slice(-5), '|', t.status, '|', t.truckReg, '|', t.driverName, '| inBy:', t.gateInBy);

  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
