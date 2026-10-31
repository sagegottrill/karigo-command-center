/** Debug: is a fresh Scheduled trip with a lubricant allocation on the desk list? */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const BASE = 'http://127.0.0.1:3001';
(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'manager@petroline.ng', password: 'Petroline@2026' }) });
  const lj = await login.json();
  const H = { Authorization: 'Bearer ' + lj.token, 'Content-Type': 'application/json' };
  const trip = await fetch(`${BASE}/api/trips`, { method: 'POST', headers: H, body: JSON.stringify({ customer: 'E2E Desk Debug', pickup: 'X', dropoff: 'Y', status: 'Scheduled', truckReg: 'E2E-DD / E2E-DDT', driverName: 'E2E Desk Driver', directCosts: { lubricantType: 'Diesel', lubricantQuantity: 10 } }) }).then((r) => r.json());
  console.log('trip:', trip.id, '| directCosts:', JSON.stringify(trip.directCosts));
  const rows = await fetch(`${BASE}/api/lubricant/requests`, { headers: H }).then((r) => r.json());
  const mine = rows.find((r) => r.id === trip.id);
  console.log('desk rows:', rows.length, '| mine on the list:', Boolean(mine), mine ? '| status: ' + mine.status + ' | request: ' + JSON.stringify(mine.request) : '');
  if (!mine && rows[0]) console.log('sample row keys:', Object.keys(rows[0]).join(','));
  await p.trip.delete({ where: { id: trip.id } }).catch(() => {});
  await p.$disconnect();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
