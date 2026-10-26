/* THE CORRECT ONE-SOURCE-OF-TRUTH REPAIR (redo of the botched 73-row reset).
 * Backed = an open dispatch (Scheduled/En Route/Loaded/Offloading/Returning/-
 * Delayed) whose normalized truckReg string CONTAINS this truck's normalized
 * registration. Only unbacked rows move — to Available. */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
const OPEN = ["Scheduled", "En Route", "Loaded", "Offloading", "Returning", "Delayed"];
const K = (v) => String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
(async () => {
  const open = await p.trip.findMany({ where: { status: { in: OPEN } }, select: { id: true, truckReg: true, driverName: true, status: true } });
  console.log("open dispatches:", open.length);
  const trucks = await p.truck.findMany({ where: { status: { in: ["Assigned", "Out of Yard"] } } });
  const stale = trucks.filter((t) => !open.some((tr) => { const reg = K(tr.truckReg); return reg.includes(K(t.registration)) && K(t.registration).length >= 4; }));
  console.log("registry Assigned/OutOfYard:", trucks.length, "| truly unbacked:", stale.length);
  for (const t of stale) console.log("  ", t.registration, "| was", t.status, "| cab", t.cabId);
  for (const t of stale) await p.truck.update({ where: { id: t.id }, data: { status: "Available" } });
  console.log("RESET to Available:", stale.length);
  const after = await p.truck.findMany({ where: { status: { in: ["Assigned", "Out of Yard"] } } });
  const still = after.filter((t) => !open.some((tr) => { const reg = K(tr.truckReg); return reg.includes(K(t.registration)) && K(t.registration).length >= 4; }));
  console.log("VERIFY unbacked remaining:", still.length);
  await p.$disconnect();
})().catch((e) => { console.error("REPAIR2 FAILED:", e.message); process.exit(1); });
