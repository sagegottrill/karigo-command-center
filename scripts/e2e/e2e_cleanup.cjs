/**
 * Final cleanup after E2E: removes E2E accounts, E2E trips/checkpoints/gate rows,
 * notifications and login reports (pure run noise), then prints final state.
 * Run from the API directory on the VPS (needs @prisma/client).
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const E2E_EMAILS = [
  'e2e.admin@livecheck.io', 'e2e.tm@livecheck.io', 'e2e.fo@livecheck.io',
  'e2e.gate@livecheck.io', 'e2e.tracking@livecheck.io', 'e2e.hr@livecheck.io',
  'e2e.accounts@livecheck.io', 'e2e.partner@livecheck.io', 'e2e.staff@livecheck.io',
];

async function main() {
  const trips = await p.trip.findMany({ where: { OR: [{ customerConsignee: { startsWith: 'LIVECHECK ' } }, { customerConsignee: { startsWith: 'E2E ' } }] }, select: { id: true } });
  const ids = trips.map(t => t.id);
  const cps = await p.trackingCheckpoint.deleteMany({ where: { tripId: { in: ids } } });
  const delTrips = await p.trip.deleteMany({ where: { id: { in: ids } } });
  const strayTails = await p.tail.deleteMany({ where: { number: { startsWith: 'LIVEB' } } });
  const gate = await p.gateEntry.deleteMany({ where: { OR: [{ purpose: { contains: 'LIVECHECK' } }, { purpose: { contains: 'E2E' } }, { driver: { startsWith: 'E2E ' } }] } });
  const users = await p.user.deleteMany({ where: { email: { in: E2E_EMAILS } } });
  const notifs = await p.notification.deleteMany({});
  const logins = await p.loginReport.deleteMany({});

  console.log(JSON.stringify({ e2eUsers: users.count, trips: delTrips.count, checkpoints: cps.count, gate: gate.count, strayTails: strayTails.count, notifications: notifs.count, loginReports: logins.count }));

  const remain = {
    users: await p.user.count(),
    e2eRemaining: await p.user.count({ where: { email: { contains: 'livecheck.io' } } }),
    trips: await p.trip.count(),
    drivers: await p.driver.count(),
    trucks: await p.truck.count(),
    tails: await p.tail.count(),
    tenants: await p.tenant.count(),
    notifications: await p.notification.count(),
    checkpoints: await p.trackingCheckpoint.count(),
    gateEntries: await p.gateEntry.count(),
    loginReports: await p.loginReport.count(),
  };
  console.log('FINAL:', JSON.stringify(remain));
  await p.$disconnect();
}

main().catch(e => { console.error('E2E CLEANUP FAILED:', e.message); process.exit(1); });
