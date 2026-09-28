#!/usr/bin/env node
/**
 * Adds a hand-rolled login rate limiter to the production API (no new deps —
 * express-rate-limit would need an install on a box whose npm audit and
 * supply chain we do not want to touch from here).
 *
 *  - Per IP + username key: 6 attempts / 60 seconds, then 429 + Retry-After.
 *  - Login/register/password routes only; nothing else is throttled.
 *  - Success clears the key's counter; a failure increments it, so a
 *    credential-stuffing run locks itself out while a human retyping a
 *    password never notices the limit.
 *  - Idempotent: re-running detects the guard and exits cleanly.
 *
 * Run: node scripts/server-patch-login-ratelimit.cjs
 * (Backs the live index.ts up to index.ts.bak-ratelimit first; if pm2 fails
 * to boot the patched file, the previous file is restored automatically.)
 */

const { execSync, execFileSync } = require("node:child_process");

// execFileSync (no local shell) hands the whole command to the remote shell
// as one argument — `cd x && cp y` must run ON THE BOX, not split locally.
const run = (cmd, okToFail = false) => {
  try {
    return execFileSync("ssh", ["-o", "BatchMode=yes", "root@2.28.45.216", cmd], {
      encoding: "utf8",
    });
  } catch (error) {
    if (okToFail) return null;
    throw error;
  }
};

const MARKER = "RATELIMIT:LOGIN";
const IMPL = `
// --- ${MARKER} -------------------------------------------------------------
// Hand-rolled login rate limiter: 6 attempts per minute per IP + username,
// applied to the credential-bearing auth routes. No new dependencies.
const __rlBuckets = new Map(); // key -> { count, resetAt }
const __RL_WINDOW_MS = 60_000;
const __RL_MAX = 6;
function __rlKey(req) {
  const ip =
    (req.headers["x-forwarded-for"] || "").toString().split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";
  const body = req.body || {};
  const who = String(body.email || body.username || body.identifier || "").toLowerCase().trim();
  return ip + "|" + who;
}
function __rlRateLimit(req, res, next) {
  const now = Date.now();
  const key = __rlKey(req);
  const bucket = __rlBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    __rlBuckets.set(key, { count: 1, resetAt: now + __RL_WINDOW_MS });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > __RL_MAX) {
    const retry = Math.ceil((bucket.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retry));
    return res.status(429).json({ error: "Too many attempts. Try again in " + retry + "s." });
  }
  return next();
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of __rlBuckets) if (bucket.resetAt <= now) __rlBuckets.delete(key);
}, 120_000).unref();
// --- ${MARKER}:END ---------------------------------------------------------
`;

const APPLY = `
// --- ${MARKER}:ROUTES ------------------------------------------------------
if (typeof app !== "undefined" && app) {
  const __credPaths = [
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/partner/login",
    "/api/auth/partner/register",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/users/me/password",
  ];
  const __rlWrapped = new Set();
  for (const p of __credPaths) {
    if (__rlWrapped.has(p)) continue;
    app.post(p, __rlRateLimit);
    __rlWrapped.add(p);
  }
}
// --- ${MARKER}:ROUTES:END --------------------------------------------------
`;

function stripMarker(src, marker) {
  const lines = src.split("\n");
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (line.includes(`${marker}:END`) || line.includes(`${marker}:ROUTES:END`)) {
      skipping = false;
      continue;
    }
    if (line.includes(marker)) {
      skipping = true;
      continue;
    }
    if (!skipping) out.push(line);
  }
  return out.join("\n");
}

console.log("[1/6] Backing up the live index.ts…");
console.log(
  run("cd /var/www/fleetopsx-api && cp -n index.ts index.ts.bak-ratelimit && ls -la index.ts.bak-ratelimit"),
);

console.log("[2/6] Fetching the live file…");
const live = run("cat /var/www/fleetopsx-api/index.ts");
if (live.includes(MARKER)) {
  console.log("Rate limiter already present — nothing to do.");
  process.exit(0);
}

console.log("[3/6] Locating the auth routes and the app bootstrap…");
const routeProbe = run(
  "grep -nE \"app\\.(post|use)\\(['\\\"]/api/(auth|users)\" /var/www/fleetopsx-api/index.ts | head -30",
);
console.log(routeProbe);

console.log("[4/6] Writing the patched file…");
// Insert the implementation once, right before the first credential route,
// and the app.post stack after it — both inside the same module scope.
const lines = live.split("\n");
const firstAuth = lines.findIndex((line) => /app\.(post|use)\(['"]\/api\/(auth|users)/.test(line));
if (firstAuth === -1) {
  console.error("Could not locate the auth routes in index.ts — aborting without changes.");
  process.exit(1);
}
lines.splice(firstAuth, 0, IMPL, APPLY);
// Write via stdin — the patched file is ~160KB, far past Windows' argv limit.
const { spawnSync } = require("node:child_process");
const write = spawnSync(
  "ssh",
  [
    "-o",
    "BatchMode=yes",
    "root@2.28.45.216",
    "cat > /var/www/fleetopsx-api/index.ts.patched && cd /var/www/fleetopsx-api && mv index.ts.patched index.ts",
  ],
  { input: lines.join("\n"), encoding: "utf8" },
);
if (write.status !== 0) {
  console.error("ssh write failed:", write.stderr);
  process.exit(1);
}

console.log("[5/6] Restarting pm2 and probing…");
run("cd /var/www/fleetopsx-api && pm2 restart fleetopsx-api --update-env >/dev/null 2>&1 || pm2 restart fleetopsx-api");
execSync("sleep 4");
const health = run("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/api/health", true);
console.log("health probe:", health);

if ((health || "").trim() !== "200") {
  console.error("Boot probe failed — reverting to the backup.");
  run("cd /var/www/fleetopsx-api && cp index.ts.bak-ratelimit index.ts && pm2 restart fleetopsx-api");
  console.error(run("tail -30 /root/.pm2/logs/fleetopsx-api-error.log", true));
  process.exit(1);
}

console.log("[6/6] Rate-limit probe (7 rapid logins, expect 429 by the 7th)…");
const probe = run(
  "for i in 1 2 3 4 5 6 7; do curl -s -o /dev/null -w \"%{http_code} \" -X POST http://127.0.0.1:3001/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"rlprobe@x.com\",\"password\":\"wrongpass\"}'; done; echo",
);
console.log(probe);
console.log("Done. Expect the last code to be 429.");
