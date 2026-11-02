// Post-E2E hygiene: no throwaway accounts or lifecycle trips may remain.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const [users, trips] = await Promise.all([
    p.user.count({ where: { email: { contains: 'livecheck.io' } } }),
    p.trip.count({ where: { OR: [{ driverName: { contains: 'E2E-LC-' } }, { driverName: { contains: 'livecheck' } }] } }),
  ]);
  console.log(`e2e_users_left=${users} e2e_trips_left=${trips}`);
  const ok = users === 0 && trips === 0;
  console.log(ok ? 'LEFTOVER: none' : 'LEFTOVER: WARNING — rerun cleanup');
  await p.$disconnect();
  process.exit(ok ? 0 : 1);
})();
