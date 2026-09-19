/**
 * One-shot heal (run ON the Hetzner box from /var/www/fleetopsx-api).
 *
 * 25 of the 30 live dispatches already had tracking checkpoints — the trucks were
 * demonstrably out — but not one carried a departure stamp, so the board's
 * Dispatched Date, the delay clock, the partner's timeline and Fleet Ops'
 * "In Transit" were all blank. Derive the departure from the EARLIEST checkpoint
 * on each trip and move the status along the road (forward only).
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const LEG_STATUS = {
  loading: "Loaded",
  "in transit": "En Route",
  "at destination": "Offloading",
  offloaded: "Offloading",
  return: "Returning",
};
const ON_ROAD_RANK = {
  Scheduled: 0,
  Loaded: 1,
  "En Route": 2,
  Offloading: 3,
  Returning: 4,
  Completed: 5,
};

const norm = (v) => String(v || "").trim().toLowerCase();

(async () => {
  const trips = await prisma.trip.findMany({
    select: { id: true, status: true, startTime: true },
  });
  const withCheckpoints = await prisma.trackingCheckpoint.groupBy({
    by: ["tripId"],
    _min: { at: true },
    _count: { _all: true },
  });
  const earliest = new Map(withCheckpoints.map((r) => [r.tripId, r._min.at]));

  let stamped = 0;
  let advanced = 0;
  const moves = {};

  for (const trip of trips) {
    const first = earliest.get(trip.id);
    if (!first) continue;

    const data = {};
    if (!trip.startTime || !String(trip.startTime).trim()) {
      data.startTime = first.toISOString();
    }
    // The leg of the earliest checkpoint decides how far along the road it is.
    const firstCp = await prisma.trackingCheckpoint.findFirst({
      where: { tripId: trip.id },
      orderBy: { at: "asc" },
      select: { leg: true, location: true },
    });
    const target = firstCp ? LEG_STATUS[norm(firstCp.leg)] : null;
    const from = ON_ROAD_RANK[String(trip.status || "").trim()];
    const to = target ? ON_ROAD_RANK[target] : undefined;
    if (target && from !== undefined && to !== undefined && to > from) {
      data.status = target;
      moves[`${trip.status} -> ${target}`] = (moves[`${trip.status} -> ${target}`] || 0) + 1;
    }

    if (Object.keys(data).length === 0) continue;
    await prisma.trip.update({ where: { id: trip.id }, data });
    if (data.startTime) stamped += 1;
    if (data.status) advanced += 1;
  }

  console.log("trips scanned        :", trips.length);
  console.log("trips with movement  :", earliest.size);
  console.log("departure stamps set :", stamped);
  console.log("statuses advanced    :", advanced);
  console.log("status moves         :", moves);

  const after = await prisma.trip.groupBy({ by: ["status"], _count: { _all: true } });
  console.log("status counts now    :", after.map((r) => `${r.status}=${r._count._all}`).join(" | "));
  const stillBlank = await prisma.trip.count({
    where: { OR: [{ startTime: null }, { startTime: "" }] },
  });
  console.log("trips with no stamp after heal:", stillBlank);
  await prisma.$disconnect();
})();
