#!/usr/bin/env node
/**
 * One-shot server patch (run ON the box) — Username collision + department sign-in:
 *
 *  1) DEPARTMENT DECIDES: the sign-in form's "Select Department" is now a hard
 *     server filter. Username-only logins match every account sharing the local
 *     part; candidates holding the picked department are tried FIRST, and an
 *     account that does NOT hold the picked department is refused outright
 *     (403) even with the right password — the oldest match can no longer
 *     hijack the sign-in.
 *  2) CREATION WARNS: POST /users reports `usernameConflict` when another
 *     ACTIVE account already uses the same local part, so the TM sees it at
 *     creation instead of at first sign-in.
 *  3) AUDIT: GET /users/username-conflicts lists every shared local part for
 *     the Manage Account page.
 *
 * Idempotent, backs up, restarts the API.
 */
const fs = require("fs");
const { execSync } = require("child_process");

const FILE = "/var/www/fleetopsx-api/index.ts";
const backup = FILE + ".bak-login-dept";
if (!fs.existsSync(FILE)) { console.error("FAIL: missing " + FILE); process.exit(1); }
if (!fs.existsSync(backup)) fs.copyFileSync(FILE, backup);

let src = fs.readFileSync(FILE, "utf8");
let changed = 0;

// The live file carries CRLF endings — every literal block below is written
// with LF, so swap to the file's own convention before matching.
const CRLF = src.includes("\r\n");
const toFile = (s) => (CRLF ? s.replace(/\n/g, "\r\n") : s);

// ---- 1. Department-aware username login ------------------------------------
const LOGIN_ANCHOR = `    if (!user && !String(req.body?.email || req.body?.username || '').includes('@')) {`;
if (src.includes("LOGIN_DEPT_V1")) {
  console.log("login: already patched — skip");
} else if (!src.includes(LOGIN_ANCHOR)) {
  console.error("FAIL: login anchor not found");
  process.exit(1);
} else {
  const old = toFile(`      const candidates = await prisma.user.findMany({
        where: { email: { startsWith: \`\${email}@\`, mode: 'insensitive' }, status: 'Active' },
        orderBy: { createdAt: 'asc' },
      });
      for (const candidate of candidates) {
        if (await bcrypt.compare(password, candidate.password)) { user = candidate; break; }
      }`);
  const replacement = toFile(`      // LOGIN_DEPT_V1 — the department picked on the sign-in form decides which
      // account a shared username opens. Candidates NOT holding the department
      // are excluded entirely: with the right password they are refused, so the
      // oldest same-username account can never answer for the newest one.
      const wantedDept = String(req.body?.department || '').trim();
      const wantedRoles = wantedDept ? departmentRoleKeys(wantedDept) : null;
      const candidates = await prisma.user.findMany({
        where: { email: { startsWith: \`\${email}@\`, mode: 'insensitive' }, status: 'Active' },
        orderBy: { createdAt: 'asc' },
      });
      const holdsWanted = (u) => {
        const own = String(u.roles || '').split(',').map((r) => r.trim()).filter(Boolean).concat([u.role]);
        return wantedRoles ? own.some((r) => wantedRoles.includes(r)) : true;
      };
      const pool = wantedDept ? candidates.filter(holdsWanted) : candidates;
      if (wantedDept && pool.length === 0) {
        return res.status(403).json({ error: \`None of the accounts using username "\${email}" belong to \${wantedDept}. Pick the department on your credentials, or leave the department blank.\` });
      }
      for (const candidate of pool) {
        if (await bcrypt.compare(password, candidate.password)) { user = candidate; break; }
      }`);
  if (!src.includes(old)) { console.error("FAIL: candidates block not found"); process.exit(1); }
  src = src.replace(old, replacement);
  changed++;
  console.log("login: department filter installed");
}

