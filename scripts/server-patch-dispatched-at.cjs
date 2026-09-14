/**
 * One-shot server patch (run ON the Hetzner box via ssh_run.mjs).
 * 1) prisma/schema.prisma: add `dispatchedAt DateTime?` to Trip (backed up first).
 * 2) index.ts: PATCH /api/trips/:id stamps dispatchedAt on first transition to
 *    Scheduled (final TM approval) — a real dispatch date, not an approximation.
 * Run with: node /tmp/patch-dispatched-at.cjs
 * Then:     cd /var/www/fleetopsx-api && npx prisma db push && pm2 restart fleetopsx-api
 * Then run  /tmp/backfill-dispatched-at.cjs
 */
const fs = require("fs");
const API_DIR = "/var/www/fleetopsx-api";

// --- 1. schema.prisma: add dispatchedAt ---
const schemaPath = API_DIR + "/prisma/schema.prisma";
fs.copyFileSync(schemaPath, schemaPath + ".bak-dispatched");
let schema = fs.readFileSync(schemaPath, "utf8");
if (!schema.includes("dispatchedAt")) {
  const re = /(model Trip \{[\s\S]*?updatedAt\s+DateTime @updatedAt)/;
  if (!re.test(schema)) {
    console.error("FAIL: Trip model updatedAt anchor not found");
    process.exit(1);
  }
  schema = schema.replace(re, "$1\n  dispatchedAt      DateTime?");
  fs.writeFileSync(schemaPath, schema);
}
if (!fs.readFileSync(schemaPath, "utf8").includes("dispatchedAt")) {
  console.error("FAIL: schema write");
  process.exit(1);
}
console.log("ok: schema.prisma has Trip.dispatchedAt (backup .bak-dispatched)");

// --- 2. index.ts: stamp at Scheduled ---
const indexPath = API_DIR + "/index.ts";
fs.copyFileSync(indexPath, indexPath + ".bak-dispatched");
let src = fs.readFileSync(indexPath, "utf8");
const anchor = "const trip = await prisma.trip.update({ where: { id: req.params.id }, data });";
if (!src.includes(anchor)) {
  console.error("FAIL: trip update anchor not found");
  process.exit(1);
}
if (!src.includes("dispatchedAt")) {
  const stamp =
    anchor +
    "\n  // Stamp first dispatch (final TM approval -> Scheduled) for the Date Dispatched column.\n" +
    "  if (trip.status === 'Scheduled' && !trip.dispatchedAt) {\n" +
    "    const stamped = await prisma.trip.update({ where: { id: trip.id }, data: { dispatchedAt: new Date() } });\n" +
    "    trip.dispatchedAt = stamped.dispatchedAt;\n" +
    "  }";
  src = src.replace(anchor, stamp);
  fs.writeFileSync(indexPath, src);
}
if (!fs.readFileSync(indexPath, "utf8").includes("dispatchedAt")) {
  console.error("FAIL: index.ts write");
  process.exit(1);
}
console.log("ok: index.ts stamps dispatchedAt on final approval (backup .bak-dispatched)");
console.log("PATCH OK — next: npx prisma db push && pm2 restart fleetopsx-api, then backfill script");
