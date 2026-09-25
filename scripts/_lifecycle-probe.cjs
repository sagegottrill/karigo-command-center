/* End-to-end lifecycle probe (read-only). Run ON the API box, in
 * /var/www/fleetopsx-api:  node _probe.cjs
 * Reports, per lifecycle stage, records that look stuck, orphaned or
 * contradictory — every count is a candidate gap, printed with ids. */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DAY = 86_400_000;
const now = Date.now();
const daysAgo = (n) => new Date(now - n * DAY);
const short = (id) => String(id).slice(0, 8);
const RELEASED = [
  "Scheduled",
  "Loaded",
  "En Route",
  "Offloading",
  "Returning",
  "Delayed",
  "Completed",
];
const MOVING = ["Loaded", "En Route", "Offloading", "Returning", "Delayed"];

(async () => {
  const trips = await prisma.trip.findMany({
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      dispatchedAt: true,
      approvedAt: true,
      driverName: true,
      truckReg: true,
      tailNumber: true,
      dropoff: true,
      customerConsignee: true,
      directCosts: true,
    },
  });
  const heads = await prisma.truck.findMany({
    select: { id: true, cabId: true, status: true, registration: true },
  });
  const tails = await prisma.tail.findMany({ select: { id: true, number: true, status: true } });
  const drivers = await prisma.driver.findMany({
    select: { id: true, status: true, name: true, truckReg: true },
  });
  const gates = await prisma.gateEntry.findMany({ orderBy: { timestamp: "desc" }, take: 800 });
  const disbursals = await prisma.lubricantDisbursal.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const norm = (v) =>
    String(v || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  const headByReg = new Map(heads.map((h) => [norm(h.registration), h]));
  const headByNum = new Map(heads.map((h) => [norm(h.cabId), h]));
  const tailById = new Map(tails.map((t) => [t.id, t]));
  const driverByName = new Map(drivers.map((d) => [norm(d.name), d]));

  const bucket = (t) => {
    const s = String(t.status ?? "").trim();
    if (s === "Stopped") return "declined";
    if (["Requested", "Draft"].includes(s)) return "pending";
    if (["Approved", "Approved for Dispatch"].includes(s)) return "approved";
    if (s === "Awaiting Approval") return "awaiting";
    if (s === "Scheduled") return "scheduled";
    if (MOVING.includes(s)) return "inTransit";
    if (s === "Completed") return "completed";
    return "UNKNOWN:" + (s || "(empty)");
  };

  /* ---- stage distribution ---- */
  const counts = {};
  for (const t of trips) {
    const b = bucket(t);
    counts[b] = (counts[b] ?? 0) + 1;
  }
  console.log("=== stage distribution ===");
  console.log(JSON.stringify(counts));

  /* ---- G1: moving/completed loads with no gate departure record ---- */
  const movedTrips = trips.filter((t) => [...MOVING, "Completed"].includes(t.status));
  const gatedTripIds = new Set(gates.map((g) => g.tripId));
  const noGateOut = movedTrips.filter((t) => !gatedTripIds.has(t.id));
  console.log(`\n=== G1 moving/completed with NO gate entry: ${noGateOut.length}`);
  for (const t of noGateOut.slice(0, 6))
    console.log(`  ${short(t.id)} ${t.status} ${String(t.createdAt).slice(0, 10)}`);

  /* ---- G2: informational — completed loads age ---- */
  const completed = trips.filter((t) => t.status === "Completed");
  const completedRecent = completed.filter((t) => new Date(t.updatedAt) >= daysAgo(2));
  console.log(`\n=== G2 completed: ${completed.length} (recent: ${completedRecent.length})`);

  /* ---- G3: truck references that match no fleet record ---- */
  const unknownTruck = trips.filter((t) => {
    const reg = norm(t.truckReg);
    return reg && reg !== "unassigned" && !headByReg.has(reg) && !headByNum.has(reg);
  });
  console.log(`\n=== G3 truckReg matching no head: ${unknownTruck.length}`);
  for (const t of unknownTruck.slice(0, 6))
    console.log(`  ${short(t.id)} "${t.truckReg}" ${t.status}`);

  /* ---- G4: fleet-status contradictions ---- */
  const onRoad = trips.filter((t) => ["Scheduled", ...MOVING].includes(t.status));
  const busyRegs = new Set(
    onRoad.map((t) => norm(t.truckReg)).filter((r) => r && r !== "unassigned"),
  );
  const headContradiction = heads.filter(
    (h) => busyRegs.has(norm(h.registration)) && h.status === "Available",
  );
  console.log(`\n=== G4 heads Available while dispatched: ${headContradiction.length}`);
  for (const h of headContradiction.slice(0, 6)) console.log(`  ${h.cabId} ${h.registration}`);
  const busyDrivers = new Set(
    onRoad.map((t) => norm(t.driverName)).filter((n) => n && n !== "unassigned"),
  );
  const driverContradiction = drivers.filter(
    (d) => busyDrivers.has(norm(d.name)) && d.status === "Available",
  );
  console.log(`=== G4 drivers Available while dispatched: ${driverContradiction.length}`);
  for (const d of driverContradiction.slice(0, 6)) console.log(`  ${d.name}`);
  const busyTails = new Set(onRoad.map((t) => norm(t.tailNumber)).filter(Boolean));
  const tailContradiction = tails.filter(
    (t) => busyTails.has(norm(t.number)) && t.status === "Available",
  );
  console.log(`=== G4 tails Available while dispatched: ${tailContradiction.length}`);

  /* ---- G5: dispenses against non-released dispatches ---- */
  const statusById = new Map(trips.map((t) => [t.id, t.status]));
  const badPours = disbursals.filter((d) => {
    const s = statusById.get(d.tripId);
    return s && !RELEASED.includes(s);
  });
  console.log(`\n=== G5 dispenses against non-released dispatches: ${badPours.length}`);
  for (const d of badPours.slice(0, 5))
    console.log(
      `  pour ${short(d.id)} trip ${short(d.tripId)} tripStatus=${statusById.get(d.tripId)} at=${String(d.createdAt).slice(0, 10)}`,
    );

  /* ---- G6: completed loads with no dispensary record ---- */
  const pouredTrips = new Set(disbursals.map((d) => d.tripId));
  const dryCompleted = completed.filter((t) => !pouredTrips.has(t.id));
  console.log(`\n=== G6 Completed with NO dispense record: ${dryCompleted.length}`);
  for (const t of dryCompleted.slice(0, 5))
    console.log(`  ${short(t.id)} ${String(t.createdAt).slice(0, 10)} ${t.dropoff ?? ""}`);

  /* ---- G7: stuck-in-stage aging ---- */
  console.log(`\n=== G7 stuck > 2 days in stage`);
  for (const s of ["Requested", "Approved", "Awaiting Approval", "Scheduled", ...MOVING]) {
    const stuck = trips.filter((t) => t.status === s && new Date(t.updatedAt) < daysAgo(2));
    if (stuck.length)
      console.log(
        `  ${s}: ${stuck.length}  e.g. ${stuck
          .slice(0, 3)
          .map((t) => short(t.id))
          .join(", ")}`,
      );
  }

  /* ---- G8: gate-entry purpose/status mix (informational) ---- */
  const gateMix = {};
  for (const g of gates) {
    const k = `${g.type || "?"}/${g.status || "?"}`;
    gateMix[k] = (gateMix[k] ?? 0) + 1;
  }
  console.log(`\n=== G8 gate entry mix: ${JSON.stringify(gateMix)}`);

  await prisma.$disconnect();
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
