/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * THE LOADING-SITE DROPDOWN WAS FILLING ITSELF. An earlier patch installed a
 * collector inside POST /api/trips that force-added EVERY loading site a
 * partner submitted with a request onto their company's saved list — so a
 * one-off pickup point typed through "Add your loading site" (or a stray typo
 * like "test") haunted the dropdown forever, and the portal's new explicit
 * "Save this site to my loading sites" checkbox was silently overridden by
 * the server saving the site anyway.
 *
 * This patch removes that collector from POST /api/trips. The ONLY way a site
 * joins a company's saved list from here on is the explicit POST
 * /api/partner-sites call the request form now makes when the partner ticks
 * the checkbox — the dropdown offers exactly what the partner chose to keep.
 *
 * The installed collector was found DUPLICATED (the original patch's
 * idempotency probe looked for a different string than it inserted, so a
 * re-run pasted a second copy); this patch removes every copy it recognises.
 *
 * Idempotent: safe to re-run.
 */
const fs = require("fs");
const INDEX = "/var/www/fleetopsx-api/index.ts";

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

const original = fs.readFileSync(INDEX, "utf8");
const MARKER = "// partner-sites-optin-patch: auto-collector removed from POST /api/trips";

if (original.includes(MARKER)) {
  console.log("already patched — nothing to do");
  process.exit(0);
}

// The collector, recognised line-by-line so small whitespace drift cannot
// hide a copy. Shape: comment, if, call, arg, arg, catch, closing brace.
const lines = original.split("\n");
const isComment = (l) => l.includes("one of THEIR sites");
const isIf = (l) => /^\s*if \(isPartner && partnerName\) \{\s*$/.test(l);
const isCall = (l) => l.includes("void addPartnerSites(");
const isArg1 = (l) => /^\s*partnerName,\s*$/.test(l);
const isArg2 = (l) =>
  l.includes("String(data.loadingSite || '')") &&
  l.includes("split(") &&
  l.includes("filter(Boolean)");
const isCatch = (l) => /^\s*\)\.catch\(\(\) => \{\}\);\s*$/.test(l);
const isClose = (l) => /^\s*\}\s*$/.test(l);

let removed = 0;
for (let i = 0; i < lines.length;) {
  if (
    i >= 2 &&
    isCall(lines[i]) &&
    isIf(lines[i - 1]) &&
    isComment(lines[i - 2]) &&
    isArg1(lines[i + 1]) &&
    isArg2(lines[i + 2]) &&
    isCatch(lines[i + 3]) &&
    isClose(lines[i + 4])
  ) {
    lines.splice(i - 2, 7);
    removed += 1;
    // stay on the same index: a duplicate may sit right behind this one
  } else {
    i += 1;
  }
}

if (removed === 0) {
  if (!original.includes("String(data.loadingSite || '')")) {
    console.log("no auto-collector found — nothing to do");
    process.exit(0);
  }
  console.error("FAIL: collector text present but not in the recognised shape");
  process.exit(1);
}

let src = lines.join("\n");

// Leave a marker beside the trip create so future patches can see the retire-
// ment (and the old collector patch can be taught to stand down).
const createAnchor = "const trip = await prisma.trip.create({ data });";
must(src.includes(createAnchor), "trip create anchor still present");
src = src.replace(createAnchor, createAnchor + "\n  " + MARKER);

must(!src.includes("one of THEIR sites"), "no collector comment remains");
must(!src.includes("String(data.loadingSite || '')"), "no collector body remains");

fs.writeFileSync(INDEX, src);
console.log("removed " + removed + " auto-collector block(s) from POST /api/trips");

// The explicit save path must be untouched: the addPartnerSites definition and
// its single caller inside POST /api/partner-sites.
const refs = (src.match(/addPartnerSites\(/g) || []).length;
must(
  refs === 2,
  "addPartnerSites survives only as definition + explicit route (found " + refs + ")",
);
console.log("ok: POST /api/partner-sites (the checkbox's save path) untouched");
