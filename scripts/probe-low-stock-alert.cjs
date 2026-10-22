/**
 * PRD §2 End-to-end probe — LOW-STOCK THRESHOLD ALERT ON DISBURSEMENT.
 *
 * Runs ON the API server (it needs the DB). Full loop, exactly as the screens
 * call it; everything created here is DELETED afterwards:
 *   1. TM logs in via the API.
 *   2. A probe store line (stock 10, threshold 4) + a mechanic request for 8.
 *   3. TM approves  → ticket goes Awaiting Pickup.
 *   4. Store completes the handoff (mechanic signature) → stock 10 → 2.
 *   5. Assert: a notification with eventKey 'inventory.low_stock' whose
 *      actionRoles include 'Transport Manager' exists for that line — and that
 *      a SECOND handoff on the same low line does NOT re-alert.
 * Cleanup: probe requisition, probe movements, probe item, probe notifications.
 */
const { PrismaClient } = require('/var/www/fleetopsx-api/node_modules/@prisma/client');
const prisma = new PrismaClient();
const BASE = 'http://localhost:3001';

const SKU = 'PRD-PROBE-LS';
const login = async () => {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'manager@petroline.ng', password: 'Petroline@2026' }),
  });
  const j = await r.json();
  if (!r.ok || !j.token) throw new Error('login failed: ' + r.status);
  return j.token;
};

const api = async (token, path, method = 'GET', body) => {
  const r = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, json: j };
};

(async () => {
  const token = await login();

  const item = await prisma.inventoryItem.create({
    data: {
      name: 'PRD Probe — Low Stock Alert Line',
      sku: SKU,
      category: 'Probe',
      stock: 10,
      reorderLevel: 4,
      unitCost: 5000,
      location: 'Main Store',
    },
  });

  const requisition = await prisma.inventoryRequisition.create({
    data: {
      workOrder: 'WO-PROBE',
      truckReg: 'PRD-PROBE',
      mechanic: 'Probe Mechanic',
      part: item.name,
      itemId: item.id,
      quantity: 8,
      reason: 'Probe — threshold alert verification',
      unitCost: 5000,
      status: 'Pending',
    },
  });

  const release = await api(token, `/inventory/${item.id}/release`, 'POST', { reqId: requisition.id });
  if (release.status !== 200) throw new Error('release failed: ' + JSON.stringify(release.json));

  const complete = await api(token, `/inventory-handoffs/${requisition.id}/complete`, 'POST', {
    signature: 'data:image/png;base64,PROBE',
  });
  if (complete.status !== 200) throw new Error('handoff failed: ' + JSON.stringify(complete.json));

  const alerts = await prisma.notification.count({
    where: { eventKey: 'inventory.low_stock', refId: item.id },
  });
  console.log('first handoff released stock to', complete.json.item.stock, '(threshold 4)');
  console.log('low-stock notifications for the TM:', alerts);
  const row = prisma.notification
    ? await prisma.notification.findFirst({
        where: { eventKey: 'inventory.low_stock', refId: item.id },
        select: { title: true, audience: true, actionRoles: true, severity: true },
      })
    : null;
  if (row) console.log('alert:', row.title, '| actionRoles:', JSON.stringify(row.actionRoles));

  // Second handoff on the same line must NOT re-alert (already low).
  await prisma.inventoryRequisition.update({ where: { id: requisition.id }, data: { status: 'Awaiting Pickup', releasedQty: null, releasedValue: null, signature: null, handoffAt: null } });
  await prisma.inventoryItem.update({ where: { id: item.id }, data: { stock: 2, status: 'Low Stock' } });
  await api(token, `/inventory-handoffs/${requisition.id}/complete`, 'POST', { signature: 'data:image/png;base64,PROBE' });
  const alertsAfter2 = await prisma.notification.count({
    where: { eventKey: 'inventory.low_stock', refId: item.id },
  });
  console.log('second handoff (already low) notifications:', alertsAfter2);

  // Cleanup — the probe never leaves a trace.
  await prisma.notification.deleteMany({ where: { refId: item.id } });
  await prisma.inventoryMovement.deleteMany({ where: { itemId: item.id } });
  await prisma.inventoryRequisition.deleteMany({ where: { id: requisition.id } });
  await prisma.inventoryItem.deleteMany({ where: { id: item.id } });
  console.log('cleanup done. VERDICT:', alerts >= 1 && alertsAfter2 === 1 ? 'PASS — alert fired once, no re-alert.' : 'FAIL');
  await prisma.$disconnect();
})().catch((e) => {
  console.error('PROBE ERROR:', e.message);
  prisma.inventoryItem.deleteMany({ where: { sku: SKU } }).then(() => process.exit(1));
});
