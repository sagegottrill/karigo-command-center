/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * "Send Back to Fleet Ops" carried no explanation, so Fleet Ops received a
 * dispatch with no idea what was wrong. This adds Trip.sendBackReason (whoever
 * sends a dispatch back must say why) and lets it through the trips PATCH
 * whitelist so the reason is stored with the record.
 */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

(async () => {
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe('ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "sendBackReason" TEXT');
  console.log("ok: Trip.sendBackReason column present");
  await prisma.$disconnect();

  // --- Prisma schema ------------------------------------------------------
  let schema = fs.readFileSync(SCHEMA, "utf8");
  if (!/model Trip \{[\s\S]*?sendBackReason/.test(schema)) {
    const before = schema;
    schema = schema.replace(
      /(model Trip \{[\s\S]*?assignedAt\s+DateTime\?)/,
      "$1\n  /// Why the Transport Manager sent this dispatch back to Fleet Ops.\n  sendBackReason    String?",
    );
    if (schema === before) {
      console.error("FAIL: could not find model Trip to patch");
      process.exit(1);
    }
    fs.writeFileSync(SCHEMA, schema);
    console.log("ok: schema.prisma model Trip gained sendBackReason");
  } else {
    console.log("ok: schema already has Trip.sendBackReason");
  }

  // --- trips PATCH whitelist ---------------------------------------------
  let index = fs.readFileSync(INDEX, "utf8");
  if (!index.includes("'sendBackReason'")) {
    const anchor = "'directCosts', 'tailNumber']";
    const alt = "'directCosts', 'tailNumber', 'sendBackReason']";
    if (!index.includes(anchor)) {
      console.error("FAIL: could not find the trips ALLOWED_TRIP_FIELDS anchor");
      process.exit(1);
    }
    index = index.replace(anchor, alt);
    fs.writeFileSync(INDEX, index);
    console.log("ok: index.ts whitelists sendBackReason");
  } else {
    console.log("ok: index.ts already whitelists sendBackReason");
  }
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
