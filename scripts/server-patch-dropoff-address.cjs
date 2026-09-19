/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * A partner request now carries TWO drop-off values: the Destination the truck
 * runs to (required) and the street Address at that destination (optional — the
 * partner often does not have it when the load is raised). Nothing stored the
 * second one, so it could never be captured or corrected.
 *
 *  - Adds the `dropoffAddress` column to Trip (additive, safe to re-run).
 *  - Keeps prisma/schema.prisma in step so a future `prisma generate` keeps it.
 *  - Accepts it on POST /api/trips (the request form) and on PATCH /api/trips
 *    for BOTH the partner correction form and the staff edit whitelists.
 *
 * Idempotent.
 */
const fs = require("fs");
const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

(async () => {
  // --- 1) column ---------------------------------------------------------
  try {
    const { PrismaClient } = require("@prisma/client");
    const prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "dropoffAddress" TEXT');
    console.log('ok: Trip.dropoffAddress column present');
    await prisma.$disconnect();
  } catch (e) {
    console.error("FAIL: could not add the column:", e.message);
    process.exit(1);
  }

  // --- 2) prisma schema --------------------------------------------------
  let schema = fs.readFileSync(SCHEMA, "utf8");
  if (/dropoffAddress/.test(schema)) {
    console.log("ok: schema.prisma already has dropoffAddress");
  } else {
    const before = schema;
    schema = schema.replace(
      /(\n\s*dropoff\s+String\r?\n)/,
      "$1  /// Street address at the drop-off destination (optional).\n  dropoffAddress    String?\n",
    );
    if (schema === before) {
      console.error("FAIL: could not find the Trip.dropoff line in schema.prisma");
      process.exit(1);
    }
    fs.writeFileSync(SCHEMA, schema);
    console.log("ok: schema.prisma model Trip gained dropoffAddress");
  }

  // --- 3) index.ts (create + patch whitelists) ---------------------------
  let src = fs.readFileSync(INDEX, "utf8");
  if (src.includes("dropoffAddress")) {
    console.log("ok: index.ts already accepts dropoffAddress");
    process.exit(0);
  }
  const CREATE_ANCHOR = "    dropoff: req.body.dropoff || '',\n";
  const PARTNER_ANCHOR = "    'loadingSite',\n";
  const STAFF_ANCHOR = "    : ['driverName', 'truckReg', 'requestedTruckType', 'tailType', 'pickup', 'dropoff',";
  for (const anchor of [CREATE_ANCHOR, PARTNER_ANCHOR, STAFF_ANCHOR]) {
    if (!src.includes(anchor)) {
      console.error(`FAIL: anchor not found -> ${JSON.stringify(anchor)}`);
      process.exit(1);
    }
  }
  fs.writeFileSync(INDEX + ".bak-dropoffaddress", src);
  src = src.replace(CREATE_ANCHOR, `${CREATE_ANCHOR}    // Optional: the street address at the destination, as the partner typed it.\n    dropoffAddress: req.body.dropoffAddress || null,\n`);
  src = src.replace(PARTNER_ANCHOR, `${PARTNER_ANCHOR}    'dropoffAddress',\n`);
  src = src.replace(STAFF_ANCHOR, "    : ['driverName', 'truckReg', 'requestedTruckType', 'tailType', 'pickup', 'dropoff', 'dropoffAddress',");
  fs.writeFileSync(INDEX, src);
  console.log("ok: POST /api/trips + PATCH /api/trips accept dropoffAddress (backup: index.ts.bak-dropoffaddress)");
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
