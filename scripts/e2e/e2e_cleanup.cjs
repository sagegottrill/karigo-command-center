/**
 * Final cleanup after E2E: removes E2E accounts, E2E trips/checkpoints/gate rows,
 * E2E notifications/login reports, and RESTORES the fleet assets the E2E gate
 * cycle moved (truck/tail -> Available, driver -> Active).
 *
 * Hard rule (learned the destructive way): this script runs on PRODUCTION. Every
 * deleteMany MUST carry a where-clause that can only match rows the suite itself
 * created. The old `notification.deleteMany({})` / `loginReport.deleteMany({})`
 * wiped 2,379 real notifications and 1,064 real audit rows in one run.
 *
 * Run from the API directory on the VPS (needs @prisma/client).
 */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const E2E_EMAILS = [
  "e2e.admin@livecheck.io",
  "e2e.tm@livecheck.io",
  "e2e.fo@livecheck.io",
  "e2e.field@livecheck.io",
  "e2e.gate@livecheck.io",
  "e2e.tracking@livecheck.io",
  "e2e.hr@livecheck.io",
  "e2e.accounts@livecheck.io",
  "e2e.partner@livecheck.io",
  "e2e.staff@livecheck.io",
];

/** Words the suite never uses as a real asset name. */
const isPlaceholder = (v) => !v || ["Unassigned", "TBD", "TBA"].includes(String(v).trim());

/**
 * Every marker the suite stamps into the world: the LIVECHECK consignees, the
 * dedicated asset names and the e2e.* accounts. Notifications are matched on
 * this list (a gate stamp says "Truck E2E-TRK 2026", a reset says "for E2E TM"),
 * so E2E rows are removed without touching a single real one.
 */
const E2E_MARKERS = [
  "LIVECHECK",
  "livecheck",
  "Live Check",
  "E2E-TRK",
  "E2E-TAIL",
  "E2E-CAP",
  "E2E Driver",
  "E2E DRV",
  "E2E Admin",
  "E2E TM",
  "E2E FO",
  "E2E Field",
  "E2E Gate",
  "E2E Tracking",
  "E2E HR",
  "E2E Accounts",
  "E2E Partner",
];
const markerOr = (field) => E2E_MARKERS.map((m) => ({ [field]: { contains: m } }));

async function main() {
  // 1. Find every row the suite created, by its LIVECHECK/E2E markers, BEFORE
  //    anything is deleted. The E2E trips are also the single source of truth
  //    for WHICH fleet assets the gate cycle moved — no state file to lose.
  const trips = await p.trip.findMany({
    where: {
      OR: [
        { customerConsignee: { startsWith: "LIVECHECK " } },
        { customerConsignee: { startsWith: "E2E " } },
      ],
    },
  });
  const ids = trips.map((t) => t.id);

  // 2. Restore the fleet assets the E2E cycle moved: gate departure sends the
  //    truck+tail Out of Yard and the driver On Trip; gate return leaves them
  //    Check Up. Only touch rows in a status the E2E cycle itself can set —
  //    a truck in Maintenance or Accident since the run is nobody's to overwrite.
  const restored = { trucks: 0, tails: 0, drivers: 0 };
  for (const t of trips) {
    const reg = String(t.truckReg || "").trim();
    if (!isPlaceholder(reg)) {
      const r = await p.truck.updateMany({
        where: { registration: reg, status: { in: ["Out of Yard", "Check Up"] } },
        data: { status: "Available" },
      });
      restored.trucks += r.count;
    }
    const tailNo = String(t.tailNumber || "").trim();
    if (!isPlaceholder(tailNo)) {
      const r = await p.tail.updateMany({
        where: { number: tailNo, status: { in: ["Out of Yard", "Check Up"] } },
        data: { status: "Available" },
      });
      restored.tails += r.count;
    }
    const drv = String(t.driverName || "").trim();
    if (!isPlaceholder(drv)) {
      const r = await p.driver.updateMany({
        where: { name: drv, status: { in: ["On Trip", "Available"] } },
        data: { status: "Active" },
      });
      restored.drivers += r.count;
    }
  }

  // 3b. The dedicated E2E fleet assets belong to the suite — removed after every
  //     run; prep recreates them fresh (Available/Active) next time.
  const e2eTruck = await p.truck.deleteMany({ where: { cabId: "E2E-CAP-001" } });
  const e2eTail = await p.tail.deleteMany({ where: { number: "E2E-TAIL-001" } });
  const e2eDriver = await p.driver.deleteMany({ where: { staffId: "E2E-DRV-001" } });

  // 4. Notifications: ONLY the ones about E2E records — by refId on an E2E trip
  //    or E2E user, or by the LIVECHECK marker in the text. Never the whole table.
  const e2eUsers = await p.user.findMany({
    where: {
      OR: [
        { email: { contains: "livecheck.io" } },
        { email: { startsWith: "livecheck" } },
        { name: "Live Check" },
      ],
    },
    select: { id: true },
  });
  const e2eIds = e2eUsers.map((u) => u.id);
  const notifs = await p.notification.deleteMany({
    where: {
      OR: [{ refId: { in: [...ids, ...e2eIds] } }, ...markerOr("title"), ...markerOr("body")],
    },
  });

  // 4b. Login reports: only rows belonging to the E2E accounts (by id or name).
  //    Real sign-in history is an audit trail and is never touched.
  const logins = await p.loginReport.deleteMany({
    where: {
      OR: [{ userId: { in: e2eIds } }, ...markerOr("name")],
    },
  });

  // 5. The rest of the E2E artifacts.
  const cps = await p.trackingCheckpoint.deleteMany({ where: { tripId: { in: ids } } });
  const delTrips = await p.trip.deleteMany({ where: { id: { in: ids } } });
  const strayTails = await p.tail.deleteMany({ where: { number: { startsWith: "LIVEB" } } });
  const gate = await p.gateEntry.deleteMany({
    where: {
      OR: [
        { purpose: { contains: "LIVECHECK" } },
        { purpose: { contains: "E2E" } },
        { driver: { startsWith: "E2E " } },
      ],
    },
  });
  const users = await p.user.deleteMany({
    where: {
      OR: [
        { email: { in: E2E_EMAILS } },
        { email: { contains: "livecheck" } },
        { name: "Live Check" },
      ],
    },
  });

  console.log(
    JSON.stringify({
      e2eUsers: users.count,
      trips: delTrips.count,
      checkpoints: cps.count,
      gate: gate.count,
      strayTails: strayTails.count,
      notifications: notifs.count,
      loginReports: logins.count,
      restored,
      e2eAssets: { trucks: e2eTruck.count, tails: e2eTail.count, drivers: e2eDriver.count },
    }),
  );

  const remain = {
    users: await p.user.count(),
    e2eRemaining: await p.user.count({ where: { email: { contains: "livecheck.io" } } }),
    trips: await p.trip.count(),
    drivers: await p.driver.count(),
    trucks: await p.truck.count(),
    tails: await p.tail.count(),
    tenants: await p.tenant.count(),
    notifications: await p.notification.count(),
    checkpoints: await p.trackingCheckpoint.count(),
    gateEntries: await p.gateEntry.count(),
    loginReports: await p.loginReport.count(),
  };
  console.log("FINAL:", JSON.stringify(remain));
  await p.$disconnect();
}

main().catch((e) => {
  console.error("E2E CLEANUP FAILED:", e.message);
  process.exit(1);
});
