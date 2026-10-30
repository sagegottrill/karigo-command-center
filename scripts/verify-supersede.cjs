/** E2E: supersede-on-departure closes the older dispatch when the gate departs the same rig. */
const API = 'https://api.fleetopsx.com';
(async () => {
  const login = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'manager@petroline.ng', password: 'Petroline@2026' }) });
  const lj = await login.json();
  const H = { Authorization: 'Bearer ' + lj.token, 'Content-Type': 'application/json' };
  const reg = 'E2E-SUP / E2E-TAIL';
  // Older moving dispatch
  const a = await fetch(`${API}/api/trips`, { method: 'POST', headers: H, body: JSON.stringify({ customer: 'E2E Sup Old', pickup: 'X', dropoff: 'Y', status: 'En Route', truckReg: reg, driverName: 'E2E Sup Driver' }) });
  const A = await a.json();
  console.log('old dispatch:', a.status, A.id);
  // Newer dispatch, same rig
  const b = await fetch(`${API}/api/trips`, { method: 'POST', headers: H, body: JSON.stringify({ customer: 'E2E Sup New', pickup: 'X', dropoff: 'Z', status: 'Awaiting Approval', truckReg: reg, driverName: 'E2E Sup Driver 2' }) });
  const B = await b.json();
  console.log('new dispatch:', b.status, B.id);
  if (!a.ok || !b.ok) process.exit(1);
  // Approve + depart the newer one — the older must self-close.
  await fetch(`${API}/api/trips/${B.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'Scheduled' }) });
  const dep = await fetch(`${API}/api/trips/${B.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'En Route', startTime: '29 Oct 2026, 21:30', gateOutBy: 'S.1 Petroline' }) });
  console.log('newer departure:', dep.status);
  const afterA = await fetch(`${API}/api/trips/${A.id}`, { headers: H }).then((r) => r.json());
  console.log('old dispatch now:', afterA.status, '| returnedBy note:', String(afterA.directCosts?.returnedBy?.note || '').slice(0, 90));
  // cleanup
  for (const id of [A.id, B.id]) await fetch(`${API}/api/trips/${id}`, { method: 'DELETE', headers: H }).then((r) => console.log('api delete', id.slice(-5), r.status)).catch(() => {});
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
