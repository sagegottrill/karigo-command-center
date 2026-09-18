/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * When the Transport Manager sends a request back to the partner, the correction
 * is saved with `partnerNote: null` — "I have fixed what you asked for". That
 * field was NOT in the partner's editable whitelist, so the clear was silently
 * dropped: the orange "Action" flag and the red "Action required — returned by
 * the Transport Manager" banner stayed on the partner's screen forever, which
 * reads as "my edit didn't work".
 *
 * Adds 'partnerNote' to PARTNER_EDITABLE_TRIP_FIELDS so a partner may clear the
 * note on their OWN request (ownership is already enforced by the company check
 * above the whitelist).
 */
const fs = require("fs");
const { execSync } = require("child_process");
const INDEX = "/var/www/fleetopsx-api/index.ts";

const src = fs.readFileSync(INDEX, "utf8");
const anchor =
  "  const PARTNER_EDITABLE_TRIP_FIELDS = [\n    'requestedTruckType',\n    'pickup',\n    'dropoff',\n    'customerConsignee',\n    'cargo',\n    'loadingSite',\n  ];";

if (src.includes("'loadingSite',\n    'partnerNote',")) {
  console.log("ok: partner whitelist already accepts partnerNote");
} else if (src.includes(anchor)) {
  fs.writeFileSync(
    INDEX,
    src.replace(anchor, anchor.replace("'loadingSite',", "'loadingSite',\n    // A partner may clear the TM's note once they have corrected the request.\n    'partnerNote',")),
  );
  console.log("ok: partner whitelist now accepts partnerNote (clear-on-correction)");
} else {
  console.error("FAIL: could not find PARTNER_EDITABLE_TRIP_FIELDS in index.ts");
  process.exit(1);
}

// tsx does not watch, so bounce the API so the route picks the change up.
try {
  execSync("pm2 restart fleetopsx-api", { stdio: "inherit" });
  console.log("ok: fleetopsx-api restarted");
} catch (e) {
  console.error("FAIL: pm2 restart failed — restart the API manually:", e.message);
  process.exit(1);
}
