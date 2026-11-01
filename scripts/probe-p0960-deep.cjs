const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const t = await p.trip.findUnique({ where: { id: '9f7023c1-22ef-4b6c-8e8e-d63c02ed91df' } });
  if (t) {
    const slim = {};
    for (const k of Object.keys(t)) {
      const v = t[k];
      slim[k] = v && typeof v === 'object' ? (v.toISOString ? v.toISOString() : '[obj]') : v;
    }
    console.log('TRIP-15:27 =', JSON.stringify(slim, null, 1));
  } else console.log('trip gone');
  const drivers = await p.driver.findMany({ select: { id: true, staffId: true, name: true, status: true, truckReg: true, truckReg2: true, department: true } });
  const exact = drivers.filter((d) => String(d.name || '').trim().toLowerCase() === 'abdullahi');
  console.log('drivers named EXACTLY abdullahi:', exact.length);
  for (const d of exact) console.log(' -', d.staffId, d.name, '|', d.status, '| truck:', d.truckReg, d.truckReg2, '| dept:', d.department);
  const parts = drivers.filter((d) => /abdullahi/i.test(d.name || ''));
  console.log('drivers containing abdullahi:', parts.length);
  for (const d of parts) console.log(' -', d.staffId, d.name, '|', d.status);
  await p.$disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
