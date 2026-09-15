/**
 * One-shot server patch: let a partner MODIFY their own request's truck type.
 * `requestedTruckType` joins the patchable trip fields; the Fleet Ops assignment
 * writes `tailType`/`tailNumber` and never touches it.
 */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");

const anchor =
  "const ALLOWED_TRIP_FIELDS = ['driverName', 'truckReg', 'tailType',";
if (src.includes("'requestedTruckType'")) {
  console.log("skip: requestedTruckType already patchable");
} else if (src.includes(anchor)) {
  src = src.replace(
    anchor,
    "const ALLOWED_TRIP_FIELDS = ['driverName', 'truckReg', 'requestedTruckType', 'tailType',",
  );
  fs.writeFileSync(FILE, src);
  console.log("ok: requestedTruckType added to ALLOWED_TRIP_FIELDS");
} else {
  console.error("PATCH FAILED: ALLOWED_TRIP_FIELDS anchor not found");
  process.exit(1);
}
console.log("DONE — pm2 restart fleetopsx-api");
