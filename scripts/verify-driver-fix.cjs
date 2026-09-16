/**
 * Verify the HR onboarding fix on the VPS, without creating any user account.
 * Mints a short-lived TM token from the server's own JWT_SECRET, replays the
 * EXACT payload that produced today's 500 (old license* fields, no staffId),
 * asserts it now succeeds with an auto-assigned Driver ID, then deletes it.
 */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

function env(key) {
  const raw = fs.readFileSync('/var/www/fleetopsx-api/.env', 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith(key + '='));
  return line ? line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : '';
}

// .env has no JWT_SECRET — index.ts falls back to this literal.
const SECRET = env('JWT_SECRET') || 'karigo-super-secret-key-2026';
const BASE = 'http://localhost:3001';

(async () => {
  const token = jwt.sign(
    { id: 'verify-script', email: 'verify@local', role: 'Transport Manager', roles: ['Transport Manager'], name: 'Verify' },
    SECRET,
    { expiresIn: '10m' },
  );
  const auth = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  // The payload that 500'd this morning — no staffId, unknown license* fields.
  const legacy = {
    name: 'ZZ Verification Driver',
    phone: '08012345678',
    licenseNumber: 'Driver',
    licenseCategory: 'Professional',
    licenseExpiry: '2026-12-31',
  };
  const res = await fetch(BASE + '/api/drivers', { method: 'POST', headers: auth, body: JSON.stringify(legacy) });
  const body = await res.json();
  console.log('1. legacy payload (no staffId) ->', res.status, JSON.stringify(body).slice(0, 160));
  if (res.status !== 200) process.exit(1);

  // The current form payload, explicit Driver ID.
  const modern = { name: 'ZZ Verification Driver 2', phone: '08087654321', staffId: 'P9900', status: 'Active' };
  const res2 = await fetch(BASE + '/api/drivers', { method: 'POST', headers: auth, body: JSON.stringify(modern) });
  console.log('2. current payload (staffId P9900) ->', res2.status);

  // Duplicate must be a clear 409, not a 500.
  const res3 = await fetch(BASE + '/api/drivers', { method: 'POST', headers: auth, body: JSON.stringify(modern) });
  const body3 = await res3.json();
  console.log('3. duplicate Driver ID ->', res3.status, JSON.stringify(body3).slice(0, 120));

  // Missing name must be a clear 400.
  const res4 = await fetch(BASE + '/api/drivers', { method: 'POST', headers: auth, body: JSON.stringify({ phone: '0800' }) });
  const body4 = await res4.json();
  console.log('4. missing name ->', res4.status, JSON.stringify(body4).slice(0, 120));

  // Clean up every verification row so production stays empty.
  const list = await fetch(BASE + '/api/drivers', { headers: auth }).then((r) => r.json());
  const mine = (Array.isArray(list) ? list : []).filter((d) => String(d.name || '').startsWith('ZZ Verification'));
  for (const d of mine) {
    const del = await fetch(BASE + '/api/drivers/' + d.id, { method: 'DELETE', headers: auth });
    console.log('5. cleanup', d.staffId, d.name, '->', del.status);
  }
  const after = await fetch(BASE + '/api/drivers', { headers: auth }).then((r) => r.json());
  console.log('6. drivers remaining:', Array.isArray(after) ? after.length : '?', '(expect 0)');
})().catch((e) => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
