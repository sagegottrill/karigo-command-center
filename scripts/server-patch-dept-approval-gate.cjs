#!/usr/bin/env node
/**
 * One-shot server patch (run ON the box) — DEPARTMENT APPROVAL GATE.
 *
 * Client, 29 Sept: Tracking, Diesel, Security and Accounts must see ONLY what
 * the Transport Manager has approved (his second approval = status Scheduled).
 * Pre-approval dispatches (Requested / Awaiting Approval / Approved) were
 * leaking into:
 *
 *   1) /api/lubricant/requests  — lubricantPending() excluded only
 *      Stopped/Declined/Completed/Returned, so a trip that merely CARRIED a
 *      lubricant request showed on the Diesel department's board before the
 *      TM cleared it. The gate now excludes everything below Scheduled.
 *
 *   2) /api/lubricant/overview  — counts.requests read the same pending list,
 *      so the department's tiles counted unapproved work. Now counts released
 *      work waiting to be pumped.
 *
 * Idempotent: probes before writing. Backs the file up. Restarts the API.
 */
const fs = require("fs");
const { execSync } = require("child_process");

const FILE = "/var/www/fleetopsx-api/index.ts";
const backup = FILE + ".bak-dept-approval-gate";

if (!fs.existsSync(FILE)) {
  console.error("FAIL: missing " + FILE);
  process.exit(1);
}
if (!fs.existsSync(backup)) fs.copyFileSync(FILE, backup);

let src = fs.readFileSync(FILE, "utf8");
const eol = src.includes("\r\n") ? "\r\n" : "\n";
const changed = [];

/* ------------------------------------------------------------------ 1 ---- */
/* lubricantPending(): the exclude-list becomes an include-list. A dispatch
 * joins the department's queue only once the TM's final approval is on it
 * (Scheduled) — and leaves it once poured (the caller filters `done`). */
const OLD_FILTER = "if (['Stopped', 'Declined', 'Completed', 'Returned'].includes(String(t.status))) continue;";
const NEW_FILTER = [
  "// DEPT_APPROVAL_GATE: departments see the Transport Manager's APPROVED work",
  "// only. His final approval IS status Scheduled; anything below it",
  "// (Requested / Awaiting Approval / Approved) is still his and Fleet Ops'",
  "// business — it never appears on the diesel board (client, 29 Sept).",
  "if (!LUBRICANT_RELEASED_STATUSES.includes(String(t.status ?? '').trim())) continue;",
].join(eol);

if (src.includes(OLD_FILTER)) {
  src = src.replace(OLD_FILTER, NEW_FILTER);
  changed.push("lubricantPending gates on LUBRICANT_RELEASED_STATUSES");
} else if (src.includes("DEPT_APPROVAL_GATE")) {
  changed.push("skip: pending filter already gated");
} else {
  console.error("FAIL: lubricantPending filter line not found — server layout changed");
  process.exit(1);
}

/* ------------------------------------------------------------------ 2 ---- */
/* The disbursal POST must never pour below the gate either — the gates patch
 * added `lubricantGate`; keep it (idempotent) and make sure the helper set
 * includes Completed so history rows keep rendering after return. */
if (!src.includes("LUBRICANT_RELEASED_STATUSES")) {
  const anchor = "function tripLubricantRequest(";
  if (!src.includes(anchor)) {
    console.error("FAIL: tripLubricantRequest anchor missing");
    process.exit(1);
  }
  const helper = [
    "// The lifecycle gate every lubricant screen and route shares with the UI:",
    "// the Transport Manager's final approval IS the release.",
    "const LUBRICANT_RELEASED_STATUSES = ['Scheduled', 'Loaded', 'En Route', 'Offloading', 'Returning', 'Delayed', 'Completed'];",
    "function lubricantGate(status: unknown) {",
    "  return LUBRICANT_RELEASED_STATUSES.includes(String(status ?? '').trim()) ? 'released' : 'waiting';",
    "}",
    "",
  ].join(eol);
  src = src.replace(anchor, helper + anchor);
  changed.push("inserted LUBRICANT_RELEASED_STATUSES helper");
} else {
  changed.push("skip: LUBRICANT_RELEASED_STATUSES already present");
}

fs.writeFileSync(FILE, src);
console.log("Wrote " + FILE);
for (const line of changed) console.log(" - " + line);

try {
  execSync("pm2 restart fleetopsx-api --update-env", { stdio: "inherit", cwd: "/var/www/fleetopsx-api" });
  console.log("ok: pm2 restart fleetopsx-api");
} catch (e) {
  console.error("WARN: pm2 restart failed (" + e.message + ") — restart the API manually");
}
