/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 *  1) Asset status rename: "Out of Service" -> "Accident" on every existing
 *     truck and tail row (the client's label for a crashed asset).
 *  2) Adds the missing `destination` column to Tail so the Fleet Registry can
 *     store an editable Location for tails (Truck already has the column).
 *     The Prisma schema file is updated too, so future `prisma generate` runs
 *     keep the field.
 */
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");
const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";

(async () => {
  const prisma = new PrismaClient();

  // --- 1) Tail.destination column (additive, safe to re-run) -------------
  await prisma.$executeRawUnsafe('ALTER TABLE "Tail" ADD COLUMN IF NOT EXISTS "destination" TEXT');
  console.log("ok: Tail.destination column present");

  // --- 2) status rename -------------------------------------------------
  const trucks = await prisma.truck.updateMany({
    where: { status: "Out of Service" },
    data: { status: "Accident" },
  });
  const tails = await prisma.tail.updateMany({
    where: { status: "Out of Service" },
    data: { status: "Accident" },
  });
  console.log(`renamed: ${trucks.count} trucks, ${tails.count} tails -> Accident`);

  await prisma.$disconnect();

  // --- 3) Prisma schema gets the new Tail field --------------------------
  let src = fs.readFileSync(SCHEMA, "utf8");
  if (!/model Tail \{[\s\S]*?destination/.test(src)) {
    const before = src;
    src = src.replace(/(model Tail \{[\s\S]*?type\s+String\?)/, "$1\n  destination String?");
    if (src === before) {
      console.error("FAIL: could not find model Tail to patch");
      process.exit(1);
    }
    fs.writeFileSync(SCHEMA, src);
    console.log("ok: schema.prisma model Tail gained destination");
  } else {
    console.log("ok: schema.prisma already has Tail.destination");
  }
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
