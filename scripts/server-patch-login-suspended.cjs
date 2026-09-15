/**
 * One-shot server patch (run ON the Hetzner box).
 * Login fix: the no-domain username path must NEVER fall back to an unverified
 * candidate — when the password failed against every match it used to assign
 * candidates[0] (often an old DELETED test account) and then report
 * "Account suspended" instead of "Invalid credentials". Now:
 *   - only Active accounts are password-probed,
 *   - no fallback assignment: failed password = Invalid credentials,
 *   - suspended/deleted matches get an explicit, honest message.
 * Run with: node /tmp/patch-login-suspended.cjs && pm2 restart fleetopsx-api
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

const oldBlock = `    if (!user && !String(req.body?.email || req.body?.username || '').includes('@')) {
      const candidates = await prisma.user.findMany({
        where: { email: { startsWith: \`\${email}@\`, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
      });
      for (const candidate of candidates) {
        if (await bcrypt.compare(password, candidate.password)) { user = candidate; break; }
      }
      if (!user && candidates.length > 0) user = candidates[0];
    }
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status === 'Suspended' || user.status === 'Deleted') return res.status(401).json({ error: 'Account suspended' });`;

const newBlock = `    if (!user && !String(req.body?.email || req.body?.username || '').includes('@')) {
      // Username-only login: try the password against every name-match, but ONLY
      // Active ones — probing (or falling back to) a Deleted/Suspended account
      // made real users see "Account suspended" for a simple typo.
      const candidates = await prisma.user.findMany({
        where: { email: { startsWith: \`\${email}@\`, mode: 'insensitive' }, status: 'Active' },
        orderBy: { createdAt: 'asc' },
      });
      for (const candidate of candidates) {
        if (await bcrypt.compare(password, candidate.password)) { user = candidate; break; }
      }
      if (!user && candidates.length > 0) {
        // Right username, wrong password — never impersonate another match.
        return res.status(401).json({ error: 'Invalid credentials' });
      }
    }
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status === 'Suspended') return res.status(401).json({ error: 'Your account has been suspended. Contact your administrator.' });
    if (user.status === 'Deleted') return res.status(401).json({ error: 'Invalid credentials' });`;

if (src.includes(oldBlock)) {
  src = src.replace(oldBlock, newBlock);
  console.log("ok: login fallback hardened");
} else if (src.includes("status: 'Active' },")) {
  console.log("skip: patch already applied");
} else {
  console.error("PATCH FAILED: login block not found in expected form");
  process.exit(1);
}

if (src !== before) {
  fs.writeFileSync(FILE, src);
  console.log("written");
} else {
  console.log("no changes");
}
