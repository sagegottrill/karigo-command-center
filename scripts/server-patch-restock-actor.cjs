#!/usr/bin/env node
/**
 * One-shot server patch (run ON the box) — RESTOCK-ACTOR.
 *
 * The lubricant restock (POST /api/lubricant/restocks) demanded a hand-typed
 * "loggedBy" from the client, so the modal showed a "Logged by" picker even
 * though only the Transport Manager can perform the action — and he is already
 * signed in. The record now carries the name on the TOKEN (actingUser), never
 * a name somebody typed: the server derives it and the 400 for a missing
 * loggedBy is gone.
 *
 * Idempotent. Backs the file up. esbuild-verifies before writing.
 * Restarts the API.
 */
const fs = require("fs");
const { execFileSync, execSync } = require("child_process");

const FILE = "/var/www/fleetopsx-api/index.ts";
const backup = FILE + ".bak-restock-actor";

if (!fs.existsSync(FILE)) {
  console.error("FAIL: missing " + FILE);
  process.exit(1);
}
if (!fs.existsSync(backup)) fs.copyFileSync(FILE, backup);

let src = fs.readFileSync(FILE, "utf8").replace(/\r\n/g, "\n");

const must = (cond, label) => {
  if (!cond) {
    console.error("FAIL: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

const OLD_BLOCK = [
  "  const loggedBy = String(req.body?.loggedBy || '').trim();",
  "  if (!LUBRICANT_TYPES.includes(fuelType)) return res.status(400).json({ error: 'fuelType must be Diesel or Gas' });",
  "  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });",
  "    const unitCost = Number(req.body?.unitCost);",
  "    const restockCost = Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null;",
  "  if (!loggedBy) return res.status(400).json({ error: 'loggedBy is required' });",
].join("\n");

const NEW_BLOCK = [
  "  // RESTOCK-ACTOR — the person doing this IS the authenticated account: the",
  "  // restock is stamped with the name on the token, never a name somebody",
  "  // typed into a form (the modal no longer even asks).",
  "  const loggedBy = actingUser(req);",
  "  if (!LUBRICANT_TYPES.includes(fuelType)) return res.status(400).json({ error: 'fuelType must be Diesel or Gas' });",
  "  if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });",
  "    const unitCost = Number(req.body?.unitCost);",
  "    const restockCost = Number.isFinite(unitCost) && unitCost > 0 ? unitCost : null;",
].join("\n");

must(src.includes("const actingUser = (req: any) =>"), "actingUser helper present");

if (src.includes("RESTOCK-ACTOR")) {
  console.log("skip: patch already applied");
} else if (src.includes(OLD_BLOCK)) {
  src = src.replace(OLD_BLOCK, NEW_BLOCK);
  console.log("ok: restock endpoint stamps the acting user");
} else {
  console.error("FAIL: /api/lubricant/restocks block not found — layout changed");
  process.exit(1);
}

fs.writeFileSync("/tmp/index.restock-actor.ts", src);
const ESBUILD = "/var/www/fleetopsx-api/node_modules/.bin/esbuild";
try {
  execFileSync(ESBUILD, ["/tmp/index.restock-actor.ts", "--outfile=/tmp/index.restock-actor.js"], { stdio: "pipe" });
  console.log("ok: esbuild compiles the patched file");
} catch (e) {
  console.error("FAIL: esbuild rejected the patch — nothing written");
  console.error(String(e.stderr || e.message).split("\n").slice(0, 12).join("\n"));
  process.exit(1);
}

fs.writeFileSync(FILE, src);
console.log("Wrote " + FILE);

try {
  execSync("pm2 restart fleetopsx-api --update-env", { stdio: "inherit", cwd: "/var/www/fleetopsx-api" });
  console.log("ok: pm2 restart fleetopsx-api");
} catch (e) {
  console.error("WARN: pm2 restart failed (" + e.message + ") — restart the API manually");
}
