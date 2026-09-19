/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * Trip.loadingSite is a STRING column, but the app models loading sites as a
 * LIST. Any client that still sends the array (a tab running a bundle from
 * before the frontend fix, or a future caller) made Prisma reject the whole
 * write — `Argument loadingSite: Invalid value provided. Expected String …
 * provided (String, String)` — and the partner saw a 500 with no way to correct
 * their request. This coerces on the server so the API is correct regardless of
 * which bundle is in the wild.
 *
 * Idempotent: re-running is a no-op once the guard is present.
 */
const fs = require("fs");

const FILE = "/var/www/fleetopsx-api/index.ts";
const ANCHOR = `  const raw = { ...req.body };
  const data: any = {};
  for (const key of ALLOWED_TRIP_FIELDS) {
    if (raw[key] !== undefined) data[key] = raw[key];
  }`;

const PATCHED = `${ANCHOR}
  // loadingSite is a String column; a list payload is joined, never rejected.
  if (Array.isArray(data.loadingSite)) {
    data.loadingSite = data.loadingSite.filter(Boolean).join(', ') || null;
  }`;

const src = fs.readFileSync(FILE, "utf8");
if (src.includes("a list payload is joined, never rejected")) {
  console.log("ok: loadingSite coercion already present");
  process.exit(0);
}
if (!src.includes(ANCHOR)) {
  console.error("FAIL: could not find the PATCH /trips whitelist block to patch");
  process.exit(1);
}
fs.writeFileSync(FILE + ".bak-loadingsite", src);
fs.writeFileSync(FILE, src.replace(ANCHOR, PATCHED));
console.log("ok: PATCH /api/trips now coerces an array loadingSite (backup: index.ts.bak-loadingsite)");
