/**
 * Backfill (run ON the server AFTER `npx prisma db push`):
 * every trip already past dispatch (Scheduled and beyond) gets
 * dispatchedAt = updatedAt (the best recorded dispatch moment).
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const DISPATCHED_STATUSES = ["Scheduled", "En Route", "Loaded", "Offloading", "Returning", "Completed"];

(async () => {
  const trips = await prisma.trip.findMany({
    where: { dispatchedAt: null, status: { in: DISPATCHED_STATUSES } },
  });
  for (const t of trips) {
    await prisma.trip.update({ where: { id: t.id }, data: { dispatchedAt: t.updatedAt } });
  }
  console.log("backfilled dispatchedAt for", trips.length, "trips");
  await prisma.$disconnect();
})().catch((e) => {
  console.error("BACKFILL FAILED:", e.message);
  process.exit(1);
});
