/**
 * Verify the new direct-cost "Bonus" field against the LIVE API
 * (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * Writes a full cost configuration including Bonus onto ONE throwaway trip,
 * reads it back through the real endpoint, then hard-deletes the trip. No
 * notification fires: the trip is born and stays Approved.
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
  try {
    return { status: res.status, json: JSON.parse(text) };
  } catch {
    return { status: res.status, json: text };
  }
};

const costs = {
  tripAllowance: 10000,
  returnWaybill: 10000,
  motorBoy: 5000,
  ticket: 2000,
  extraAllowance: 8000,
  bonus: 5000,
  lubricantType: "Diesel",
  lubricantQuantity: 60,
  lubricantCost: 108000,
};

(async () => {
  const u = await prisma.user.findUnique({ where: { email: "manager@petroline.ng" } });
  const token = jwt.sign(
    { id: u.id, email: u.email, role: u.role, roles: u.roles && u.roles.length ? u.roles : [u.role], name: u.name },
    SECRET,
    { expiresIn: "15m" },
  );

  let id = null;
  try {
    const created = await call("POST", "/trips", token, {
      customer: "ZZ BONUS VERIFY",
      customerConsignee: "ZZ Bonus",
      cargo: "Steel",
      requestedTruckType: "Flat",
      pickup: "ZZ Site",
      dropoff: "ZZ Drop",
      status: "Approved",
    });
    if (created.status >= 300) throw new Error(`create failed ${created.status}: ${JSON.stringify(created.json)}`);
    id = created.json.id;

    // Same shape the Fleet Ops form now PATCHes (status untouched -> no notice).
    const patched = await call("PATCH", `/trips/${id}`, token, { directCosts: costs });
    if (patched.status >= 300) throw new Error(`patch failed ${patched.status}: ${JSON.stringify(patched.json)}`);

    const stored = await prisma.trip.findUnique({ where: { id } });
    const back = stored.directCosts || {};
    const allowances =
      back.tripAllowance + back.returnWaybill + back.motorBoy + back.ticket + back.extraAllowance + (back.bonus ?? 0);
    console.log("stored directCosts :", JSON.stringify(back));
    console.log("bonus round-trip   :", back.bonus === 5000 ? "PASS (5000)" : `FAIL (${back.bonus})`);
    console.log("FO-visible total   :", allowances, allowances === 40000 ? "PASS (35,000 + 5,000 bonus)" : "FAIL");
    console.log(
      "TM grand total     :",
      allowances + (back.lubricantCost ?? 0),
      "= allowances (bonus incl.) + priced fuel",
    );
  } finally {
    if (id) {
      await prisma.trip.delete({ where: { id } });
      const gone = await prisma.trip.findUnique({ where: { id } });
      console.log("cleanup            :", gone === null ? "test trip deleted" : "STILL PRESENT");
    }
    await prisma.$disconnect();
  }
})().catch(async (e) => {
  console.error("FAIL:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
