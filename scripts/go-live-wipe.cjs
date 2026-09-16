/**
 * GO-LIVE WIPE for /var/www/fleetopsx-api (run ON the Hetzner box).
 * The client starts using the app for real today. This clears ALL test data:
 *   - every user EXCEPT the Transport Manager login (manager@petroline.ng)
 *   - all trips/requests, expenses, gate entries, tracking checkpoints
 *   - all drivers, trucks (heads), tails
 *   - all notifications, login reports, audit logs, conversations
 *   - work orders, inventory, procurement, fuel requisitions
 * FuelPrice (TM-set diesel/gas rates) is KEPT — it's configuration, not test data.
 * A full pg_dump backup is written to /root/backups before anything is deleted.
 * Idempotent. Usage: node go-live-wipe.cjs
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const KEEP_EMAIL = 'manager@petroline.ng';

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();

  // 0) Backup first — nothing is deleted until the dump exists.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = '/root/backups';
  const backupFile = `${backupDir}/fleetopsx-pre-golive-${stamp}.sql`;
  fs.mkdirSync(backupDir, { recursive: true });
  execSync(`sudo -u postgres pg_dump fleetopsx > ${backupFile}`, { stdio: 'inherit', shell: '/bin/bash' });
  const size = fs.statSync(backupFile).size;
  if (size < 500) throw new Error(`backup suspiciously small (${size} bytes) — aborting`);
  console.log(`backup: ${backupFile} (${size} bytes)`);

  // 1) Users — keep ONLY the Transport Manager login.
  const users = await p.user.findMany({ select: { id: true, email: true, role: true } });
  const doomed = users.filter((u) => u.email.toLowerCase() !== KEEP_EMAIL);
  const kept = users.filter((u) => u.email.toLowerCase() === KEEP_EMAIL);
  console.log(`users: keeping ${kept.map((u) => `${u.email} (${u.role})`).join(', ') || 'NONE!'}`);
  console.log(`users: deleting ${doomed.length} (partners, staff, e2e accounts…)`);
  // Delete dependents that reference users before the users themselves.
  await p.loginReport.deleteMany({});
  await p.notification.deleteMany({});
  await p.conversation.deleteMany({});
  await p.auditLog.deleteMany({});
  await p.user.deleteMany({ where: { email: { not: KEEP_EMAIL } } });

  // 2) All operational test data.
  const [trips, expenses, gate, checkpoints, drivers, trucks, tails, work, inv, req, fuelReq] = await Promise.all([
    p.trip.deleteMany({}),
    p.expense.deleteMany({}),
    p.gateEntry.deleteMany({}),
    p.trackingCheckpoint.deleteMany({}),
    p.driver.deleteMany({}),
    p.truck.deleteMany({}),
    p.tail.deleteMany({}),
    p.workOrder.deleteMany({}),
    p.inventoryItem.deleteMany({}),
    p.inventoryRequisition.deleteMany({}),
    p.fuelRequisition.deleteMany({}),
  ]).catch(async (e) => {
    // Model names can differ (truck vs truckHead etc.) — fall back to raw SQL per table.
    console.error('prisma bulk delete failed, falling back to raw SQL:', e.message);
    const tables = [
      'TrackingCheckpoint', 'GateEntry', 'Expense', 'Trip',
      'FuelRequisition', 'ProcurementRequest', 'InventoryRequisition', 'InventoryItem',
      'WorkOrder', 'Tail', 'Truck', 'Driver', 'Notification', 'Conversation', 'AuditLog', 'LoginReport',
    ];
    for (const t of tables) {
      try { await p.$executeRawUnsafe(`DELETE FROM "${t}"`); console.log(`raw: cleared ${t}`); }
      catch (e2) { console.log(`raw: skip ${t} (${e2.message.split('\n')[0]})`); }
    }
    await p.$executeRawUnsafe(`DELETE FROM "User" WHERE lower(email) <> '${KEEP_EMAIL}'`);
    return [];
  });
  if (trips) {
    console.log(`cleared: trips=${trips.count} expenses=${expenses.count} gate=${gate.count} checkpoints=${checkpoints.count}`);
    console.log(`cleared: drivers=${drivers.count} trucks=${trucks.count} tails=${tails.count} workOrders=${work.count}`);
    console.log(`cleared: inventory=${inv.count} requisitions=${req.count} fuelReqs=${fuelReq.count}`);
  }
  console.log('kept: FuelPrice rates (TM configuration)');

  const remainingUsers = await p.user.count();
  const remainingTrips = await p.trip.count();
  console.log(`VERIFY: users=${remainingUsers} (expect 1), trips=${remainingTrips} (expect 0)`);
  await p.$disconnect();
}

main().catch((e) => { console.error('WIPE FAILED:', e.message); process.exit(1); });
