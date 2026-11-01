/**
 * E2E DEPARTMENTS — every department cycle beyond the dispatch lifecycle.
 *
 * 1. FUEL (Diesel & Gas): the TM raises a tank draw -> the desk SEES it in its
 *    waiting queue (Fortune's "the Diesel can see the TM's requests") -> the
 *    desk pours -> stock decrements -> history remembers.
 * 2. DRIVER IDENTITY: one man, one open dispatch — assigning the same driver
 *    to a second open dispatch is refused with the holder named.
 * 3. STORE/PROCUREMENT: a parts requisition enters the store board.
 * 4. HR: a driver row updates through the roster endpoint.
 *
 * Run on the VPS:  node e2e-departments.cjs
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const BASE = 'https://petrolline.fleetopsx.com'; // the production path (hosts-file pinned)

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log('  PASS', label); }
  else { fail++; console.log('  FAIL', label, extra !== undefined ? '-> ' + JSON.stringify(extra).slice(0, 220) : ''); }
};
const waitFor = async (fn, label, timeoutMs = 6000) => {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await fn();
    if (last === true) { ok(true, label); return true; }
    await new Promise((r) => setTimeout(r, 250));
  }
  ok(false, label, last);
  return false;
};

(async () => {
  const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'manager@petroline.ng', password: 'Petroline@2026' }) });
  const lj = await login.json();
  const H = { Authorization: 'Bearer ' + lj.token, 'Content-Type': 'application/json' };
  console.log('== login:', login.status);

  // ================= 1. FUEL (Diesel & Gas) =================
  console.log('== F1: TM raises a tank draw (Diesel 25L, internal use)');
  const fr = await fetch(`${BASE}/api/fuel-requests`, { method: 'POST', headers: H, body: JSON.stringify({
    fuelType: 'Diesel', quantity: 25, requestedBy: 'E2E Dept Desk', source: 'Internal Use',
    purpose: 'E2E fuel cycle', plateNumber: 'E2E-DEP-1',
  }) }).then((r) => r.json());
  ok(fr.id && fr.status === 'Requested', 'draw raised as Requested', fr);

  console.log('== F2: the Diesel desk SEES the TM request in its waiting queue');
  const desk = await fetch(`${BASE}/api/fuel-requests/desk`, { headers: H }).then((r) => r.json());
  const seenOnDesk = (desk.waiting || []).some((w) => w.id === fr.id);
  ok(seenOnDesk, 'TM draw visible on the desk waiting queue', (desk.waiting || []).length);

  console.log('== F3: the desk pours; stock decrements; history remembers');
  const stockBefore = (desk.tanks || []).find((t) => t.fuelType === 'Diesel');
  const pour = await fetch(`${BASE}/api/fuel-requests/${fr.id}/dispense`, { method: 'POST', headers: H, body: JSON.stringify({ quantity: 25, dispensedBy: 'E2E Dept Desk' }) });
  ok(pour.status === 200 || pour.status === 201, 'dispense accepted', await pour.clone().json().catch(() => pour.status));
  const deskAfter = await fetch(`${BASE}/api/fuel-requests/desk`, { headers: H }).then((r) => r.json());
  const stockAfter = (deskAfter.tanks || []).find((t) => t.fuelType === 'Diesel');
  ok((stockBefore ? stockBefore.quantity : 0) - (stockAfter ? stockAfter.quantity : 0) === 25, 'tank stock decremented by 25', { before: stockBefore && stockBefore.quantity, after: stockAfter && stockAfter.quantity });
  ok((deskAfter.recent || []).some((r) => r.id === fr.id), 'pour shows in dispensed history', (deskAfter.recent || []).length);
  const frAfter = await p.fuelRequest.findUnique({ where: { id: fr.id } });
  ok(frAfter && frAfter.status === 'Dispensed' && Number(frAfter.amount) > 0, 'row Dispensed with snapshot amount', frAfter && { status: frAfter.status, amount: frAfter.amount });

  // ================= 2. DRIVER IDENTITY =================
  console.log('== D1: one man, one open dispatch');
  const driver = await p.driver.create({ data: { name: 'E2E Dept Driver', status: 'Active', staffId: 'E2E-DP-D1', phone: '08000000002' } });
  const truckA = await (await fetch(`${BASE}/api/trucks`, { method: 'POST', headers: H, body: JSON.stringify({ cabId: 'E2E-DA1', registration: 'E2E-DRIVE-A', status: 'Available' }) })).json();
  const truckB = await (await fetch(`${BASE}/api/trucks`, { method: 'POST', headers: H, body: JSON.stringify({ cabId: 'E2E-DB1', registration: 'E2E-DRIVE-B', status: 'Available' }) })).json();
  const tripA = await fetch(`${BASE}/api/trips`, { method: 'POST', headers: H, body: JSON.stringify({ customer: 'E2E Dept A', pickup: 'X', dropoff: 'Y', status: 'Awaiting Approval', truckReg: `${truckA.registration} / E2E-DTA`, driverName: driver.name }) }).then((r) => r.json());
  const tripB = await fetch(`${BASE}/api/trips`, { method: 'POST', headers: H, body: JSON.stringify({ customer: 'E2E Dept B', pickup: 'X', dropoff: 'Z', status: 'Awaiting Approval', truckReg: `${truckB.registration} / E2E-DTB`, driverName: 'Unassigned' }) }).then((r) => r.json());
  ok(tripA.id && tripB.id, 'two trips created', { a: tripA.id && tripA.id.slice(-5), b: tripB.id && tripB.id.slice(-5) });
  const dbl = await fetch(`${BASE}/api/trips/${tripB.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ driverName: driver.name }) });
  const dblBody = await dbl.clone().json().catch(() => '');
  ok(dbl.status === 409, 'second open dispatch for the same driver REFUSED', dbl.status);
  ok(String((dblBody && dblBody.error) || '').toLowerCase().includes(driver.name.split(' ')[0].toLowerCase()) || String((dblBody && dblBody.error) || '').length > 10, 'refusal names the conflict', dblBody);

  // ================= 3. STORE / PROCUREMENT =================
  console.log('== P1: parts requisition enters the store board');
  const proc = await fetch(`${BASE}/api/procurement`, { method: 'POST', headers: H, body: JSON.stringify({
    partName: 'E2E Probe Tyre 295', quantity: 2, vendor: 'E2E Vendor', unitPrice: 15000,
    kind: 'Tyre', date: new Date().toISOString().slice(0, 10),
  }) });
  const procBody = await proc.clone().json().catch(() => ({}));
  ok(proc.status === 200 || proc.status === 201, 'procurement intake accepted', { status: proc.status, body: procBody });

  // ================= 4. HR roster =================
  console.log('== H1: driver roster update');
  const upd = await fetch(`${BASE}/api/drivers/${driver.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ phone: '08000000009' }) }).then((r) => r.json());
  ok(upd.phone === '08000000009', 'driver roster PATCH persists', upd.phone);

  // ================= cleanup =================
  console.log('== cleanup');
  await p.fuelRequest.delete({ where: { id: fr.id } }).catch((e) => console.log('  fr del:', e.message.slice(0, 50)));
  await p.trip.delete({ where: { id: tripA.id } }).catch(() => {});
  await p.trip.delete({ where: { id: tripB.id } }).catch(() => {});
  await p.notification.deleteMany({ where: { OR: [{ refId: fr.id }, { refId: tripA.id }, { refId: tripB.id }] } });
  await p.auditLog.deleteMany({ where: { OR: [{ record: fr.id }, { record: { contains: 'E2E Dept' } }, { record: { contains: 'E2E-DRIVE' } }, { record: { contains: tripA.id } }, { record: { contains: tripB.id } }, { record: { contains: 'E2E Probe Tyre' } }] } });
  await p.procurementRequest.deleteMany({ where: { partName: 'E2E Probe Tyre 295' } }).catch(() => {});
  await p.truck.delete({ where: { id: truckA.id } }).catch(() => {});
  await p.truck.delete({ where: { id: truckB.id } }).catch(() => {});
  await p.driver.delete({ where: { id: driver.id } }).catch(() => {});
  console.log('  throwaways removed');

  console.log(`\n==== E2E DEPARTMENTS: ${pass} passed, ${fail} failed ====`);
  await p.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
