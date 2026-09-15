/** Backfill lifecycle timestamps for trips created before the columns existed. */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ASSIGNED_STATUSES = ["Approved", "Scheduled", "Loaded", "En Route", "Delayed", "Offloading", "Returning", "Completed", "Stopped"];

(async () => {
  const trips = await prisma.trip.findMany({
    select: {
      id: true,
      status: true,
      createdAt: true,
      approvedAt: true,
      assignedAt: true,
      dispatchedAt: true,
      driverName: true,
      truckReg: true,
    },
  });
  let approved = 0;
  let assigned = 0;
  for (const t of trips) {
    const data = {};
    if (!t.approvedAt && t.status !== "Requested" && t.status !== "Draft") {
      data.approvedAt = t.dispatchedAt || t.createdAt;
    }
    const hasTruck =
      (t.truckReg && t.truckReg !== "TBD" && t.truckReg !== "Unassigned") ||
      (t.driverName && t.driverName !== "Unassigned");
    if (!t.assignedAt && hasTruck && ASSIGNED_STATUSES.includes(t.status)) {
      data.assignedAt = t.dispatchedAt || t.createdAt;
    }
    if (Object.keys(data).length > 0) {
      await prisma.trip.update({ where: { id: t.id }, data });
      if (data.approvedAt) approved += 1;
      if (data.assignedAt) assigned += 1;
    }
  }
  console.log(`backfilled approvedAt on ${approved} trips, assignedAt on ${assigned} trips`);
  await prisma.$disconnect();
})();
