/**
 * One-shot server patch (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * REMOVES POST /api/lubricant/approvals — the legacy "release litres" endpoint.
 *
 * The release IS the Transport Manager's final approval in the request
 * lifecycle; no screen has called this endpoint since. It was also the only
 * writer of the legacy litres stamps (trip.directCosts.lubricantApproved*)
 * — those stamps are still READ by the pump cap and the boards, so they are
 * left untouched: the endpoint dies, the historical figures stay readable.
 *
 * The block is removed line-anchored (comment banner through the route's
 * closing "});") so drift in the body cannot stop the removal. Idempotent:
 * safe to re-run.
 */
const fs = require("fs");
const INDEX = "/var/www/fleetopsx-api/index.ts";

const must = (ok, label) => {
  if (!ok) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

const raw = fs.readFileSync(INDEX, "utf8");

if (raw.includes("// lubricant-approvals-endpoint-removed")) {
  console.log("already patched — nothing to do");
  process.exit(0);
}

const lines = raw.split(/\r?\n/);
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

const findLine = (re, from = 0) => {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i])) return i;
  return -1;
};

const bannerIdx = findLine(/^\/\/ ---- Authorization: the Transport Manager releasing litres/);
const routeIdx = findLine(/^app\.post\('\/api\/lubricant\/approvals'/);
const overviewIdx = findLine(/^app\.get\('\/api\/lubricant\/overview'/);

if (bannerIdx === -1 && routeIdx === -1) {
  console.log("no approvals endpoint found — nothing to do");
  process.exit(0);
}

must(routeIdx !== -1, "approvals route found");
must(
  bannerIdx !== -1 && bannerIdx < routeIdx && routeIdx - bannerIdx <= 6,
  "banner sits just above the route",
);
must(overviewIdx > routeIdx, "overview route follows the approvals route");

// Walk back from the overview route to find the approvals route's closing
// "};" — the last blank line before it belongs to the removed block too.
let closeIdx = -1;
for (let i = overviewIdx - 1; i > routeIdx; i--) {
  if (/^\}\);\s*$/.test(lines[i])) {
    closeIdx = i;
    break;
  }
}
must(closeIdx !== -1, "approvals route closing found");

// Sanity: the body we are deleting must be THIS endpoint's — it stamps the
// legacy litres model and returns an approval payload.
const body = lines.slice(routeIdx, closeIdx + 1).join("\n");
must(body.includes("lubricantApprovedLitres"), "route body is the litres stamper");
must(body.includes("app.post('/api/lubricant/approvals'"), "route body is the approvals route");

// The removed span starts at the banner comment; keep exactly one blank line
// between whatever precedes it and the overview route.
let start = bannerIdx;
while (start > 0 && lines[start - 1].trim() === "") start -= 1;
let end = closeIdx;
while (end + 1 < lines.length && lines[end + 1].trim() === "") end += 1;

lines.splice(start, end - start + 1);
// ensure a single separating blank line
if (
  start > 0 &&
  lines[start - 1].trim() !== "" &&
  (lines[start] === undefined || lines[start].trim() !== "")
) {
  lines.splice(start, 0, "");
}

let src = lines.join(eol);

// Leave a marker where the endpoint used to be, so future patch authors can
// see it was retired deliberately (and probes can assert the removal).
const anchor = "app.get('/api/lubricant/overview', authenticate, async (_req: any, res) => {";
must(src.includes(anchor), "overview anchor intact");
src = src.replace(
  anchor,
  "// lubricant-approvals-endpoint-removed: the release is the Transport Manager's\n" +
    "// final approval in the request lifecycle; the legacy litres endpoint had no\n" +
    "// callers and was removed (scripts/server-patch-remove-lubricant-approvals.cjs).\n" +
    anchor,
);

must(!src.includes("/api/lubricant/approvals"), "no approvals route remains");
must(src.includes("tripLubricantApproval"), "approval READER helper survives");
must(src.includes("lubricantApprovedLitres"), "historical stamp readers survive");

fs.writeFileSync(INDEX, src);
console.log("removed POST /api/lubricant/approvals (" + (closeIdx - routeIdx + 1) + " lines)");
