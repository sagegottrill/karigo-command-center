/**
 * Server patch: the two columns the Transport Manager's Engineering oversight
 * needs and the schema never had.
 *
 *  WorkOrder.estimatedReadyAt   the workshop's projected RETURN TO SERVICE date.
 *                               Without it there is no way to say "this truck
 *                               was promised back on the 20th and it is now the
 *                               23rd", which is the whole point of an estimate.
 *
 *  InventoryRequisition.unitCost      what the part cost at REQUEST time. The
 *                               queue is audited by value, and pricing it from
 *                               the store item means a deleted or re-priced
 *                               item silently rewrites history.
 *  InventoryRequisition.decisionNote  the Transport Manager's reason when he
 *                               rejects a request — a queue with no reason on a
 *                               rejection is not auditable.
 *
 * All nullable and additive: no existing row changes meaning.
 * Run ON the box, from /var/www/fleetopsx-api.
 */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const must = (ok, label) => {
  if (!ok) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

const raw = fs.readFileSync(SCHEMA, "utf8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);

/** Insert `add` immediately before the first line matching `test`. */
const insertBefore = (test, add, label) => {
  const at = lines.findIndex((l) => test.test(l));
  must(at !== -1, label);
  lines.splice(at, 0, ...add);
};

if (!raw.includes("estimatedReadyAt")) {
  insertBefore(
    /^\s+completedAt DateTime\?\s*$/,
    [
      "  /// The workshop's projected return-to-service date for this truck.",
      "  estimatedReadyAt DateTime?",
    ],
    "WorkOrder.completedAt anchor",
  );
}

if (!raw.includes("decisionNote")) {
  insertBefore(
    /^\s+status\s+String\s+@default\("Pending"\)\s*$/,
    [
      "  /// Part price at request time — the queue is audited by value even if the",
      "  /// store item is later removed or re-priced.",
      "  unitCost     Float?",
      "  /// Why the Transport Manager rejected the request.",
      "  decisionNote String?",
    ],
    "InventoryRequisition.status anchor",
  );
}

fs.writeFileSync(SCHEMA, lines.join(eol));
console.log(`schema written (${eol === "\r\n" ? "crlf" : "lf"})`);

/* ------------------------------------------------------------------ data ---- */

(async () => {
  const prisma = new PrismaClient();
  const cols = [
    ['WorkOrder', 'estimatedReadyAt', 'TIMESTAMP(3)'],
    ['InventoryRequisition', 'unitCost', 'DOUBLE PRECISION'],
    ['InventoryRequisition', 'decisionNote', 'TEXT'],
  ];
  for (const [table, col, type] of cols) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" ${type}`,
    );
    console.log(`applied: ${table}.${col}`);
  }

  const wo = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'WorkOrder' AND column_name = 'estimatedReadyAt'`,
  );
  const iq = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'InventoryRequisition' AND column_name IN ('unitCost','decisionNote')`,
  );
  must(wo.length === 1, "WorkOrder.estimatedReadyAt present");
  must(iq.length === 2, "InventoryRequisition.unitCost + decisionNote present");
  await prisma.$disconnect();
})();
