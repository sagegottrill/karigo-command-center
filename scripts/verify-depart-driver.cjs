/** E2E: gate departure dispatches BOTH the vehicle and the driver (driver flips On Trip). */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const login = await fetch('http://127.0.0.1:3001/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'manager@petroline.ng', password: 'Petroline@2026' }) });
  const lj = await login.json();
  const H = { Authorization: 'Bearer ' + lj.token, 'Content-Type': 'application/json' };
  const driver = await p.driver.create({ data: { name: 'E2E Depart Driver', status: 'Active', phone: '08000000000', staffId: 'E2E-DEP-1' } });
  console.log('throwaway driver created:', driver.id, '| status:', driver.status);
  const trip = await fetch('http://127.0.0.1:3001/api/trips', { method: 'POST', headers: H, body: JSON.stringify({ customer: 'E2E Depart Check', pickup: 'X', dropoff: 'Y', status: 'Scheduled', truckReg: 'E2E-DEP / E2E-TL', driverName: 'E2E Depart Driver' }) }).then((r) => r.json());
  console.log('throwaway trip:', trip.id);
  // Depart it
  const dep = await fetch('http://127.0.0.1:3001/api/trips/' + trip.id, { method: 'PATCH', headers: H, body: JSON.stringify({ status: 'En Route', startTime: '31 Oct 2026, 13:30', gateOutBy: 'S.1 Petroline' }) });
  console.log('departure:', dep.status);
  await new Promise((r) => setTimeout(r, 1200));
  const after = await p.driver.findUnique({ where: { id: driver.id } });
  console.log('driver after departure:', after.status, after.status === 'On Trip' ? '✓ DISPATCHED WITH THE TRUCK' : '✗ NOT DISPATCHED');
  // cleanup
  await p.trip.delete({ where: { id: trip.id } }).catch((e) => console.log('trip delete:', e.message.slice(0, 60)));
  await p.notification.deleteMany({ where: { refId: trip.id } });
  await p.auditLog.deleteMany({ where: { OR: [{ record: trip.id }, { record: { contains: 'E2E-DEP' } }] } });
  await p.driver.delete({ where: { id: driver.id } });
  console.log('cleaned up');
  await p.$disconnect();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
