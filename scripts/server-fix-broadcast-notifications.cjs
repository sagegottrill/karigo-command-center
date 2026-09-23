/**
 * Data fix: a row with no `audience` is broadcast to EVERY user, partner
 * companies included. "New Internal Request" was created that way, so a partner
 * portal showed Petroline's own request in its bell — internal meant nothing.
 *
 * Anything internal-but-broadcast is scoped to staff here; genuinely company-wide
 * rows (a platform notice) are left alone and listed so the choice is visible.
 *
 * Run ON the box from /var/www/fleetopsx-api.
 */
const { PrismaClient } = require("@prisma/client");

const INTERNAL_TITLES = ["New Internal Request", "New Asset Added", "Asset Status Changed"];

(async () => {
  const prisma = new PrismaClient();

  const before = await prisma.$queryRawUnsafe(
    `SELECT id, title, body FROM "Notification" WHERE "audience" IS NULL ORDER BY "createdAt" DESC`,
  );
  console.log(`broadcast rows: ${before.length}`);
  for (const row of before.slice(0, 10)) {
    console.log(`  · ${row.title} — ${String(row.body).slice(0, 70)}`);
  }

  for (const title of INTERNAL_TITLES) {
    const { count } = await prisma.notification.updateMany({
      where: { title, audience: null },
      data: { audience: "Transport Manager,Fleet Operations,Platform Admin" },
    });
    console.log(`ok: ${count} × "${title}" scoped to staff`);
  }

  const remaining = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*)::int AS n FROM "Notification" WHERE "audience" IS NULL`,
  );
  console.log(`broadcast rows left: ${JSON.stringify(remaining)}`);
  await prisma.$disconnect();
})();
