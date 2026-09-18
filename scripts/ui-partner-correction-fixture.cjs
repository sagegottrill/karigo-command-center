/**
 * Throwaway fixture for driving the partner "Correct & Resend" UI (run ON the VPS
 * from /var/www/fleetopsx-api):
 *
 *   node ui-partner-correction-fixture.cjs           -> create the partner + a
 *                                                      returned (Requested,
 *                                                      partnerNote set) request
 *   node ui-partner-correction-fixture.cjs --clean   -> delete both again
 *
 * Everything is namespaced "ZZ UI …" so it can never collide with real data.
 */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const p = new PrismaClient();

const EMAIL = "zz.ui.partner@livecheck.io";
const COMPANY = "ZZ UI Partner Co";
const CLEAN = process.argv.includes("--clean");

(async () => {
  if (CLEAN) {
    const trips = await p.trip.deleteMany({ where: { customer: COMPANY } });
    const users = await p.user.deleteMany({ where: { email: EMAIL } });
    console.log(`clean: ${trips.count} trip(s), ${users.count} user(s) removed`);
    await p.$disconnect();
    return;
  }

  const hash = await bcrypt.hash("FleetOpsx2026!", 10);
  const user = await p.user.upsert({
    where: { email: EMAIL },
    update: { password: hash, status: "Active", role: "Customer Portals (External)", partnerCompanyName: COMPANY },
    create: {
      email: EMAIL,
      password: hash,
      name: "ZZ UI Partner",
      role: "Customer Portals (External)",
      status: "Active",
      partnerCompanyName: COMPANY,
      passwordResetRequired: false,
    },
  });

  await p.trip.deleteMany({ where: { customer: COMPANY } });
  const trip = await p.trip.create({
    data: {
      customer: COMPANY,
      customerConsignee: "ZZ UI Consignee",
      cargo: "Steel",
      requestedTruckType: "Flatbed Tail",
      pickup: "ZZ UI Site A",
      loadingSite: "ZZ UI Site A",
      dropoff: "ZZ UI Dropoff",
      status: "Requested",
      partnerNote: "Please correct the drop-off location and the product.",
      driverName: "Unassigned",
      truckReg: "Unassigned",
    },
  });

  console.log(`partner : ${user.email} / FleetOpsx2026!  (company "${COMPANY}")`);
  console.log(`trip    : ${trip.id}  status=${trip.status}  note=${JSON.stringify(trip.partnerNote)}`);
  await p.$disconnect();
})().catch(async (e) => {
  console.error("FAIL:", e.message);
  await p.$disconnect();
  process.exit(1);
});
