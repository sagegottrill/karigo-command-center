/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * The Transport Manager's second (final) approval is where he says how long the
 * vehicle is expected to be ON THE ROAD — "it is going to take 4 days". That
 * number is what turns a dispatch into On Schedule / Slight delay / Significant
 * Delay, and it is what the partner needs back so they can raise their WP.
 *
 * Nothing held it before: `estimatedDate` is a DATE (when it should leave), never
 * a duration, so delay had to be typed by hand.
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
  // --- 1) column ----------------------------------------------------------
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "estimatedDays" INTEGER',
  );
  console.log("ok: Trip.estimatedDays column present");
  await prisma.$disconnect();

  // --- 2) prisma schema ---------------------------------------------------
  let schema = fs.readFileSync(SCHEMA, "utf8");
  if (/estimatedDays/.test(schema)) {
    console.log("ok: schema.prisma already carries estimatedDays");
  } else {
    const anchor = /(  estimatedDate\s+String\?)(\r?\n)/;
    must(anchor.test(schema), "schema.prisma Trip.estimatedDate anchor");
    schema = schema.replace(anchor, (_m, line, eol) =>
      [
        line,
        "  /// How many days the Transport Manager expects the trip to take on the road.",
        "  estimatedDays     Int?",
      ].join(eol) + eol,
    );
    fs.writeFileSync(SCHEMA, schema);
    console.log("ok: schema.prisma model Trip gained estimatedDays");
  }

  // --- 3) index.ts PATCH whitelist ---------------------------------------
  let src = fs.readFileSync(INDEX, "utf8");
  if (src.includes("'estimatedDays'")) {
    console.log("ok: index.ts already accepts estimatedDays");
  } else {
    const anchor = "'estimatedDate', 'startTime'];";
    must(src.includes(anchor), "index.ts staff trip-field whitelist anchor");
    fs.writeFileSync(INDEX + ".bak-estimateddays", src);
    src = src.replace(anchor, "'estimatedDate', 'startTime', 'estimatedDays'];");
    fs.writeFileSync(INDEX, src);
    console.log("ok: PATCH /api/trips accepts estimatedDays (backup: index.ts.bak-estimateddays)");
  }
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
