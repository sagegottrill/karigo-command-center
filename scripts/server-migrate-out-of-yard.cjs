/**
 * Fleet asset status rename: "In Transit" -> "Out of Yard" (run ON the Hetzner box).
 *
 * The fleet team used the asset status "In Transit" to mean "this truck has left
 * the yard". Because that label collides with the CUSTOMER's dispatch state, a
 * partner looking at their request for a truck that was still being loaded saw
 * "In Transit" the moment Fleet Ops touched the asset. The asset state is now
 * "Out of Yard" and it is internal bookkeeping only — the customer's In Transit
 * comes from the dispatch lifecycle (driver departs / gate logs departure).
 *
 * This migrates rows already carrying the old value so nothing reads as unknown.
 * Trips are deliberately untouched: trip status "En Route"/"Loaded" still means
 * what it always meant.
 *
 * Usage: node migrate-out-of-yard.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const before = {
    trucksInTransit: await prisma.truck.count({ where: { status: "In Transit" } }),
    tailsInTransit: await prisma.tail.count({ where: { status: "In Transit" } }),
    tripsInTransitish: await prisma.trip.count({
      where: { status: { in: ["En Route", "Loaded", "Offloading", "Returning", "Delayed"] } },
    }),
  };

  const trucks = await prisma.truck.updateMany({
    where: { status: "In Transit" },
    data: { status: "Out of Yard" },
  });
  const tails = await prisma.tail.updateMany({
    where: { status: "In Transit" },
    data: { status: "Out of Yard" },
  });

  const leftovers =
    (await prisma.truck.count({ where: { status: "In Transit" } })) +
    (await prisma.tail.count({ where: { status: "In Transit" } }));

  console.log(
    JSON.stringify(
      {
        migratingTrucks: before.trucksInTransit,
        migratingTails: before.tailsInTransit,
        updatedTrucks: trucks.count,
        updatedTails: tails.count,
        leftovers,
        tripsUntouched: before.tripsInTransitish,
        trucksOutOfYardNow: await prisma.truck.count({ where: { status: "Out of Yard" } }),
        tailsOutOfYardNow: await prisma.tail.count({ where: { status: "Out of Yard" } }),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
