/**
 * One-shot server patch (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * The live WorkOrder table only ever had truckReg / defect / priority / status.
 * The Engineering & Maintenance portal (and the frontend's own WorkOrder type)
 * needs the rest of the record: what kind of job it is, who is doing it, who
 * reported it, what it cost, notes, and when it was closed.
 *
 * Additive only: every statement is CREATE-if-missing, so it is safe to re-run.
 *
 * Usage:
 *   node /tmp/patch-engineering.cjs
 *   pm2 restart fleetopsx-api
 */
const fs = require("fs");
const { execSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");

const SCHEMA = "prisma/schema.prisma";
const COLS = [
  ['category', 'text'],
  ['mechanic', 'text'],
  ['"reportedBy"', 'text'],
  ['cost', 'double precision NOT NULL DEFAULT 0'],
  ['notes', 'text'],
  ['"completedAt"', 'timestamp(3)'],
  ['"startedAt"', 'timestamp(3)'],
];

const ok = (m) => console.log("ok: " + m);
const fail = (m) => {
  console.error("FAIL: " + m);
  process.exit(1);
};

// 1) schema.prisma — declare the fields so `prisma generate` emits a client that
//    accepts them in create/update payloads.
let schema = fs.readFileSync(SCHEMA, "utf8");
if (!/model WorkOrder \{[^}]*\bmechanic\b/.test(schema)) {
  const start = schema.indexOf("model WorkOrder {");
  if (start < 0) fail("model WorkOrder not found in schema.prisma");
  const end = schema.indexOf("}", start);
  if (end < 0) fail("model WorkOrder has no closing brace");
  fs.writeFileSync(SCHEMA + ".bak-engineering", schema);
  const fields = [
    '  category    String?  @default("General")',
    "  mechanic    String?",
    "  reportedBy  String?",
    "  cost        Float    @default(0)",
    "  notes       String?",
    "  startedAt   DateTime?",
    "  completedAt DateTime?",
  ].join("\n");
  const block = schema.slice(start, end);
  schema = schema.slice(0, start) + block + fields + "\n" + schema.slice(end);
  fs.writeFileSync(SCHEMA, schema);
  ok("schema.prisma: WorkOrder extended (backup .bak-engineering)");
} else {
  ok("schema.prisma: WorkOrder already has the engineering fields");
}

// 2) the columns themselves
(async () => {
  const prisma = new PrismaClient();
  for (const [name, type] of COLS) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "WorkOrder" ADD COLUMN IF NOT EXISTS ${name} ${type}`,
    );
  }
  const cols = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'WorkOrder' ORDER BY ordinal_position`,
  );
  console.log("WorkOrder columns now: " + cols.map((c) => c.column_name).join(", "));
  await prisma.$disconnect();

  // 3) regenerate the client so POST/PATCH /api/work-orders accept the fields
  const out = execSync("npx prisma generate", { encoding: "utf8", cwd: process.cwd() });
  console.log(out.split("\n").filter((l) => /Generated|error/i.test(l)).join("\n"));
  ok("prisma client regenerated — now: pm2 restart fleetopsx-api");
})().catch((e) => fail(e.message));
