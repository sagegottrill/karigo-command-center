/* One-off data reconcile (idempotent). Run ON the API box, in
 * /var/www/fleetopsx-api:  node _reconcile.cjs
 *
 * Syncs yard/driver status rows to what LIVE dispatches prove:
 *   - a truck named by a Scheduled/moving dispatch must not read "Available";
 *   - a driver named by one must not read "Available"/"Active";
 *   - a driver with no live dispatch must not read "On Trip";
 *   - a tail named by one must not read "Available".
 * Engineering verdicts (Maintenance/Accident/Check Up) are never touched.
 * AFTER the server-side coupling patch this state cannot recur; this run only
 * repairs what the old gap already let drift. */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const norm = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
const MOVING = ["Scheduled", "Loaded", "En Route", "Offloading", "Returning", "Delayed"];

(async () => {
  const trips = await prisma.trip.findMany({
    select: { id: true, status: true, truckReg: true, tailNumber: true, driverName: true },
  });
  const onRoad = trips.filter((t) => MOVING.includes(String(t.status).trim()));
  const TRUCK_KEY = (v) =>
    String(v || "")
      .replace(/[^0-9a-zA-Z]/g, "")
      .toUpperCase();

  const busyTruckKeys = new Set();
  for (const t of onRoad) {
    for (const part of String(t.truckReg || "").split("/")) {
      const k = TRUCK_KEY(part);
      if (k.length > 2) busyTruckKeys.add(k);
    }
  }
  const busyDrivers = new Set(
    onRoad.map((t) => norm(t.driverName)).filter((n) => n && n !== "unassigned" && n !== "tbd"),
  );
  const busyTails = new Set(onRoad.map((t) => TRUCK_KEY(t.tailNumber)).filter((k) => k.length > 2));

  let changed = 0;

  // Trucks: Available while dispatched -> Out of Yard (the movement word).
  const trucks = await prisma.truck.findMany();
  for (const h of trucks) {
    const keys = [TRUCK_KEY(h.registration), TRUCK_KEY(h.cabId)].filter((k) => k.length > 2);
    const busy = keys.some((k) => busyTruckKeys.has(k));
    if (busy && h.status === "Available") {
      await prisma.truck.update({ where: { id: h.id }, data: { status: "Out of Yard" } });
      changed += 1;
      console.log(`truck ${h.cabId} ${h.registration}: Available -> Out of Yard (dispatched)`);
    }
  }

  // Tails: Available while dispatched -> Assigned (the tail's movement word).
  const tails = await prisma.tail.findMany();
  for (const t of tails) {
    const k = TRUCK_KEY(t.number);
    if (busyTails.has(k) && t.status === "Available") {
      await prisma.tail.update({ where: { id: t.id }, data: { status: "Assigned" } });
      changed += 1;
      console.log(`tail ${t.number}: Available -> Assigned (dispatched)`);
    }
  }

  // Drivers: busy dispatch -> On Trip; no live dispatch + On Trip -> Active.
  const drivers = await prisma.driver.findMany();
  for (const d of drivers) {
    const name = norm(d.name);
    const busy = busyDrivers.has(name);
    if (busy && d.status === "Available") {
      await prisma.driver.update({ where: { id: d.id }, data: { status: "On Trip" } });
      changed += 1;
      console.log(`driver ${d.name}: Available -> On Trip (dispatched)`);
    } else if (busy && d.status === "Active") {
      await prisma.driver.update({ where: { id: d.id }, data: { status: "On Trip" } });
      changed += 1;
      console.log(`driver ${d.name}: Active -> On Trip (dispatched)`);
    } else if (!busy && d.status === "On Trip") {
      // His dispatch finished (or he was named on one that died) — free him.
      await prisma.driver.update({ where: { id: d.id }, data: { status: "Active" } });
      changed += 1;
      console.log(`driver ${d.name}: On Trip -> Active (no live dispatch)`);
    }
  }

  console.log(`\nreconciled rows: ${changed}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
