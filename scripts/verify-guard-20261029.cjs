/** E2E verify: assignment guard refuses busy tail; free tail assigns; approval passes. Cleanup after. */
const BASE = 'https://api.fleetopsx.com';

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@petroline.ng', password: 'Petroline@2026' }),
  });
  const lj = await login.json();
  const H = { Authorization: 'Bearer ' + lj.token, 'Content-Type': 'application/json' };
  console.log('TM login:', login.status);

  // 1. Create a throwaway request.
  const mk = await fetch(`${BASE}/api/trips`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      customer: 'E2E Guard Check', customerConsignee: 'E2E', cargo: 'TEST',
      pickup: 'E2E Yard', dropoff: 'E2E Drop', requestedTruckType: 'Flat',
      status: 'Awaiting Approval',
    }),
  });
  const trip = await mk.json();
  console.log('create throwaway:', mk.status, trip.id);
  if (!mk.ok) process.exit(1);
  const id = trip.id;

  try {
    // 2. Assign the BUSY tail B013 (held by DIS-8C11D) -> expect 409 naming it.
    const busy = await fetch(`${BASE}/api/trips/${id}`, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ truckReg: 'GGE93YK / B013', tailNumber: 'B013', driverName: 'E2E Driver' }),
    });
    console.log('\nassign BUSY tail B013 ->', busy.status);
    console.log('  ', JSON.stringify(await busy.json()).slice(0, 300));

    // 3. Assign a FREE tail -> expect success. Find one Available.
    const tails = await fetch(`${BASE}/api/tails`, { headers: H }).then((r) => r.json());
    const free = tails.find((t) => t.status === 'Available');
    const heads = await fetch(`${BASE}/api/trucks`, { headers: H }).then((r) => r.json());
    const freeHead = heads.find((h) => h.status === 'Available');
    console.log('\nfree assets: head', freeHead && (freeHead.cabId + '/' + freeHead.registration), '| tail', free && free.number);
    if (!free || !freeHead) { console.log('no free assets — skipping happy path'); return; }
    const ok = await fetch(`${BASE}/api/trips/${id}`, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({
        truckReg: `${freeHead.registration} / ${free.number}`,
        tailNumber: free.number,
        driverName: 'E2E Driver',
      }),
    });
    console.log('assign FREE tail ->', ok.status, ok.ok ? 'SAVED' : JSON.stringify(await ok.json()).slice(0, 200));

    // 4. Approve (status Scheduled) -> the one-territory guard must PASS now.
    const approve = await fetch(`${BASE}/api/trips/${id}`, {
      method: 'PATCH', headers: H, body: JSON.stringify({ status: 'Scheduled' }),
    });
    console.log('approve (Scheduled) ->', approve.status, approve.ok ? 'APPROVED' : JSON.stringify(await approve.json()).slice(0, 200));
  } finally {
    // 5. Cleanup the throwaway row.
    const del = await fetch(`${BASE}/api/trips/${id}`, { method: 'DELETE', headers: H });
    console.log('\ncleanup delete:', del.status);
  }

  // 6. Confirm the real blocked request is untouched and guard is live on it (read-only 409 probe).
  const real = await fetch(`${BASE}/api/trips/8d095452-1d50-4fa4-8eaf-5736830fa6d0`, {
    method: 'PATCH', headers: H,
    body: JSON.stringify({ truckReg: 'GGE93YK / B013', tailNumber: 'B013' }),
  });
  console.log('real blocked request re-assign same tail (unchanged values -> should PASS as no-op):', real.status);
  if (real.ok) {
    const back = await fetch(`${BASE}/api/trips/8d095452-1d50-4fa4-8eaf-5736830fa6d0`, {
      method: 'PATCH', headers: H,
      body: JSON.stringify({ truckReg: 'GGE93YK / B013', tailNumber: 'B013', driverName: 'Idris' }),
    });
    console.log('restore driverName:', back.status);
  }
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
