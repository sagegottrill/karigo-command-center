/**
 * Undo the notification-deletion verification (run ON the Hetzner box).
 *
 * The test dismissed a few of the TM's real notifications and created two probe
 * rows. This clears every per-user dismissal (the pre-test state was none) and
 * deletes the probes, so the TM's center is exactly as it was.
 */
const { PrismaClient } = require("@prisma/client");

(async () => {
  const prisma = new PrismaClient();
  const rowsBefore = await prisma.notification.count();
  const withDismissals = await prisma.notification.count({ where: { NOT: { dismissedBy: { equals: [] } } } });
  await prisma.$executeRawUnsafe('UPDATE "Notification" SET "dismissedBy" = ARRAY[]::TEXT[]');
  const probes = await prisma.notification.deleteMany({ where: { title: { startsWith: "ZZ Delete Probe" } } });
  console.log(
    JSON.stringify({
      rowsBefore,
      rowsWithDismissals: withDismissals,
      probesDeleted: probes.count,
      rowsAfter: await prisma.notification.count(),
    }),
  );
  await prisma.$disconnect();
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
