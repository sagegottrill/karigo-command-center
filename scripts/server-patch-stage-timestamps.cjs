/**
 * One-shot server patch (run ON the Hetzner box).
 * Adds two lifecycle timestamps so EVERY timeline step can show a real time:
 *   approvedAt — the TM's FIRST approval (request seen)
 *   assignedAt — Fleet Ops assigning driver/truck
 * (dispatchedAt already exists for the final approval.)
 * Run: node /tmp/patch-stage-timestamps.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const SCHEMA = "/var/www/fleetopsx-api/prisma/schema.prisma";
const FILE = "/var/www/fleetopsx-api/index.ts";

// 1) Schema columns
let schema = fs.readFileSync(SCHEMA, "utf8");
if (!schema.includes("approvedAt")) {
  schema = schema.replace(
    /(\n\s*tailNumber\s+String\?\s*\n)/,
    "$1  approvedAt        DateTime?\n  assignedAt        DateTime?\n",
  );
  if (!schema.includes("approvedAt")) {
    console.error("PATCH FAILED: could not add columns to Trip model");
    process.exit(1);
  }
  fs.copyFileSync(SCHEMA, SCHEMA + ".bak-stage-ts");
  fs.writeFileSync(SCHEMA, schema);
  console.log("ok: schema columns added");
} else {
  console.log("skip: schema already has approvedAt");
}

// 2) Stamp on transitions
let src = fs.readFileSync(FILE, "utf8");
const anchor = `  if (trip.status === 'Scheduled' && !trip.dispatchedAt) {
    const stamped = await prisma.trip.update({ where: { id: trip.id }, data: { dispatchedAt: new Date() } });
    trip.dispatchedAt = stamped.dispatchedAt;
  }`;

const addition = anchor + `
  // First TM approval = \"Seen\" for the partner; stamp it for the timeline.
  if (trip.status === 'Approved' && !trip.approvedAt) {
    const stamped = await prisma.trip.update({ where: { id: trip.id }, data: { approvedAt: new Date() } });
    trip.approvedAt = stamped.approvedAt;
  }
  // Fleet Ops assignment (driver/truck written) — stamp the first assignment.
  const assignmentWritten =
    raw.driverName !== undefined || raw.truckReg !== undefined || raw.tailNumber !== undefined;
  if (assignmentWritten && !trip.assignedAt && trip.status !== 'Requested' && trip.status !== 'Draft') {
    const stamped = await prisma.trip.update({ where: { id: trip.id }, data: { assignedAt: new Date() } });
    trip.assignedAt = stamped.assignedAt;
  }`;

if (src.includes(anchor)) {
  if (src.includes("approvedAt")) {
    console.log("skip: index.ts already stamps approvedAt");
  } else {
    src = src.replace(anchor, addition);
    fs.copyFileSync(FILE, FILE + ".bak-stage-ts");
    fs.writeFileSync(FILE, src);
    console.log("ok: index.ts stamps approvedAt + assignedAt");
  }
} else {
  console.error("PATCH FAILED: dispatchedAt stamp anchor not found");
  process.exit(1);
}
