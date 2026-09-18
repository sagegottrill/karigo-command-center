/**
 * Verify "returned to partner → partner corrects and resends" against the LIVE
 * API (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * Uses a throwaway partner company ("ZZ Partner Verify") so NO real partner can
 * see any of this, plus one throwaway trip. Both are deleted at the end.
 *
 * Proves:
 *   1. the old array-shaped loadingSite really did fail (so the fix was needed)
 *   2. the correction the UI now sends succeeds and persists
 *   3. the TM's note clears once corrected — the "Action required" flag goes away
 *   4. a request that has moved on can no longer be edited by the partner
 */
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const prisma = new PrismaClient();

const BASE = "http://localhost:3001/api";
const SECRET = "karigo-super-secret-key-2026";
const COMPANY = "ZZ Partner Verify";

const call = async (method, path, token, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: text.slice(0, 200) };
  }
};

(async () => {
  let userId = null;
  let tripId = null;
  try {
    const user = await prisma.user.create({
      data: {
        email: "zz.verify.partner@zz-verify.test",
        password: "-",
        name: "ZZ Verify Partner",
        role: "Customer Portals (External)",
        status: "Active",
        partnerCompanyName: COMPANY,
        passwordResetRequired: false,
      },
    });
    userId = user.id;

    const trip = await prisma.trip.create({
      data: {
        customer: COMPANY,
        customerConsignee: "ZZ Verify",
        cargo: "Steel",
        requestedTruckType: "Flat",
        pickup: "ZZ Site",
        dropoff: "ZZ Dest",
        loadingSite: "ZZ Site",
        status: "Requested",
        partnerNote: "Please correct the drop-off location.",
        driverName: "Unassigned",
        truckReg: "Unassigned",
      },
    });
    tripId = trip.id;

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, roles: [user.role], name: user.name },
      SECRET,
      { expiresIn: "15m" },
    );

    // 1) The OLD payload (array) — what the UI used to send.
    const arrayPatch = await call("PATCH", `/trips/${tripId}`, token, {
      loadingSite: ["Site A", "Site B"],
    });
    console.log(`1) array loadingSite        : HTTP ${arrayPatch.status} ${arrayPatch.status >= 300 ? "(failed, as reported)" : "(accepted)"}`);

    // 2) The payload the UI sends now.
    const fixed = await call("PATCH", `/trips/${tripId}`, token, {
      customerConsignee: "ZZ Corrected",
      cargo: "Steel Coils",
      requestedTruckType: "Full Sided",
      dropoff: "ZZ Dest Corrected",
      pickup: "Site A",
      loadingSite: ["Site A", "Site B"].join(", "),
      partnerNote: null,
    });
    const after = await prisma.trip.findUnique({ where: { id: tripId } });
    console.log(`2) corrected by partner    : HTTP ${fixed.status}`);
    console.log(`   consignee/dropoff       : ${after.customerConsignee} / ${after.dropoff}`);
    console.log(`   loadingSite persisted   : ${JSON.stringify(after.loadingSite)}`);
    console.log(`3) TM note cleared         : ${after.partnerNote === null ? "YES (Action flag gone)" : `NO -> ${JSON.stringify(after.partnerNote)}`}`);
    console.log(`   status after correction : ${after.status} (stays Requested = back in the TM queue)`);

    // 4) Once processed, the partner may not touch it.
    await prisma.trip.update({ where: { id: tripId }, data: { status: "Scheduled" } });
    const late = await call("PATCH", `/trips/${tripId}`, token, { cargo: "Nope" });
    console.log(`4) edit after processing   : HTTP ${late.status} ${late.status === 403 ? "(refused, as intended)" : ""}`);
  } finally {
    if (tripId) await prisma.trip.delete({ where: { id: tripId } }).catch(() => {});
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    const tripGone = tripId ? (await prisma.trip.findUnique({ where: { id: tripId } })) === null : true;
    const userGone = userId ? (await prisma.user.findUnique({ where: { id: userId } })) === null : true;
    console.log(`cleanup                    : trip ${tripGone ? "deleted" : "STILL PRESENT"}, temp partner ${userGone ? "deleted" : "STILL PRESENT"}`);
    await prisma.$disconnect();
  }
})().catch(async (e) => {
  console.error("FAIL:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
