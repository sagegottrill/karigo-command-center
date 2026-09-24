#!/usr/bin/env node
/** One-shot: insert the username-conflicts audit endpoint (idempotent). */
const fs = require("fs");
const { execSync } = require("child_process");

const FILE = "/var/www/fleetopsx-api/index.ts";
const backup = FILE + ".bak-login-dept";
if (!fs.existsSync(backup)) fs.copyFileSync(FILE, backup);

let src = fs.readFileSync(FILE, "utf8");
if (src.includes("username-conflicts")) {
  console.log("already present — skip");
  process.exit(0);
}
const CRLF = src.includes("\r\n");
const toFile = (s) => (CRLF ? s.replace(/\n/g, "\r\n") : s);

const ANCHOR = "app.patch('/api/users/me/password'";
if (!src.includes(ANCHOR)) { console.error("FAIL: anchor missing"); process.exit(1); }

const block = toFile(`// USERNAME_CONFLICT_V1 — every shared username local-part among ACTIVE users.
// The Manage Account page shows this so same-username collisions are visible
// before they become sign-in surprises.
app.get('/api/users/username-conflicts', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (_req, res) => {
  const users = await prisma.user.findMany({ where: { status: 'Active' }, select: { name: true, email: true, role: true, roles: true, createdAt: true }, orderBy: { createdAt: 'asc' } });
  const byLocal = new Map();
  for (const u of users) {
    const local = String(u.email || '').split('@')[0]?.toLowerCase();
    if (!local) continue;
    byLocal.set(local, [...(byLocal.get(local) || []), u]);
  }
  const conflicts = [...byLocal.entries()].filter(([, list]) => list.length > 1).map(([local, list]) => ({ username: local, accounts: list }));
  res.json({ conflicts });
});

`);

src = src.replace(ANCHOR, block + ANCHOR);
fs.writeFileSync(FILE, src);
console.log(execSync("pm2 restart fleetopsx-api 2>&1 | tail -1").toString());
setTimeout(() => {
  const health = execSync("sleep 2 && curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/tenants").toString();
  console.log("PATCHED — health HTTP " + health);
}, 100);
