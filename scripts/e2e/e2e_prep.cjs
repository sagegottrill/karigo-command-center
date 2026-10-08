/**
 * Prepare the E2E run: create the isolated e2e.*@livecheck.io role accounts AND
 * the dedicated E2E fleet assets (truck / tail / driver) the suite runs on.
 *
 * Everything created here is marked E2E-... and is deleted (or restored) by
 * e2e_cleanup.cjs after the run. The suite NEVER borrows a real truck, tail or
 * driver — the gate cycle flips real assets to Out of Yard / On Trip, which is
 * how the yard board lost a real head for two days.
 *
 * Run from the API directory on the VPS (needs @prisma/client + bcryptjs).
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const p = new PrismaClient();

const ACCOUNTS = [
  { email: "e2e.admin@livecheck.io", role: "Platform Admin", name: "E2E Admin" },
  { email: "e2e.tm@livecheck.io", role: "Transport Manager", name: "E2E TM" },
  { email: "e2e.fo@livecheck.io", role: "Fleet Operations", name: "E2E FO" },
  { email: "e2e.field@livecheck.io", role: "Fleet Field Ops", name: "E2E Field" },
  { email: "e2e.gate@livecheck.io", role: "Security", name: "E2E Gate" },
  { email: "e2e.tracking@livecheck.io", role: "Tracking", name: "E2E Tracking" },
  { email: "e2e.hr@livecheck.io", role: "HR", name: "E2E HR" },
  { email: "e2e.accounts@livecheck.io", role: "Accounts", name: "E2E Accounts" },
  {
    email: "e2e.partner@livecheck.io",
    role: "Customer Portals (External)",
    name: "E2E Partner",
    tenantId: "tnt_001",
  },
];

// Deterministic names (the cleanup and the suite both know them; no state file).
// The plate's first space-separated token ("E2E-TRK") is what the gate's
// plateKey matching uses, and it is unique enough that no real truck can match.
const ASSETS = {
  truckReg: "E2E-TRK 2026",
  cabId: "E2E-CAP-001",
  tailNumber: "E2E-TAIL-001",
  driverName: "E2E Driver",
  driverStaffId: "E2E-DRV-001",
};

async function main() {
  const hash = await bcrypt.hash("FleetOpsx2026!", 10);
  for (const a of ACCOUNTS) {
    await p.user.upsert({
      where: { email: a.email },
      update: { password: hash, status: "Active", role: a.role },
      create: {
        email: a.email,
        password: hash,
        name: a.name,
        role: a.role,
        tenantId: a.tenantId || null,
        status: "Active",
      },
    });
  }

  // Dedicated truck: matching the real board's canonical word ("Available" —
  // trucks never say "Active"; that legacy Prisma default is a lie).
  await p.truck.upsert({
    where: { cabId: ASSETS.cabId },
    update: { status: "Available", registration: ASSETS.truckReg },
    create: {
      cabId: ASSETS.cabId,
      registration: ASSETS.truckReg,
      status: "Available",
      destination: "E2E test fleet",
    },
  });
  await p.tail.upsert({
    where: { number: ASSETS.tailNumber },
    update: { status: "Available" },
    create: {
      number: ASSETS.tailNumber,
      type: "Flatbed",
      status: "Available",
      destination: "E2E test fleet",
    },
  });
  await p.driver.upsert({
    where: { staffId: ASSETS.driverStaffId },
    update: { status: "Active", name: ASSETS.driverName },
    create: {
      staffId: ASSETS.driverStaffId,
      name: ASSETS.driverName,
      status: "Active",
      department: "Driver",
    },
  });

  console.log(
    "E2E ready: " + ACCOUNTS.length + " role accounts + dedicated assets " + JSON.stringify(ASSETS),
  );
  await p.$disconnect();
}

main().catch((e) => {
  console.error("E2E PREP FAILED:", e.message);
  process.exit(1);
});
