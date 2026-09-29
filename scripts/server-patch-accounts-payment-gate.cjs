#!/usr/bin/env node
/**
 * One-shot server patch (run ON the box) — ACCOUNTS PAYMENT GATE.
 *
 * Client, 29 Sept: Accounts must only ever touch what the Transport Manager
 * has approved. The payment-capture endpoint accepted a payment for a dispatch
 * in ANY status, so Accounts could pay (and the ledger could total) a cost
 * sheet the manager has not cleared.
 *
 * This adds the same gate the client now ships: capture is refused unless the
 * dispatch's status is Scheduled or beyond (the LUBRICANT_RELEASED_STATUSES
 * list already on the box covers exactly that lifecycle).
 *
 * Idempotent. Backs the file up. Restarts the API.
 */
const fs = require("fs");
const { execSync } = require("child_process");

const DIR = "/var/www/fleetopsx-api";
const FILE = DIR + "/index.ts";
const backup = FILE + ".bak-accounts-payment-gate";

if (!fs.existsSync(FILE)) {
  console.error("FAIL: missing " + FILE);
  process.exit(1);
}
if (!fs.existsSync(backup)) fs.copyFileSync(FILE, backup);

let src = fs.readFileSync(FILE, "utf8");
const eol = src.includes("\r\n") ? "\r\n" : "\n";

if (src.includes("ACCOUNTS_PAYMENT_GATE")) {
  console.log("skip: payment gate already present");
  process.exit(0);
}

const ANCHOR =
  "app.post('/api/trips/:id/disbursement', authenticate, authorize('Accounts', 'Accountant', 'Platform Admin'), async (req: any, res) => {";
if (!src.includes(ANCHOR)) {
  console.error("FAIL: disbursement route anchor not found — layout changed");
  process.exit(1);
}

const GATE = [
  ANCHOR,
  "  try {",
  "    // ACCOUNTS_PAYMENT_GATE: the desk pays what the Transport Manager has",
  "    // CLEARED. His final approval is status Scheduled; anything below it",
  "    // (Requested / Awaiting Approval / Approved) is not yet a payable cost,",
  "    // and a declined or stopped dispatch never is.",
  "    const __pre = await prisma.trip.findUnique({ where: { id: req.params.id } });",
  "    if (!__pre) return res.status(404).json({ error: 'Dispatch not found' });",
  "    const __gateStatus = String(__pre.status ?? '').trim();",
  "    const __released = (typeof LUBRICANT_RELEASED_STATUSES !== 'undefined' && Array.isArray(LUBRICANT_RELEASED_STATUSES))",
  "      ? LUBRICANT_RELEASED_STATUSES",
  "      : ['Scheduled', 'Loaded', 'En Route', 'Offloading', 'Returning', 'Delayed', 'Completed'];",
  "    if (!__released.includes(__gateStatus)) {",
  "      return res.status(409).json({",
  "        error: 'The Transport Manager has not cleared this dispatch yet (status: ' + (__gateStatus || 'Requested') + ') — it cannot be paid until he approves it.',",
  "      });",
  "    }",
].join(eol);

src = src.replace(ANCHOR, GATE);
fs.writeFileSync(FILE, src);
console.log("Wrote " + FILE + " (payment gate inserted)");

try {
  execSync("pm2 restart fleetopsx-api --update-env", { stdio: "inherit", cwd: DIR });
  console.log("ok: pm2 restart fleetopsx-api");
} catch (e) {
  console.error("WARN: pm2 restart failed (" + e.message + ") — restart the API manually");
}
