/** RESTORE: undo the accidental send-back of trip 92afd (ZAR513XM / B016) and re-claim its truck. */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const id = '92afd'; // will resolve to full id below
  const trips = await p.trip.findMany({ where: { id: { endsWith: '92afd' } } });
  const t = trips[0];
  if (!t) { console.error('trip 92afd not found'); process.exit(1); }
  console.log('restoring:', t.id, '| current:', t.status, '| reg:', JSON.stringify(t.truckReg), '| driver:', JSON.stringify(t.driverName), '| reason:', JSON.stringify(t.sendBackReason));

  await p.trip.update({
    where: { id: t.id },
    data: {
      status: 'Awaiting Approval',
      truckReg: 'ZAR513XM / B016',
      tailNumber: 'B016',
      driverName: 'Yahaya Alhassan',
      sendBackReason: null,
    },
  });

  // Re-claim the head in the registry (the accidental release set it Available).
  const trucks = await p.truck.findMany();
  const head = trucks.find((x) => String(x.registration || '').replace(/\s/g, '').toUpperCase() === 'ZAR513XM');
  if (head && head.status === 'Available') {
    await p.truck.update({ where: { id: head.id }, data: { status: 'Assigned' } });
    console.log('truck re-claimed: P' + ' | ' + head.cabId + ' -> Assigned');
  } else {
    console.log('truck row:', head ? head.cabId + ' status=' + head.status : 'not found', '- left untouched');
  }

  // Honest trail rows for both sides of this incident.
  await p.auditLog.create({ data: { user: 'System', module: 'Dispatch', action: 'Updated Dispatch', record: t.id + ' — accidentally sent back during E2E verification at 19:02; roster restored by the developer.', device: 'Server', ip: 'internal' } });

  const after = await p.trip.findUnique({ where: { id: t.id } });
  console.log('after restore:', after.status, '|', after.truckReg, '|', after.driverName, '| reason:', JSON.stringify(after.sendBackReason));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