// ---- 2. helper departmentRoleKeys on the server -----------------------------
if (!src.includes("function departmentRoleKeys")) {
  const ANCHOR2 = "const JWT_SECRET =";
  if (!src.includes(ANCHOR2)) { console.error("FAIL: JWT anchor not found"); process.exit(1); }
  src = src.replace(ANCHOR2, `// LOGIN_DEPT_V1 — Figma department label → RoleKeys the account may hold.\nfunction departmentRoleKeys(department) {\n  const map = {\n    'Transport Admin': ['Transport Manager', 'Platform Admin'],\n    'Fleet Operations': ['Fleet Operations', 'Fuel Management', 'Fuel Manager'],\n    'Tracking Operations': ['Tracking', 'Tracking Operations'],\n    'Loading Operations': ['Loading', 'Loading Operations'],\n    'Lubricant': ['Lubricant', 'Lubricant Manager', 'Lubricant Operations', 'Fuel Manager'],\n    'Fuel Management': ['Fleet Operations', 'Fuel Manager', 'Lubricant'],\n    'Engineering and Maintenance': ['Engineering'],\n    'Parts and Store': ['Parts & Store', 'Parts and Store', 'Inventory', 'Head of Inventory', 'Store Floor Attendant'],\n    'Accounts': ['Accounts', 'Accountant'],\n    'HR and Personnel': ['HR', 'HR & Personnel', 'HR and Personnel'],\n    'Security': ['Security', 'Gate Security', 'Gate'],\n    'Drivers': ['Driver'],\n  };\n  return map[department] || [department];\n}\n\nconst JWT_SECRET =`);
  changed++;
  console.log("helper: departmentRoleKeys added");
} else {
  console.log("helper: already present — skip");
}

// ---- 3. Creation conflict warning -------------------------------------------
const CREATE_ANCHOR = "    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });";
if (src.includes("USERNAME_CONFLICT_V1")) {
  console.log("create: already patched — skip");
} else if (!src.includes(CREATE_ANCHOR)) {
  console.log("create: anchor not found — skip (inspect manually)");
} else {
  src = src.replace(
    CREATE_ANCHOR,
    toFile(`    // USERNAME_CONFLICT_V1 — an exact-email match is an error, but a SHARED
    // username (same local part, different domain) is only a warning: legal for
    // partner domains, confusing for sign-in. The TM is told AT CREATION.
    let usernameConflict = null;
    if (username) {
      const clash = await prisma.user.findMany({
        where: { email: { startsWith: \`\${username}@\`, mode: 'insensitive' }, status: 'Active', NOT: { email: { equals: email, mode: 'insensitive' } } },
        select: { email: true, role: true, name: true }, take: 3,
      });
      if (clash.length) usernameConflict = clash;
    }
    const existing = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });`),
  );
  src = src.replace(
    "    res.json({ ...userPayload(user), seededLoadingSites });",
    "    res.json({ ...userPayload(user), seededLoadingSites, usernameConflict });",
  );
  changed++;
  console.log("create: conflict warning wired");
}

// ---- 4. Conflict report endpoint --------------------------------------------
if (!src.includes("'/api/users/username-conflicts'")) {
  const ANCHOR3 = "app.get('/api/users/me/password'";
  if (src.includes(ANCHOR3)) {
    src = src.replace(
      ANCHOR3,
      toFile(`// USERNAME_CONFLICT_V1 — every shared username local-part among ACTIVE users.
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

app.get('/api/users/me/password'`),
    );
    changed++;
    console.log("audit: username-conflicts endpoint added");
  } else {
    console.log("audit: anchor not found — skip");
  }
} else {
  console.log("audit: already present — skip");
}

if (!changed) { console.log("NOTHING CHANGED — no restart"); process.exit(0); }
fs.writeFileSync(FILE, src);
console.log(execSync("pm2 restart fleetopsx-api 2>&1 | tail -1").toString());
setTimeout(() => {
  try {
    const health = execSync("sleep 2 && curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/api/tenants").toString();
    console.log("PATCHED (" + changed + " edits) — health HTTP " + health);
  } catch { console.log("PATCHED — restart issued"); }
}, 100);
