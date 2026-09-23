/**
 * Server patch: the parts store gets a purchase ledger.
 *
 * The problem this fixes: `InventoryItem.stock` is a number anyone can type
 * over. Nothing recorded that 40 filters were bought from a vendor for ₦8,500
 * each, or that 3 of them went out to a specific truck. So "where does the
 * store's money go", "what is sitting idle", "what does one truck cost in parts"
 * and "what do we owe a vendor" were all unanswerable — not by the dashboard,
 * by the platform.
 *
 * Two additive changes:
 *
 *  InventoryItem.supplier      the vendor a line is normally bought from, so a
 *                              reorder list can address it before the store has
 *                              ever recorded a purchase for that line.
 *
 *  InventoryMovement           the ledger. One row per physical movement:
 *                              Purchase (+), Issue (−, against a truck),
 *                              Adjustment (±, a stock count) and Write-off (−).
 *                              Carries the price at the moment of the movement
 *                              and who recorded it, because a stock figure that
 *                              cannot be explained after the fact is not an
 *                              audit trail.
 *
 * Nothing existing changes meaning — a store with no movements keeps reporting
 * exactly what it reported before.
 *
 * Run ON the box, from /var/www/fleetopsx-api, then: pm2 restart fleetopsx-api
 */
const fs = require("fs");
const { execFileSync } = require("child_process");
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

/** Insert `add` inside the named model, just before its first matching field. */
const insertInModel = (model, test, add, label) => {
  const start = lines.findIndex((l) => new RegExp(`^model ${model}\\b`).test(l));
  must(start !== -1, `${model} model found`);
  const end = lines.findIndex((l, i) => i > start && /^\}/.test(l));
  must(end !== -1, `${model} block closes`);
  const at = lines.findIndex((l, i) => i > start && i < end && test.test(l));
  must(at !== -1, `${label} anchor`);
  lines.splice(at, 0, ...add);
};

if (!raw.includes("supplier")) {
  insertInModel(
    "InventoryItem",
    /^\s+location\s+String\s+@default\("Main Store"\)\s*$/,
    [
      "  /// The vendor this line is normally bought from. A reorder is addressed",
      "  /// to it until the store records a purchase against a different one.",
      '  supplier     String   @default("")',
    ],
    "InventoryItem.supplier",
  );
}

const MOVEMENT_MODEL = `model InventoryMovement {
  id        String   @id @default(uuid())
  itemId    String
  /// Name and SKU are copied, not joined: the ledger has to stay readable after
  /// a store line is renamed or deleted.
  itemName  String
  sku       String
  /// Purchase | Issue | Adjustment | Write-off
  kind      String
  /// Signed stock effect: + in from a vendor, - drawn against a truck.
  quantity  Int
  /// Price per unit at the moment of the movement, and the line's total.
  unitCost  Float?
  value     Float?
  vendor    String?
  /// What the movement was for: a requisition id, a work order, a delivery note.
  reference String?
  truckReg  String?
  note      String?
  actedBy   String?
  actedAt   DateTime @default(now())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}`;

if (!raw.includes("model InventoryMovement")) {
  lines.push("", MOVEMENT_MODEL, "");
  console.log("ok: InventoryMovement model appended");
}

fs.writeFileSync(SCHEMA, lines.join(eol));
console.log(`schema written (${eol === "\r\n" ? "crlf" : "lf"})`);

/* ------------------------------------------------------------------ data ---- */

(async () => {
  const prisma = new PrismaClient();

  await prisma.$executeRawUnsafe(
    `ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "supplier" TEXT NOT NULL DEFAULT ''`,
  );
  console.log("applied: InventoryItem.supplier");

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "InventoryMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION,
    "value" DOUBLE PRECISION,
    "vendor" TEXT,
    "reference" TEXT,
    "truckReg" TEXT,
    "note" TEXT,
    "actedBy" TEXT,
    "actedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
  )`);
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "InventoryMovement_itemId_actedAt_idx" ON "InventoryMovement" ("itemId", "actedAt")`,
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS "InventoryMovement_actedAt_idx" ON "InventoryMovement" ("actedAt")`,
  );
  console.log("applied: InventoryMovement table + indexes");

  const supplier = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'InventoryItem' AND column_name = 'supplier'`,
  );
  const ledger = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.tables WHERE table_name = 'InventoryMovement'`,
  );
  must(supplier.length === 1, "InventoryItem.supplier present");
  must(ledger.length === 1, "InventoryMovement table present");
  await prisma.$disconnect();

  try {
    execFileSync("npx", ["prisma", "generate"], { stdio: "pipe" });
    console.log("ok: prisma client regenerated");
  } catch (error) {
    console.error("FAIL: prisma generate");
    console.error(String(error.stdout || "") + String(error.stderr || ""));
    process.exit(1);
  }
})();
