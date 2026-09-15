/**
 * One-shot data heal (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * Recovers `requestedTruckType` for rows created before the column existed:
 *  1) rows whose `tailType` still holds a request option (never assigned) — copy it;
 *  2) rows already assigned (tailType became "Flatbed Tail") — parse the original
 *     "New Delivery Request" notification, which quotes the type the partner asked
 *     for, and match it to the trip by consignee + destination + nearest time.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const REQUEST_OPTIONS = [
  "Full Sided",
  "Semi Sided",
  "Flat",
  "Side Guide",
  "Low Bed",
  "6 Meter Truck",
  "8 Meter Truck",
  "Pick Up",
];

const NOTICE_RE = /requested a (.+?) for (.+?) to (.+?)\.?\s*$/;

(async () => {
  const trips = await prisma.trip.findMany({
    select: {
      id: true,
      status: true,
      tailType: true,
      requestedTruckType: true,
      customerConsignee: true,
      dropoff: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const notices = await prisma.notification.findMany({
    where: { title: "New Delivery Request" },
    select: { body: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  let copied = 0;
  let recovered = 0;
  const unresolved = [];

  for (const trip of trips) {
    if (trip.requestedTruckType) continue;

    if (trip.tailType && REQUEST_OPTIONS.includes(trip.tailType)) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: { requestedTruckType: trip.tailType },
      });
      copied++;
      continue;
    }

    const wanted = notices
      .map((n) => ({ ...n, match: NOTICE_RE.exec((n.body || "").trim()) }))
      .filter((n) => n.match)
      .filter(
        (n) =>
          n.match[2].trim().toLowerCase() === (trip.customerConsignee || "").trim().toLowerCase() &&
          n.match[3].trim().toLowerCase() === (trip.dropoff || "").trim().toLowerCase(),
      )
      .sort(
        (a, b) =>
          Math.abs(new Date(a.createdAt) - new Date(trip.createdAt)) -
          Math.abs(new Date(b.createdAt) - new Date(trip.createdAt)),
      );

    const hit = wanted[0];
    if (hit && REQUEST_OPTIONS.includes(hit.match[1].trim())) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: { requestedTruckType: hit.match[1].trim() },
      });
      recovered++;
      console.log(`recovered ${trip.id.slice(0, 8)} → ${hit.match[1].trim()} (${trip.status})`);
    } else {
      unresolved.push(`${trip.id.slice(0, 8)} (${trip.status}) tailType=${trip.tailType}`);
    }
  }

  console.log(`\ncopied from tailType: ${copied}`);
  console.log(`recovered from notifications: ${recovered}`);
  console.log(`still unknown: ${unresolved.length}`);
  unresolved.forEach((u) => console.log("  - " + u));
  process.exit(0);
})();
