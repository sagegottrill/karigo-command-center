/**
 * Server patch: the two columns that let Engineering answer the Transport
 * Manager's only question about a grounded truck — why is it off the road, and
 * when is it back.
 *
 *  Truck.holdReason / Truck.expectedReadyAt
 *  Tail.holdReason  / Tail.expectedReadyAt
 *
 * WorkOrder already carries `estimatedReadyAt`, but most trucks sitting in
 * check-up or under repair have no work order raised yet: the maintenance
 * queue showed five trucks with no reason and no promise on any of them. The
 * promise belongs to the asset, so the Head of Engineering sets it there and
 * the Transport Manager's list prints it per truck.
 *
 * All nullable and additive: no existing row changes meaning.
 * Run ON the box, from /var/www/fleetopsx-api, then `npx prisma generate`.
 *
 * NOTE (learned the hard way): every anchor is scoped to its own model. The
 * first attempt matched `status String @default("Active")` anywhere in the
 * file and put the columns on User, tripling the field onto the wrong model.
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

const GROUNDING = [
  "  /// Why this asset is off the road and the date Engineering expects it back.",
  "  holdReason      String?",
  "  expectedReadyAt DateTime?",
];

/** Insert GROUNDING after the `status` line of one named model, once. */
function ensureInModel(model, statusLine) {
  const start = lines.findIndex((l) => l.startsWith(`model ${model} {`));
  must(start !== -1, `model ${model}`);
  const end = lines.findIndex((l, i) => i > start && l.trim() === "}");
  must(end !== -1, `${model} closing brace`);
  const body = lines.slice(start, end);
  if (body.some((l) => /holdReason\s+String\?/.test(l))) {
    console.log(`skip: ${model} already carries the columns`);
    return;
  }
  const at = body.findIndex((l) => l.trim() === statusLine.trim());
  must(at !== -1, `${model}.status anchor`);
  lines = [
    ...lines.slice(0, start + at + 1),
    ...GROUNDING,
    ...lines.slice(start + at + 1),
  ];
}

ensureInModel("Truck", 'status       String   @default("Active")');
ensureInModel("Tail", 'status    String   @default("Available")');

fs.writeFileSync(SCHEMA, lines.join(eol));
console.log(`schema written (${eol === "\r\n" ? "crlf" : "lf"})`);

/* ------------------------------------------------------------------ data ---- */

(async () => {
  const prisma = new PrismaClient();
  const cols = [
    ["Truck", "holdReason", "TEXT"],
    ["Truck", "expectedReadyAt", "TIMESTAMP(3)"],
    ["Tail", "holdReason", "TEXT"],
    ["Tail", "expectedReadyAt", "TIMESTAMP(3)"],
  ];
  for (const [table, col, type] of cols) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" ${type}`,
    );
    console.log(`applied: ${table}.${col}`);
  }

  for (const table of ["Truck", "Tail"]) {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' AND column_name IN ('holdReason','expectedReadyAt')`,
    );
    must(rows.length === 2, `${table}.holdReason + expectedReadyAt present`);
  }
  // The columns never belonged on User; the first run put them there.
  for (const col of ["holdReason", "expectedReadyAt"]) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" DROP COLUMN IF EXISTS "${col}"`);
  }
  await prisma.$disconnect();
})();
