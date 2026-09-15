/**
 * One-shot server patch for /var/www/fleetopsx-api/index.ts (run ON the Hetzner box).
 * Closes the session-persistence + notification gaps found in the deep scrub:
 *   1) POST /api/auth/logout — route the frontend calls on sign-out (was 404).
 *   2) DELETE /api/users/:id becomes a SOFT delete (status 'Deleted', password
 *      scrambled, login blocked) per the User Access spec — hard delete
 *      corrupted historical/audit data.
 *   3) JWT lifetime 7d -> 30d: working drivers should not be logged out mid-week;
 *      logout is explicit (button), not implicit (token expiry surprise).
 *
 * Run with:  node /tmp/patch-sessions-logout.cjs   (after uploading)
 * Then:      pm2 restart fleetopsx-api
 * Idempotent: every step verifies its anchor and skips already-applied edits.
 */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");
const before = src;

const must = (cond, label) => {
  if (!cond) {
    console.error("PATCH FAILED AT: " + label);
    process.exit(1);
  }
  console.log("ok: " + label);
};

// --- 1. POST /api/auth/logout (idempotent stateless-JWT signout endpoint) ---
const logoutRoute = `
app.post('/api/auth/logout', authenticate, async (req: any, res) => {
  try {
    await prisma.loginReport.create({
      data: { userId: req.user.id, name: req.user.name || '', role: req.user.role || '', status: 'Logout' },
    });
  } catch {}
  res.json({ ok: true });
});

app.get('/api/auth/me', authenticate, async (req: any, res) => {`;
if (!src.includes("app.post('/api/auth/logout'")) {
  const meAnchor = "app.get('/api/auth/me', authenticate, async (req: any, res) => {";
  must(src.includes(meAnchor), "auth/me anchor");
  src = src.replace(meAnchor, logoutRoute);
  console.log("applied: POST /api/auth/logout");
} else {
  console.log("skip: logout route already present");
}

// --- 2. Soft delete for users (spec: revoke access, preserve audit history) ---
const oldDelete = `app.delete('/api/users/:id', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req, res) => {
  await prisma.user.delete({ where: { id: req.params.id } });
  res.status(204).end();
});`;
const newDelete = `// Soft delete per spec: revoke access + scramble password + hide from active
// dropdowns, but KEEP the row so historical trips/parts/fuel/audit records
// stay intact (hard delete corrupted financial and operational audits).
app.delete('/api/users/:id', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'User not found' });
  await prisma.user.update({
    where: { id: req.params.id },
    data: {
      status: 'Deleted',
      password: await bcrypt.hash(crypto.randomUUID(), 10),
      passwordResetRequired: true,
    },
  });
  res.status(204).end();
});`;
if (src.includes(oldDelete)) {
  src = src.replace(oldDelete, newDelete);
  console.log("applied: soft-delete users");
} else if (src.includes("status: 'Deleted'")) {
  console.log("skip: soft-delete already applied");
} else {
  must(false, "DELETE /users anchor");
}

// --- 3. JWT lifetime 7d -> 30d ---
if (src.includes("expiresIn: '7d'")) {
  src = src.replace("expiresIn: '7d'", "expiresIn: '30d'");
  console.log("applied: JWT 30d");
} else if (src.includes("expiresIn: '30d'")) {
  console.log("skip: JWT already 30d");
} else {
  must(false, "JWT expiresIn anchor");
}

must(src !== before || src.includes("app.post('/api/auth/logout'"), "changes applied");
fs.writeFileSync(FILE, src);
console.log("PATCH OK — restart the API (pm2 restart fleetopsx-api) to load it.");
