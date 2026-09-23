/**
 * Corrective pass.
 *
 * The first patch anchored on the FIRST `status String @default("Pending")` line
 * in the schema — which belongs to Expense, not InventoryRequisition — so it
 * bolted `unitCost` / `decisionNote` onto the wrong model. The ALTER TABLE only
 * ever touched InventoryRequisition, so the generated client then expected two
 * columns Expense's table does not have: every expense read would have failed.
 *
 * This removes them from Expense and puts them on InventoryRequisition, anchored
 * inside that model's own block. Run ON the box from /var/www/fleetopsx-api.
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
let lines = raw.split(/\r?\n/);

/* ------------------------------------------- 1. remove the Expense mistake -- */

const expenseStart = lines.findIndex((l) => /^model Expense\b/.test(l));
must(expenseStart !== -1, "Expense model found");
let removed = 0;
lines = lines.filter((line, i) => {
  const inExpense =
    i > expenseStart &&
    !/^model\b/.test(line) &&
    lines.slice(expenseStart, i).every((l) => !/^\}/.test(l));
  const isMistake =
    line.includes("Part price at request time") ||
    line.includes("store item is later removed or re-priced") ||
    line.includes("Why the Transport Manager rejected the request") ||
    /^\s+unitCost\s+Float\?\s*$/.test(line) ||
    /^\s+decisionNote\s+String\?\s*$/.test(line);
  if (inExpense && isMistake) {
    removed += 1;
    return false;
  }
  return true;
});
must(removed === 5, `removed the 5 inserted Expense lines (got ${removed})`);
must(!lines.some((l) => /^\s+decisionNote\s+String\?\s*$/.test(l)), "Expense cleaned");

/* --------------------------------- 2. put them on InventoryRequisition ------ */

const reqStart = lines.findIndex((l) => /^model InventoryRequisition\b/.test(l));
must(reqStart !== -1, "InventoryRequisition model found");
const reqEnd = lines.findIndex((l, i) => i > reqStart && /^\}/.test(l));
must(reqEnd !== -1, "InventoryRequisition block closes");
const reasonAt = lines.findIndex((l, i) => i > reqStart && i < reqEnd && /^\s+reason\s+String\s*$/.test(l));
must(reasonAt !== -1, "InventoryRequisition.reason found");

lines.splice(
  reasonAt + 1,
  0,
  "  /// Part price at request time — the queue is audited by value even if the",
  "  /// store item is later removed or re-priced.",
  "  unitCost     Float?",
  "  /// Why the Transport Manager rejected the request.",
  "  decisionNote String?",
);

fs.writeFileSync(SCHEMA, lines.join(eol));

const check = fs.readFileSync(SCHEMA, "utf8").split(/\r?\n/);
const cReq = check.findIndex((l) => /^model InventoryRequisition\b/.test(l));
const cEnd = check.findIndex((l, i) => i > cReq && /^\}/.test(l));
const reqBlock = check.slice(cReq, cEnd).join("\n");
must(reqBlock.includes("unitCost") && reqBlock.includes("decisionNote"), "fields inside InventoryRequisition");
const cExp = check.findIndex((l) => /^model Expense\b/.test(l));
const cExpEnd = check.findIndex((l, i) => i > cExp && /^\}/.test(l));
must(!check.slice(cExp, cExpEnd).join("\n").includes("unitCost"), "Expense is clean");

/* ------------------------------------------------------------- 3. columns -- */

(async () => {
  const prisma = new PrismaClient();
  for (const [table, col, type] of [
    ["InventoryRequisition", "unitCost", "DOUBLE PRECISION"],
    ["InventoryRequisition", "decisionNote", "TEXT"],
  ]) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" ${type}`);
    console.log(`applied: ${table}.${col}`);
  }
  const cols = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'InventoryRequisition' AND column_name IN ('unitCost','decisionNote')`,
  );
  must(cols.length === 2, "both columns exist in the table");
  await prisma.$disconnect();
})();
