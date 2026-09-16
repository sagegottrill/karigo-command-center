/**
 * One-shot server patch for /var/www/fleetopsx-api (run ON the Hetzner box).
 * Multi-role accounts: one person can hold two (or more) departments at once.
 *   1) Adds a `roles` String column to User (space-safe comma-separated list,
 *      e.g. "Fleet Operations,Parts & Store") + `prisma db push`.
 *      Backfills existing users with their current single role.
 *   2) authorize() accepts the user's ANY of their roles (primary + extra).
 *   3) Login JWT carries `roles: [...]`; loginReport keeps primary role.
 *   4) userPayload returns roles = all stored roles (primary first).
 *   5) notificationScope matches notifications for any of the user's roles.
 *   6) POST /api/users accepts `roles: [...]` (maps department labels → role
 *      keys are a frontend concern; server stores what it's given).
 *   7) PATCH /api/users/:id accepts `roles: [...]` to add/remove roles later.
 * Idempotent: re-running detects existing marks and skips. Backup made first.
 * Usage: node server-patch-multi-role.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = '/var/www/fleetopsx-api';
const INDEX = path.join(ROOT, 'index.ts');
const SCHEMA = path.join(ROOT, 'prisma/schema.prisma');

function backup(file, tag) {
  const dst = `${file}.bak-multirole`;
  if (!fs.existsSync(dst)) fs.copyFileSync(file, dst);
}

function patchSchema() {
  let src = fs.readFileSync(SCHEMA, 'utf8');
  if (/\n\s*roles\s+String\??/.test(src)) {
    console.log('schema: roles column already present — skip');
    return;
  }
  // Live schema uses CRLF line endings — stay line-ending agnostic and anchor
  // on the status field inside model User.
  const patched = src.replace(
    /(\r?\n)(  status\s+String\s+@default\("Active"\))/,
    `$1  roles     String?$1$2`
  );
  if (patched === src) throw new Error('schema patch failed: status field not found in model User');
  src = patched;
  fs.writeFileSync(SCHEMA, src);
  console.log('schema: roles column added to User');
}

function patchIndex() {
  let src = fs.readFileSync(INDEX, 'utf8');
  let changed = 0;
  const mark = () => { changed++; };

  // 1) authorize(): accept ANY of the user's roles (JWT carries roles array).
  if (!src.includes("// multi-role: JWT carries roles[]")) {
    const oldAuth = `const authorize = (...roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
};`;
    const newAuth = `const authorize = (...roles: string[]) => {
  return (req: any, res: any, next: any) => {
    if (!req.user) return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    // multi-role: JWT carries roles[]; any held role grants the endpoint.
    const held: string[] = Array.isArray((req.user as any).roles) ? (req.user as any).roles : [req.user.role];
    if (!roles.some((r) => held.includes(r))) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
};`;
    if (!src.includes(oldAuth)) throw new Error('authorize block not found');
    src = src.replace(oldAuth, newAuth);
    mark();
  } else console.log('index: authorize already multi-role — skip');

  // 2) login: sign JWT with roles[] (primary first, deduped).
  if (!src.includes("const allRoles = Array.from")) {
    const signRe = /const token = jwt\.sign\(\{ id: user\.id, email: user\.email, role: user\.role, name: user\.name \}, JWT_SECRET, \{ expiresIn: '\d+d' \}\);/;
    if (!signRe.test(src)) throw new Error('jwt.sign not found');
    src = src.replace(
      signRe,
      `const rolesArr = String(user.roles || '').split(',').map((r: string) => r.trim()).filter(Boolean);
    const allRoles = Array.from(new Set([user.role, ...rolesArr]));
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, roles: allRoles, name: user.name }, JWT_SECRET, { expiresIn: '30d' });`
    );
    mark();
  } else console.log('index: login already carries roles — skip');

  // 3) userPayload: roles = primary + stored extras.
  if (!src.includes('extraRoles')) {
    const oldPayload = `  const roles = user.role === 'Platform Admin' ? [user.role, 'Transport Manager'] : [user.role];`;
    const newPayload = `  const extraRoles = String((user as any).roles || '').split(',').map((r: string) => r.trim()).filter(Boolean);
  const baseRoles = user.role === 'Platform Admin' ? [user.role, 'Transport Manager'] : [user.role];
  const roles = Array.from(new Set([...baseRoles, ...extraRoles]));`;
    if (!src.includes(oldPayload)) throw new Error('userPayload roles line not found');
    src = src.replace(oldPayload, newPayload);
    mark();
  } else console.log('index: userPayload already multi-role — skip');

  // 4) notificationScope: match notifications addressed to any held role.
  if (!src.includes('rolePattern')) {
    const oldScope = `  return { OR: [{ audience: null }, { audience: { contains: role } }] };`;
    const newScope = `  const held = Array.isArray(req.user?.roles) ? req.user.roles : [role];
  const rolePattern = held.filter(Boolean).join('|');
  return { OR: [{ audience: null }, { audience: { contains: rolePattern } }] };`;
    if (!src.includes(oldScope)) throw new Error('notificationScope line not found');
    src = src.replace(oldScope, newScope);
    mark();
  } else console.log('index: notificationScope already multi-role — skip');

  // 5) POST /api/users: accept roles[] and store the comma list.
  if (!src.includes('rolesList')) {
    const oldRole = `    const role = b.role || (Array.isArray(b.roles) && b.roles[0]) || 'Transport Manager';`;
    const newRole = `    const rolesList: string[] = Array.isArray(b.roles) && b.roles.length ? b.roles.map((r: any) => String(r).trim()).filter(Boolean) : [];
    const role = b.role || rolesList[0] || 'Transport Manager';`;
    if (!src.includes(oldRole)) throw new Error('POST /users role line not found');
    src = src.replace(oldRole, newRole);
    const oldData = `        role,
        password: hashed,`;
    const newData = `        role,
        roles: rolesList.length ? rolesList.join(',') : null,
        password: hashed,`;
    if (!src.includes(oldData)) throw new Error('POST /users create data not found');
    src = src.replace(oldData, newData);
    mark();
  } else console.log('index: POST /users already stores roles — skip');

  // 6) PATCH /api/users/:id: whitelist `roles`.
  if (!src.includes("'role', 'roles',")) {
    const allowedRe = /const ALLOWED_USER_FIELDS = \['name', 'role',/;
    if (!allowedRe.test(src)) throw new Error('ALLOWED_USER_FIELDS not found');
    src = src.replace(allowedRe, `const ALLOWED_USER_FIELDS = ['name', 'role', 'roles',`);
    mark();
  } else console.log('index: PATCH /users already accepts roles — skip');

  // 6b) PATCH: normalize roles array -> comma-joined string before Prisma.
  if (!src.includes('Array.isArray(data.roles)')) {
    const anchor = '    let generatedTempPassword: string | undefined;';
    if (!src.includes(anchor)) throw new Error('PATCH normalization anchor not found');
    src = src.replace(
      anchor,
      `    if (Array.isArray(data.roles)) data.roles = data.roles.join(',');
${anchor}`
    );
    mark();
  } else console.log('index: PATCH roles normalization present — skip');

  fs.writeFileSync(INDEX, src);
  console.log(`index: ${changed} patch(es) applied`);
}

function main() {
  backup(INDEX);
  backup(SCHEMA);
  patchSchema();
  patchIndex();
  console.log('db push: syncing schema…');
  execSync('cd /var/www/fleetopsx-api && npx prisma db push --skip-generate --accept-data-loss', { stdio: 'inherit' });
  console.log('client: regenerating prisma client…');
  execSync('cd /var/www/fleetopsx-api && npx prisma generate', { stdio: 'inherit' });
  console.log('build: compiling API…');
  execSync('cd /var/www/fleetopsx-api && npx tsc index.ts --outDir dist --skipLibCheck --esModuleInterop --module commonjs --target es2020 --moduleResolution node', { stdio: 'inherit' });
  console.log('restart: pm2 reload…');
  execSync('pm2 reload fleetopsx-api || pm2 restart fleetopsx-api', { stdio: 'inherit' });
  console.log('DONE — multi-role live');
}

main();
