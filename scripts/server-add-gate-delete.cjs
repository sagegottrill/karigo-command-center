/** Adds DELETE /api/gate/:id (Security/TM/Admin) + purges verifier test rows. */
const fs = require("fs");
const F = "/var/www/fleetopsx-api/index.ts";
let s = fs.readFileSync(F, "utf8");
const must = (c, l) => { if (!c) { console.error("FAIL: " + l); process.exit(1); } console.log("ok: " + l); };

if (!s.includes("app.delete('/api/gate/:id'")) {
  const anchor = "// --- INVENTORY ---";
  must(s.includes(anchor), "inventory anchor");
  const route = [
    "app.delete('/api/gate/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Security'), async (req, res) => {",
    "  try {",
    "    await prisma.gateEntry.delete({ where: { id: req.params.id } });",
    "    res.status(204).end();",
    "  } catch (e: any) {",
    "    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Gate entry not found' });",
    "    res.status(500).json({ error: e?.message || 'Could not delete gate entry' });",
    "  }",
    "});",
    "",
    "// --- INVENTORY ---",
  ].join("\n");
  s = s.replace(anchor, route);
  fs.writeFileSync(F, s);
  console.log("added DELETE /api/gate/:id");
} else {
  console.log("route already present");
}

// Purge verifier artifacts left by this session's test runs.
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const trip = await p.trip.deleteMany({ where: { OR: [{ customerConsignee: { contains: "Wire Check" } }, { pickup: { contains: "Wire Check" } }, { dropoff: { contains: "Wire Check" } }] } });
  const gate = await p.gateEntry.deleteMany({ where: { OR: [{ driver: { contains: "Wire Check" } }, { purpose: { contains: "Wire Check" } }] } });
  const wo = await p.workOrder.updateMany({ where: { defect: { contains: "Wire Check" } }, data: { status: "Repaired" } });
  const ex = await p.expense.updateMany({ where: { requester: { contains: "Wire Check" } }, data: { status: "Cancelled" } });
  const drv = await p.driver.deleteMany({ where: { name: { contains: "Wire Check Driver" } } });
  const usr = await p.user.deleteMany({ where: { partnerCompanyName: "Wire Check Ltd" } });
  const cp = await p.trackingCheckpoint.deleteMany({ where: { location: { contains: "Wire Check" } } });
  console.log(`purged: trips=${trip.count} gate=${gate.count} wo→Repaired=${wo.count} exp→Cancelled=${ex.count} drivers=${drv.count} users=${usr.count} checkpoints=${cp.count}`);
  await p.$disconnect();
})().catch(async (e) => { console.error("purge err:", e.message); await p.$disconnect(); });
