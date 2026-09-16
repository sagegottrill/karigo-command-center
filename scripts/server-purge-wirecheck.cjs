/** Purges verifier test artifacts ("Wire Check") from the live DB. */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const t = await p.trip.deleteMany({ where: { OR: [{ customerConsignee: { contains: "Wire Check" } }, { pickup: { contains: "Wire Check" } }, { dropoff: { contains: "Wire Check" } }] } });
  const g = await p.gateEntry.deleteMany({ where: { OR: [{ driver: { contains: "Wire Check" } }, { purpose: { contains: "Wire Check" } }] } });
  const w = await p.workOrder.updateMany({ where: { defect: { contains: "Wire Check" } }, data: { status: "Repaired" } });
  const e = await p.expense.updateMany({ where: { requester: { contains: "Wire Check" } }, data: { status: "Cancelled" } });
  const u = await p.user.deleteMany({ where: { partnerCompanyName: "Wire Check Ltd" } });
  const c = await p.trackingCheckpoint.deleteMany({ where: { location: { contains: "Wire Check" } } });
  const d = await p.driver.deleteMany({ where: { name: { contains: "Wire Check Driver" } } });
  console.log(`purged trips=${t.count} gate=${g.count} wo=${w.count} exp=${e.count} usr=${u.count} cp=${c.count} drv=${d.count}`);
  await p.$disconnect();
})().catch(async (err) => { console.error("ERR", err.message); await p.$disconnect(); process.exit(1); });
