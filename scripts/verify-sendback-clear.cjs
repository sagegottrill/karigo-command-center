/**
 * Verify the TM's "Clear & Send Back to Fleet Ops" against the LIVE API
 * (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * Creates ONE throwaway trip that already carries a full Fleet Ops assignment,
 * sends the exact payload the button sends, asserts every assignment field is
 * cleared and the request lands back on the Fleet Ops queue (status Approved),
 * then hard-deletes the trip so production is left exactly as it was.
 *
 * No notification is emitted: the trip is born Approved and the send-back keeps
 * it Approved, so the status-diffed notice never fires.
 */
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const prisma = new PrismaClient();

const BASE = "http://localhost:3001/api";
const SECRET = "karigo-super-secret-key-2026";

const call = async (method, path, token, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
};

const assignment = (t) => ({
  driverName: t.driverName,
  truckReg: t.truckReg,
  tailType: t.tailType,
  tailNumber: t.tailNumber,
  directCosts: t.directCosts ? "SET" : null,
  status: t.status,
});

(async () => {
  const u = await prisma.user.findUnique({ where: { email: "manager@petroline.ng" } });
  if (!u) throw new Error("Transport Manager account missing");
  const token = jwt.sign(
    { id: u.id, email: u.email, role: u.role, roles: u.roles && u.roles.length ? u.roles : [u.role], name: u.name },
    SECRET,
    { expiresIn: "15m" },
  );

  let id = null;
  try {
    // 1) A trip as Fleet Ops would have left it — fully assigned.
    const created = await call("POST", "/trips", token, {
      customer: "ZZ SENDBACK VERIFY",
      customerConsignee: "ZZ Verify",
      cargo: "Steel",
      requestedTruckType: "Flat",
      pickup: "ZZ Site",
      dropoff: "ZZ Drop",
      loadingSite: "ZZ Site",
      driverName: "ZZ Test Driver",
      truckReg: "ZZZ000XX / Z999",
      tailType: "Flatbed Tail",
      tailNumber: "Z999",
      directCosts: {
        tripAllowance: 1000,
        returnWaybill: 2000,
        motorBoy: 300,
        ticket: 400,
        extraAllowance: 500,
        lubricantType: "Diesel",
        lubricantQuantity: 44,
        lubricantCost: 79200,
      },
      status: "Approved",
    });
    if (created.status >= 300) throw new Error(`create failed ${created.status}: ${JSON.stringify(created.json)}`);
    id = created.json.id;

    // POST /trips does not persist assignment fields, so write them the way Fleet
    // Ops does — a PATCH that carries no status change (no notification fires).
    const assigned = await call("PATCH", `/trips/${id}`, token, {
      driverName: "ZZ Test Driver",
      truckReg: "ZZZ000XX / Z999",
      tailType: "Flatbed Tail",
      tailNumber: "Z999",
      directCosts: {
        tripAllowance: 1000,
        returnWaybill: 2000,
        motorBoy: 300,
        ticket: 400,
        extraAllowance: 500,
        lubricantType: "Diesel",
        lubricantQuantity: 44,
        lubricantCost: 79200,
      },
    });
    if (assigned.status >= 300) throw new Error(`assign failed ${assigned.status}: ${JSON.stringify(assigned.json)}`);

    const before = await prisma.trip.findUnique({ where: { id } });
    console.log("1) FO assignment in place   :", JSON.stringify(assignment(before)));

    // 2) EXACTLY what the TM's "Clear & Send Back" button PATCHes.
    const patched = await call("PATCH", `/trips/${id}`, token, {
      status: "Approved",
      driverName: "",
      truckReg: "",
      tailType: null,
      tailNumber: null,
      directCosts: null,
      sendBackReason: "ZZ verify: wrong tail for the request — please re-assign.",
    });
    if (patched.status >= 300) throw new Error(`patch failed ${patched.status}: ${JSON.stringify(patched.json)}`);

    const after = await prisma.trip.findUnique({ where: { id } });
    console.log("2) after clear + send back  :", JSON.stringify(assignment(after)));
    console.log("   reason kept             :", JSON.stringify(after.sendBackReason));

    const cleared =
      after.driverName === "" &&
      after.truckReg === "" &&
      after.tailType === null &&
      after.tailNumber === null &&
      after.directCosts === null &&
      after.status === "Approved" &&
      Boolean(after.sendBackReason);
    console.log(cleared ? "RESULT: PASS — Fleet Ops' work is gone, request is back on their queue" : "RESULT: FAIL");

    // 3) The row the FO queue filter reads (status Approved) is what it now is.
    const inFoQueue = after.status === "Approved";
    console.log("   visible to Fleet Ops queue:", inFoQueue);
  } finally {
    if (id) {
      await prisma.trip.delete({ where: { id } });
      const gone = await prisma.trip.findUnique({ where: { id } });
      console.log("3) cleanup: test trip deleted ->", gone === null ? "gone" : "STILL PRESENT");
    }
    await prisma.$disconnect();
  }
})().catch(async (e) => {
  console.error("FAIL:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
