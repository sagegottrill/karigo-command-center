/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 *  1) Trip.partnerNote — the Transport Manager's note attached to a request that
 *     is sent back to the partner or declined, so the partner is told WHAT to fix
 *     instead of having to raise a brand-new request.
 *  2) Truck create/delete become Transport Manager (and Platform Admin) work —
 *     Fleet Ops assigns and moves assets, it does not own the fleet register.
 */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const INDEX = "/var/www/fleetopsx-api/index.ts";

(async () => {
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe('ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "partnerNote" TEXT');
  console.log("ok: Trip.partnerNote column present");
  await prisma.$disconnect();

  let schema = fs.readFileSync(SCHEMA, "utf8");
  if (!/model Trip \{[\s\S]*?partnerNote/.test(schema)) {
    const before = schema;
    schema = schema.replace(
      /(model Trip \{[\s\S]*?sendBackReason\s+String\?)/,
      "$1\n  /// Note shown to the PARTNER when a request is sent back or declined.\n  partnerNote       String?",
    );
    if (schema === before) {
      console.error("FAIL: could not find Trip.sendBackReason to anchor on");
      process.exit(1);
    }
    fs.writeFileSync(SCHEMA, schema);
    console.log("ok: schema.prisma model Trip gained partnerNote");
  } else {
    console.log("ok: schema already has Trip.partnerNote");
  }

  let index = fs.readFileSync(INDEX, "utf8");
  if (!index.includes("'partnerNote'")) {
    const anchor = "'directCosts', 'tailNumber', 'sendBackReason']";
    if (!index.includes(anchor)) {
      console.error("FAIL: trips whitelist anchor missing");
      process.exit(1);
    }
    index = index.replace(anchor, "'directCosts', 'tailNumber', 'sendBackReason', 'partnerNote']");
    console.log("ok: trips whitelist accepts partnerNote");
  } else {
    console.log("ok: trips whitelist already accepts partnerNote");
  }

  const AUTH = "authenticate, authorize('Platform Admin', 'Transport Manager')";
  const before = index;
  index = index.replace(/app\.post\('\/api\/trucks', authenticate, /, `app.post('/api/trucks', ${AUTH}, `);
  index = index.replace(/app\.delete\('\/api\/trucks\/:id', authenticate, /, `app.delete('/api/trucks/:id', ${AUTH}, `);
  if (index === before) {
    console.error("FAIL: truck routes not found for role tightening");
    process.exit(1);
  }
  fs.writeFileSync(INDEX, index);
  console.log("ok: truck create/delete restricted to Transport Manager + Platform Admin");
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
