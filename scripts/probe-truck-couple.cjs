/** Focused probe: does coupleTruckRegistry fire on departure for a fresh truck row? Poll after the PATCH. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const BASE = 'http://127.0.0.1:3001';
const tok = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'manager@petroline.ng', password: 'Petroline@2026' }) });
  const lj = await login.json();
  const H = { Authorization: 'Bearer ' + lj.token, 'Content-Type': 'application/json' };
  const truck = await (await fetch(`${BASE}/api/trucks`, { method: 'POST', headers: H, body: JSON.stringify({ cabId: 'E2E-P901', registration: 'E2E-PLATE-91', status: 'Available' }) })).json();
  console.log('truck row:', truck.cabId, '|', truck.registration, '| status:', truck.status);
  const trip = await fetch(`${BASE}/api/trips`, { method: 'POST', headers: H, body: JSON.stringify({ customer: 'E2E Poll', pickup: 'X', dropoff: 'Y', status: 'Scheduled', truckReg: `${truck.registration} / E2E-T901`, driverName: 'E2E Poll Driver' }) }).then((r) => r.json());
  console.log('trip:', trip.id);
  const dep = await fetch(`${BASE}/api/trips/${trip.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'En Route', startTime: '1 Nov 2026, 10:00', gateOutBy: 'S.1 Petroline' }) });
  console.log('departure:', dep.status);
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 600));
    const row = await p.truck.findUnique({ where: { id: truck.id } });
    console.log(`  t+${(i + 1) * 600}ms truck status:`, row.status);
    if (row.status === 'Out of Yard') break;
  }
  // Replicate the matcher by hand
  const keys = new Set();
  for (const v of [trip.truckReg, 'E2E-T901']) {
    const w = tok(v); if (w.length > 3) keys.add(w);
    for (const piece of String(v || '').split(/[^0-9a-zA-Z]+/)) { const k = tok(piece); if (k && k.length > 3) keys.add(k); }
  }
  const row = await p.truck.findUnique({ where: { id: truck.id } });
  const own = [tok(row.cabId), tok(row.registration)].filter((k) => k.length > 3);
  console.log('trip keys:', [...keys].join(', '));
  console.log('truck own keys:', own.join(', '));
  console.log('matcher would say:', own.some((o) => [...keys].includes(o)) ? 'MATCH' : 'NO MATCH');
  // cleanup
  await p.trip.delete({ where: { id: trip.id } }).catch((e) => console.log('trip del:', e.message.slice(0, 50)));
  await p.truck.delete({ where: { id: truck.id } }).catch(() => {});
  await p.$disconnect();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
