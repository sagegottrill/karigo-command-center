/**
 * One-account check for the restored "Select Department" sign-in field.
 *
 * Run ON the VPS (it talks to the API on localhost:3001 and mints a TM token
 * from the server's own JWT secret, so no real password is needed):
 *
 *   MODE=create node verify-login-department.cjs   # create the temp 2-role user
 *   MODE=delete node verify-login-department.cjs   # remove EVERY trace of it
 *
 * The account holds TWO departments (Fleet Operations + Security) so the UI can
 * be driven for real: pick the matching department (lands in that portal), then
 * pick one it does not hold (must refuse and stay on the sign-in screen).
 */
const fs = require('fs');
const jwt = require('jsonwebtoken');

function env(key) {
  const raw = fs.readFileSync('/var/www/fleetopsx-api/.env', 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith(key + '='));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}

const SECRET = env('JWT_SECRET') || 'karigo-super-secret-key-2026';
const BASE = 'http://localhost:3001';
const USERNAME = 'ZZ.LoginDept';
const PASSWORD = 'ZzDept#2026Test';
const MARK = 'ZZ LoginDept';

const token = jwt.sign(
  { id: 'verify-script', email: 'verify@local', role: 'Transport Manager', roles: ['Transport Manager'], name: 'Verify' },
  SECRET,
  { expiresIn: '20m' },
);
const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

(async () => {
  const mode = String(process.env.MODE || 'create').toLowerCase();

  if (mode === 'delete') {
    const users = await fetch(BASE + '/api/users', { headers: auth }).then((r) => r.json());
    const mine = (Array.isArray(users) ? users : []).filter(
      (u) => String(u.name || '').includes(MARK) || String(u.email || '').toLowerCase().startsWith('zz.logindept'),
    );
    for (const u of mine) {
      const del = await fetch(BASE + '/api/users/' + u.id, { method: 'DELETE', headers: auth });
      console.log('deleted', u.email, '->', del.status);
    }
    const after = await fetch(BASE + '/api/users', { headers: auth }).then((r) => r.json());
    const left = (Array.isArray(after) ? after : []).filter((u) => String(u.name || '').includes(MARK));
    console.log('remaining test users:', left.length, '(expect 0)');
    console.log('users in DB now:', Array.isArray(after) ? after.length : '?');
    return;
  }

  // Create: real endpoint, real payload shape (exactly what New Account sends).
  const res = await fetch(BASE + '/api/users', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({
      firstName: 'ZZ',
      surname: 'LoginDept',
      username: USERNAME,
      roles: ['Fleet Operations', 'Security'],
      role: 'Fleet Operations',
      department: 'Fleet Operations',
      staffId: 'P9998',
      password: PASSWORD,
      // Test-only: skip the forced first-login reset so the portal entry is testable.
      passwordResetRequired: false,
    }),
  });
  const body = await res.json();
  console.log('1. create user ->', res.status, JSON.stringify(body).slice(0, 200));
  if (res.status !== 200) process.exit(1);

  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  const session = await login.json();
  console.log('2. login as temp user ->', login.status, JSON.stringify(session.user).slice(0, 240));
  console.log('   username:', USERNAME, '| password:', PASSWORD);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
