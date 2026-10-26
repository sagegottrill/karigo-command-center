/* Duplicate open-dispatch forensics (read-only): the pairs on P095 + MKR508 + the GGE87 three-way + KRD993/JHN506 confirm */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const ACTIVE = ["Scheduled", "En Route", "Loaded", "Offloading", "Returning", "Delayed", "Stopped"];
const K = (v) => String(v || "").replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
(async () => {
  const trips = await p.trip.findMany({ where: { status: { in: ACTIVE } } });
  const groups = {};
  for (const t of trips) {
    const key = K(String(t.truckReg || "").split("/")[0]);
    if (key) (groups[key] ||= []).push(t);
  }
  const ids = ["3faa3", "50a5a", "2ef4f", "7b60b", "68900", "72d9f", "5505e", "5d95e", "c272f", "22d82", "9377d"];
  for (const [reg, list] of Object.entries(groups).filter(([, l]) => l.length > 1)) {
    console.log("\n=== TRUCK " + reg + " ===");
    for (const t of list) {
      const cps = await p.$queryRawUnsafe('SELECT count(*)::int c FROM "TrackingCheckpoint" WHERE "tripId"=$1', t.id);
      const convs = await p.$queryRawUnsafe('SELECT count(*)::int c FROM "Conversation" WHERE "tripId"=$1', t.id).catch(() => [{ c: -1 }]);
      console.log(" ", String(t.id).slice(-5), "|", t.status, "|", t.driverName, "|", t.customer, "|", t.loadingSite, "→", t.dropoff, "| created", String(t.createdAt).slice(0, 16), "| upd", String(t.updatedAt).slice(0, 16), "| gateOut", t.gateOutBy || "-", "| startTime", String(t.startTime || "-").slice(0, 19), "| cps", cps[0].c, "| convs", convs[0].c, "| DC", JSON.stringify(t.directCosts || {}).slice(0, 120));
    }
  }
  // does any checkpoint name a deleted-id trip? count children for purge
  const all = ids.map(async (i) => ({ i }));
  console.log("\nids flagged:", ids.join(","));
  await p.$disconnect();
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
