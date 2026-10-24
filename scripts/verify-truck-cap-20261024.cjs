/**
 * E2E verification of TRUCK-CAP-AUTO — runs ON the API server (never locally).
 * Mints a short-lived JWT for an Active Platform Admin from the local .env
 * secret (the secret itself is never printed), then:
 *   1. POST a truck with a plate and NO cap      -> auto cap issued (P<max+1>)
 *   2. POST a truck with cap == plate            -> auto cap issued again
 *   3. POST a truck with a proper cap typed      -> that cap respected
 *   4. POST with no plate at all                 -> 400 with the readable error
 *   5. PATCH the first truck's cap to ""         -> kept a real cap
 *   6. DELETE both test trucks                   -> 204
 * Prints only status codes and cap values. Never prints the JWT secret.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const API = 'http://localhost:3001';

function readJwtSecret() {
  const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*(?:JWT(?:_SECRET)?|SECRET|AUTH_SECRET|JWT_KEY)\s*=\s*(.+)$/.exec(line);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

(async () => {
  try {
    const jwt = require('jsonwebtoken');
    const secret = readJwtSecret();
    if (!secret) { console.log('FAIL: no JWT secret found in .env — cannot mint a token'); process.exit(1); }

    const admin = await p.user.findFirst({ where: { role: { in: ['Platform Admin', 'Transport Manager'] }, status: 'Active' }, orderBy: { createdAt: 'asc' } });
    if (!admin) { console.log('FAIL: no Active admin/TM user to mint a token for'); process.exit(1); }
    const token = jwt.sign({ id: admin.id, name: admin.name, role: admin.role, roles: admin.roles }, secret, { expiresIn: '10m' });
    console.log('minted token for:', admin.name, admin.role);

    const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
    const post = (body) => fetch(API + '/api/trucks', { method: 'POST', headers: H, body: JSON.stringify(body) });
    const patch = (id, body) => fetch(API + '/api/trucks/' + id, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
    const del = (id) => fetch(API + '/api/trucks/' + id, { method: 'DELETE', headers: H });
    const made = [];

    // 1. plate only
    let r = await post({ registration: 'TEST900ZP', status: 'Available' });
    let t = await r.json();
    console.log('TEST1 plate-only  ->', r.status, '| cap:', t.cabId, '| plate:', t.registration);
    if (t.id) made.push(t.id);

    // 2. cap repeated into the plate field pair
    r = await post({ registration: 'TEST901ZP', cabId: 'test901zp', status: 'Available' });
    t = await r.json();
    console.log('TEST2 plate-as-cap->', r.status, '| cap:', t.cabId, '| plate:', t.registration);
    if (t.id) made.push(t.id);

    // 3. properly typed cap respected
    r = await post({ registration: 'TEST902ZP', cabId: 'P9999', status: 'Available' });
    t = await r.json();
    console.log('TEST3 typed cap   ->', r.status, '| cap:', t.cabId);
    if (t.id) made.push(t.id);

    // 4. no plate
    r = await post({ cabId: '' });
    console.log('TEST4 no plate    ->', r.status, '| error:', (await r.json()).error);

    // 5. cap cannot be blanked on edit
    if (made[0]) {
      r = await patch(made[0], { cabId: '' });
      t = await r.json();
      console.log('TEST5 blank on edit->', r.status, '| cap now:', t.cabId);
    }

    for (const id of made) {
      const d = await del(id);
      console.log('cleanup delete', id.slice(-6), '->', d.status);
    }
    console.log('cleanup remaining test trucks:', await p.truck.count({ where: { registration: { startsWith: 'TEST9' } } }));
    await p.$disconnect();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
