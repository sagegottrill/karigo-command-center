/** SAFETY: any stray send-backs from my UI tests on real rows? Plus list every audit row that is OURS. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const MY_TRIP_IDS = [
  'ebcd2a32-8dda-469f-8ed0-311de590d6a1',
  'b3237e49-9b3a-4887-95e7-27e650113f65',
  '2b5eb56f-a0f3-4ae3-943f-f033526f55bf',
  'dd417b53-364a-4c4d-9e8a-0fc2fbee8f1f',
  '81391eb5-31be-4de8-864d-676e8e779dd4',
  '69657f80-efa4-4dc1-8263-716583fc6432',
  '1c044f9a-d2dd-408d-be6e-e02f6081ac8e',
];

(async () => {
  // 1. Stray send-backs: any real trip carrying a test reason, or Approved with empty roster updated tonight.
  const stray = await p.trip.findMany({
    where: {
      OR: [
        { sendBackReason: { contains: 'E2E' } },
        { customer: { startsWith: 'E2E' } },
        { customerConsignee: { startsWith: 'E2E' } },
      ],
    },
    select: { id: true, status: true, truckReg: true, driverName: true, sendBackReason: true, customer: true, updatedAt: true },
  });
  console.log('## Trips with E2E customer or reason (should be ZERO):', stray.length);
  for (const t of stray) console.log(' ', t.updatedAt.toISOString(), '|', t.id.slice(-5), '|', t.customer, '|', t.status, '|', t.truckReg, '|', t.driverName, '|', String(t.sendBackReason || '').slice(0, 50));

  // 2. Our audit rows — enumerate before deleting.
  const audits = await p.auditLog.findMany({
    where: {
      OR: [
        { record: { in: MY_TRIP_IDS } },
        { record: { startsWith: 'E2ERB' } },
        { record: { contains: 'E2E Return Check' } },
        { record: { contains: 'accidentally sent back during E2E' } },
        { ip: '::ffff:127.0.0.1', timestamp: { gte: new Date('2026-10-29T17:00:00Z') } },
        { record: 'trips', timestamp: { gte: new Date('2026-10-29T19:40:00Z') } },
      ],
    },
    orderBy: { timestamp: 'asc' },
  });
  console.log('\n## OUR audit rows found:', audits.length);
  for (const a of audits) console.log(' ', a.id, '|', a.timestamp.toISOString().slice(5, 16), '|', a.user, '|', a.module, '|', a.action, '|', String(a.record).slice(0, 70), '|', a.ip);

  // 3. push-tokens / api / health noise counts (to be hidden, not deleted).
  for (const m of ['push-tokens', 'api', 'health']) {
    console.log('module', m, 'count:', await p.auditLog.count({ where: { module: m } }));
  }

  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
