/**
 * One-shot server patch (run ON the Hetzner box).
 * Spec compliance for User lifecycle:
 *  1) DELETE /api/users/:id becomes a SOFT delete — set status 'Deleted',
 *     keep historical data (spec: "past actions remain permanently logged").
 *  2) GET /users computes lastActive from the latest LoginReport row
 *     (spec: "Report: tells you when a user login to the app").
 * Run with: node /tmp/patch-user-lifecycle.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const FILE = "/var/www/fleetopsx-api/index.ts";
fs.copyFileSync(FILE, FILE + ".bak-softdelete");
let src = fs.readFileSync(FILE, "utf8");

// --- 1. Soft delete ---
const oldDelete = `app.delete('/api/users/:id', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req, res) => {
  await prisma.user.delete({ where: { id: req.params.id } });
  res.status(204).end();
});`;
const newDelete = `app.delete('/api/users/:id', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req, res) => {
  // SOFT delete per spec: revoke access but keep every historical action
  // (trips, logs, audits) intact so operational/financial history is never corrupted.
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { status: 'Deleted' } });
    res.status(204).end();
  } catch (e: any) {
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'User not found' });
    throw e;
  }
});`;
if (!src.includes(oldDelete)) {
  console.error("FAIL: delete route not found");
  process.exit(1);
}
src = src.replace(oldDelete, newDelete);
console.log("ok: soft delete");

// --- 2. lastActive from latest login report ---
const oldList = `app.get('/api/users', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(users.map(userPayload));
});`;
const newList = `app.get('/api/users', authenticate, authorize('Transport Manager', 'Platform Admin', 'HR'), async (_req, res) => {
  const rows = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  // Spec: "Report tells you when a user logged in" — attach each user's latest
  // successful login timestamp from the login reports.
  const latestLogins = await prisma.loginReport.groupBy({ by: ['userId'], _max: { timestamp: true } });
  const lastLoginByUser = new Map(latestLogins.map((r) => [r.userId, r._max.timestamp]));
  res.json(rows.map((u) => ({
    ...userPayload(u),
    lastActive: lastLoginByUser.get(u.id) ? String(lastLoginByUser.get(u.id)) : 'Never',
  })));
});`;
if (!src.includes(oldList)) {
  console.error("FAIL: GET /users block not found");
  process.exit(1);
}
src = src.replace(oldList, newList);
console.log("ok: lastActive from login reports (GET /users)");

fs.writeFileSync(FILE, src);
console.log("PATCH OK — restart with: pm2 restart fleetopsx-api");
