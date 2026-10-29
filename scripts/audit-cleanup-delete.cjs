/** CLEANUP: delete OUR test/dev rows from the audit trail. Prints everything it deletes. */
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
const MY_IPS = ['102.88.114.85', '::ffff:127.0.0.1'];

(async () => {
  // The enumerated dev rows.
  const doomed = await p.auditLog.findMany({
    where: {
      OR: [
        { record: { in: MY_TRIP_IDS } },
        { record: { startsWith: 'E2ERB' } },
        { record: { contains: 'E2E Return Check' } },
        { record: { contains: 'accidentally sent back during E2E' } },
        { ip: '::ffff:127.0.0.1', timestamp: { gte: new Date('2026-10-29T17:00:00Z') } },
      ],
    },
  });
  // The bare "trips" creation rows my test scripts wrote tonight (IP-scoped to this machine only).
  const tripsRows = await p.auditLog.findMany({
    where: {
      record: 'trips',
      action: 'Created Dispatch',
      timestamp: { gte: new Date('2026-10-29T18:30:00Z'), lte: new Date('2026-10-29T19:30:00Z') },
      OR: MY_IPS.map((ip) => ({ ip: { contains: ip } })),
    },
  });
  const all = [...doomed, ...tripsRows];
  console.log('Deleting', all.length, 'audit rows:');
  for (const a of all) {
    console.log('  -', a.timestamp.toISOString().slice(5, 16), '|', a.user, '|', a.action, '|', String(a.record).slice(0, 60));
    await p.auditLog.delete({ where: { id: a.id } });
  }
  console.log('done. remaining E2E-ish audit rows:',
    await p.auditLog.count({ where: { OR: [{ record: { startsWith: 'E2E' } }, { record: { contains: 'accidentally sent back' } }, { record: { in: MY_TRIP_IDS } }] } }));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
