/**
 * READ-ONLY: why do these TM Partner Requests rows read "In transit"?
 * Run ON the VPS from /var/www/fleetopsx-api. Changes nothing.
 */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

const want = new Set(process.argv.slice(2).length ? process.argv.slice(2) : ["2BCB1", "CEB7B", "B1A87", "93DEA", "C86C2"]);

const tail = (id) => id.replace(/[^0-9a-zA-Z]/g, "").toUpperCase().slice(-5).padStart(5, "0");

(async () => {
  const trips = await p.trip.findMany({ orderBy: { createdAt: "desc" } });
  const rows = [];
  for (const t of trips) {
    const req = tail(t.id);
    if (!want.has(req)) continue;
    rows.push({
      REQ: `REQ-${req}`,
      status: t.status,
      statusRaw: JSON.stringify(t.status),
      dispatchedAt: t.dispatchedAt,
      createdAt: t.createdAt,
      headId: t.headId,
      truckReg: t.truckReg,
      driverName: t.driverName,
      partnerNote: t.partnerNote,
      sendBackReason: t.sendBackReason,
      returnToPartnerAt: t.returnToPartnerAt ?? "(no such column)",
    });
  }
  console.log(JSON.stringify(rows, null, 2));

  const all = {};
  for (const t of trips) all[t.status] = (all[t.status] || 0) + 1;
  console.log("status census:", JSON.stringify(all));
  await p.$disconnect();
})().catch(async (e) => {
  console.error("FAIL:", e.message);
  await p.$disconnect();
  process.exit(1);
});
