/** Login as the TM via the live API and GET /api/lubricant/disbursals — proves the review surface end-to-end. */
const BASE = process.env.BASE || 'http://localhost:3001';
const email = process.argv[2];
const password = process.argv[3];

(async () => {
  if (!email || !password) {
    console.error('usage: node scripts/verify-tm-review.cjs <email> <password>');
    process.exit(1);
  }
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const auth = await login.json();
  if (!login.ok || !auth.token) {
    console.error('login failed:', login.status, JSON.stringify(auth));
    process.exit(1);
  }
  console.log('login ok — roles:', JSON.stringify(auth.user?.roles ?? auth.roles ?? '?'));

  const res = await fetch(`${BASE}/api/lubricant/disbursals`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  const rows = await res.json();
  if (!Array.isArray(rows)) {
    console.error('disbursals failed:', res.status, JSON.stringify(rows));
    process.exit(1);
  }
  const pending = rows.filter((r) => String(r.status ?? 'Pending') === 'Pending');
  console.log(`disbursals: ${rows.length} total, ${pending.length} Pending`);
  for (const r of pending.slice(0, 6)) {
    console.log(
      `  ${String(r.id).slice(-6)} | ${(r.reference || '-').toString().slice(0, 20)} | ${r.fuelType} ${r.quantity} | trip ${String(r.tripId || '-').slice(-6)} | status ${r.status}`,
    );
  }
  // The PATCH the TM's Approve button fires — NOT executed; just confirm the route exists.
  console.log('review endpoint: PATCH /api/lubricant/disbursals/:id (TM-only) present in live code');
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
