/**
 * Server repair: the voucher alert line cannot parse.
 *
 * `scripts/server-patch-voucher-review.cjs` writes its route body from a JS
 * template literal, and one line meant to open a quoted "'s" was written as a
 * `\u2019` escape. The escape is interpolated by the template literal, so the
 * box received a literal typographic apostrophe in code position:
 *
 *     what + ’s direct-cost voucher was ' + ...
 *
 * esbuild refuses to transform the file, the API never boots, and every /api
 * call answered 502 — including the TM's own voucher list. The string is
 * repaired to a plain quoted "'s"; nothing else about the route changes.
 *
 * Run ON the box from /var/www/fleetopsx-api, then: pm2 restart fleetopsx-api
 */
const fs = require("fs");

const INDEX = "/var/www/fleetopsx-api/index.ts";

const BROKEN = "what + \u2019s direct-cost voucher was '";
const FIXED = 'what + "\'s direct-cost voucher was "';

const raw = fs.readFileSync(INDEX, "utf8");

if (!raw.includes(BROKEN)) {
  console.log(raw.includes(FIXED)
    ? "ok: the voucher alert line is already quoting properly — nothing to do"
    : "unexpected: the broken line was not found — inspect index.ts by hand");
  process.exit(raw.includes(FIXED) ? 0 : 1);
}

const next = raw.split(BROKEN).join(FIXED);
fs.writeFileSync(INDEX, next);
console.log("ok: voucher alert apostrophe repaired");

// Any other smart punctuation sitting in code position is the same class of bug.
const suspects = (next.match(/[\u2018\u2019\u201C\u201D]/g) || []).length;
console.log("smart quote characters remaining in the file:", suspects);
