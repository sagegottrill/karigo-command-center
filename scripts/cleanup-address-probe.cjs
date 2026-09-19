/**
 * Remove the throwaway partner + requests created while verifying the optional
 * destination address (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * Everything it touches carries the "ZZ Address Probe" / "ZZ No Address" marker,
 * so it can only ever delete that verification data.
 */
const { PrismaClient } = require("@prisma/client");

const MARKERS = ["ZZ Address Probe", "ZZ No Address"];

(async () => {
  const prisma = new PrismaClient();
  const hit = (value) => MARKERS.some((m) => JSON.stringify(value).includes(m));

  const trips = (await prisma.trip.findMany({})).filter(hit);
  for (const trip of trips) await prisma.trip.delete({ where: { id: trip.id } });
  console.log(`deleted trips: ${trips.length}`);

  const notifications = (await prisma.notification.findMany({})).filter(hit);
  for (const n of notifications) await prisma.notification.delete({ where: { id: n.id } });
  console.log(`deleted notifications: ${notifications.length}`);

  const users = (await prisma.user.findMany({})).filter(hit);
  for (const u of users) await prisma.user.delete({ where: { id: u.id } });
  console.log(`deleted users: ${users.length}`);

  console.log(
    "remaining:",
    JSON.stringify({
      users: await prisma.user.count(),
      trips: await prisma.trip.count(),
      notifications: await prisma.notification.count(),
    }),
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
