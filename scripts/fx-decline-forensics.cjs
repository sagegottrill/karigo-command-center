/**
 * Forensics: has any declined request been revived into a live status?
 *
 * Reads the notification log (which records every "Request Declined" event) and
 * compares it with the trip's CURRENT status. A trip with a decline notice that
 * now reads En Route / Scheduled / Loaded was declined and then written back to
 * life by a later action — the exact defect behind "Declined is still showing In
 * transit".
 *
 * Read-only. Run ON the Hetzner box:  node fx-decline-forensics.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const LIVE = ["Scheduled", "Loaded", "En Route", "Offloading", "Returning", "Delayed", "Completed", "Approved", "Awaiting Approval", "Requested", "Draft"];

(async () => {
  const notices = await prisma.notification.findMany({
    where: { title: { contains: "Declined" } },
    orderBy: { createdAt: "asc" },
  });
  const declines = notices
    .map((n) => {
      const m = String(n.message || "").match(/Dispatch\s+([0-9a-f]{8})\s+was declined/i);
      return m ? { short: m[1], at: n.createdAt, message: n.message } : null;
    })
    .filter(Boolean);

  const trips = await prisma.trip.findMany();
  const rows = [];
  for (const d of declines) {
    const trip = trips.find((t) => String(t.id).startsWith(d.short));
    rows.push({
      declinedAt: d.at,
      trip: d.short,
      currentStatus: trip ? trip.status : "TRIP GONE",
      partner: trip ? trip.customer : null,
      truck: trip ? trip.truckReg : null,
      dispatchedAt: trip ? trip.dispatchedAt : null,
      revived: Boolean(trip && LIVE.includes(trip.status)),
    });
  }

  console.log("decline notices found:", declines.length);
  for (const r of rows) console.log(r);

  const revived = rows.filter((r) => r.revived);
  console.log("\nRESURRECTED (declined, then written back to a live status):", revived.length);
  console.log("\ncurrent status of every trip:");
  const by = new Map();
  for (const t of trips) by.set(t.status, (by.get(t.status) || 0) + 1);
  console.log([...by.entries()]);

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
