/** Login as the Tracking account and try to raise a request — proves whether POST /api/trips 403s Tracking. */
const BASE = process.env.BASE || 'http://localhost:3001';
const EMAIL = process.argv[2] || 'tracking@petroline.ng';
const PASSWORD = process.argv[3] || 'Petroline@2026';

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: EMAIL, password: PASSWORD }),
  });
  const auth = await login.json();
  if (!login.ok || !auth.token) {
    console.error('login failed:', login.status, JSON.stringify(auth));
    process.exit(1);
  }
  console.log('login ok — role:', auth.user?.role ?? '?');

  const res = await fetch(`${BASE}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
    body: JSON.stringify({
      customer: 'Petroline',
      customerConsignee: 'Lifecycle Probe (delete me)',
      cargo: 'Probe',
      requestedTruckType: 'Flat',
      tailType: 'Flat',
      pickup: 'Probe Yard',
      dropoff: 'Probe Destination',
      status: 'Requested',
    }),
  });
  const body = await res.json().catch(() => ({}));
  console.log('POST /api/trips →', res.status, JSON.stringify(body).slice(0, 300));
  if (res.status === 201 || res.status === 200) {
    // Clean the probe row up so the TM's queue never sees it.
    const del = await fetch(`${BASE}/api/trips/${body.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    console.log('cleanup DELETE →', del.status);
  }
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
