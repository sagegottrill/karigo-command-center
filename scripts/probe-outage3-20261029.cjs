/** READ-ONLY+repro: login as TM harness account, reproduce the 409, list blocked approvals. */
const BASE = 'https://api.fleetopsx.com';

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@petroline.ng', password: 'Petroline@2026' }),
  });
  const lj = await login.json();
  if (!login.ok) { console.error('LOGIN FAILED', login.status, lj); process.exit(1); }
  console.log('TM login OK. role:', lj.user?.role, '| roles:', lj.user?.roles);
  const H = { Authorization: 'Bearer ' + lj.token, 'Content-Type': 'application/json' };

  // 1. Reproduce the blocked approval on 8d095452 (GGE93YK / B013).
  const repro = await fetch(`${BASE}/api/trips/8d095452-1d50-4fa4-8eaf-5736830fa6d0`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ status: 'Scheduled' }),
  });
  console.log('\n## REPRO approval PATCH status:', repro.status);
  console.log(await repro.json().then((j) => JSON.stringify(j)).catch(() => '<no body>'));

  // 2. Every Awaiting Approval / Approved trip — simulate the guard to list all blocked ones.
  const trips = await fetch(`${BASE}/api/trips`, { headers: H }).then((r) => r.json());
  const tok = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
  const keysOf = (t) => {
    const out = new Set();
    for (const v of [t.truckReg, t.tailNumber]) {
      const w = tok(v); if (w.length > 2) out.add(w);
      for (const p of String(v || '').split(/[^0-9a-zA-Z]+/)) { const k = tok(p); if (k && k.length > 2) out.add(k); }
    }
    return [...out];
  };
  const OPEN = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
  const open = trips.filter((t) => OPEN.includes(t.status));
  const pending = trips.filter((t) => ['Awaiting Approval', 'Approved', 'Requested'].includes(t.status));
  console.log('\n## Pending requests:', pending.length);
  for (const t of pending) {
    const own = keysOf(t);
    const clash = open.filter((o) => o.id !== t.id && keysOf(o).some((k) => own.includes(k)));
    const headTok = tok(String(t.truckReg || '').split('/')[0]);
    const headClash = open.filter((o) => o.id !== t.id && tok(String(o.truckReg || '').split('/')[0]) === headTok && headTok);
    console.log(' ',
      t.id.slice(-5), '|', t.status, '|', t.truckReg || '—', '| drv:', t.driverName || '—',
      '| tail-klash:', clash.length ? clash.map((c) => c.id.slice(-5) + '/' + c.status).join(',') : 'no',
      '| head-klash:', headClash.length ? headClash.map((c) => c.id.slice(-5) + '/' + c.status).join(',') : 'no');
  }

  // 3. Do the E2E cycle accounts still exist?
  for (const email of ['e2e-cycle-gate@petrolline.fleetopsx.com', 'e2e-cycle-tm@petrolline.fleetopsx.com']) {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Cycle@2026' }),
    });
    console.log('\n## e2e account', email, '->', r.status, r.ok ? 'EXISTS' : '');
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
