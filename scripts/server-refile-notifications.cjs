/**
 * Data fix: the historic rows were filed by a text classifier, which put 198
 * Tracking checkpoints under Gate Security (the body says "checkpoint") and 72
 * partner requests under Fleet Operations (the body says "Flatbed Tail").
 *
 * A title is a far better source than a body — these families are unambiguous —
 * so the ones that matter are re-filed by title. Nothing is deleted.
 *
 * Run ON the box from /var/www/fleetopsx-api.
 */
const { PrismaClient } = require("@prisma/client");

const BY_TITLE = [
  { title: "New Location has been Logged", module: "Tracking" },
  { title: "Truck Departed", module: "Gate Security" },
  { title: "New Staff Account", module: "HR & Personnel" },
  { title: "New Staff Onboarded", module: "HR & Personnel" },
  { title: "Diesel allocation authorized", module: "Fuel & Lubricant" },
  { title: "Diesel authorization withdrawn", module: "Fuel & Lubricant" },
  { title: "New Delivery Request", module: "Partners" },
  { title: "Diesel Restocked", module: "Fuel & Lubricant" },
  { title: "Successful diesel disbursal", module: "Fuel & Lubricant" },
];

(async () => {
  const prisma = new PrismaClient();
  for (const rule of BY_TITLE) {
    const { count } = await prisma.notification.updateMany({
      where: { title: rule.title, NOT: { module: rule.module } },
      data: { module: rule.module },
    });
    console.log(`ok: ${count} × "${rule.title}" → ${rule.module}`);
  }

  const byModule = await prisma.$queryRawUnsafe(
    `SELECT COALESCE("module", '(unfiled)') AS module, COUNT(*)::int AS n FROM "Notification" GROUP BY 1 ORDER BY n DESC`,
  );
  console.log("modules now:", JSON.stringify(byModule));
  await prisma.$disconnect();
})();
