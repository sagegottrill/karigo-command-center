/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * Two facts the platform showed but could never store:
 *
 *  1. `estimatedDate` — the date the Transport Manager estimates a dispatch will
 *     leave. Nothing held it, so the Fleet Ops board had no date to show on a
 *     truck until Security actually let it out of the gate.
 *  2. `startTime` — the gate departure stamp Security writes on "Log Departure".
 *     The gate UI has always SENT it, but the Trip model had no column and the
 *     PATCH whitelist dropped it, so the real departure time was thrown away and
 *     the gate could only ever print the word "Departed".
 *
 * Additive and idempotent: safe to re-run.
 */
const fs = require("fs");
const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

(async () => {
  // --- 1) columns ---------------------------------------------------------
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe('ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "estimatedDate" TEXT');
  await prisma.$executeRawUnsafe('ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "startTime" TEXT');
  console.log("ok: Trip.estimatedDate + Trip.startTime columns present");
  await prisma.$disconnect();

  // --- 2) prisma schema ---------------------------------------------------
  let schema = fs.readFileSync(SCHEMA, "utf8");
  if (!/estimatedDate/.test(schema) || !/startTime/.test(schema)) {
    // CRLF-safe: keep whatever line ending the schema file already uses.
    const anchor = /(  assignedAt\s+DateTime\?)(\r?\n)/;
    must(anchor.test(schema), "schema.prisma Trip.assignedAt anchor");
    schema = schema.replace(anchor, (_m, line, eol) =>
      [
        line,
        "  /// What the Transport Manager estimates the dispatch date to be (YYYY-MM-DD).",
        "  estimatedDate     String?",
        "  /// The gate stamp Security writes when the truck leaves the yard.",
        "  startTime         String?",
      ].join(eol) + eol,
    );
    fs.writeFileSync(SCHEMA, schema);
    console.log("ok: schema.prisma model Trip gained estimatedDate + startTime");
  } else {
    console.log("ok: schema.prisma already carries both columns");
  }

  // --- 3) index.ts PATCH whitelist ---------------------------------------
  let src = fs.readFileSync(INDEX, "utf8");
  const anchor = "'sendBackReason', 'partnerNote'];";
  const already = src.includes("'estimatedDate'") && src.includes("'startTime'");
  if (already) {
    console.log("ok: index.ts already accepts estimatedDate + startTime");
  } else {
    must(src.includes(anchor), "index.ts staff trip-field whitelist anchor");
    fs.writeFileSync(INDEX + ".bak-estimateddate", src);
    src = src.replace(anchor, "'sendBackReason', 'partnerNote', 'estimatedDate', 'startTime'];");
    fs.writeFileSync(INDEX, src);
    console.log("ok: PATCH /api/trips accepts estimatedDate + startTime (backup: index.ts.bak-estimateddate)");
  }
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
