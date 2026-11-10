/**
 * Sign-off gate, exercised against the live API with throwaway rows.
 *
 *   1. Engineering completes a job whose part is still waiting on the TM → 409
 *   2. TM forces it without a reason → 400
 *   3. TM forces it with a reason → the job completes, the part is Deferred
 *
 * Run on the API host (needs JWT_SECRET):  node scripts/gate-test.mjs
 * It cleans up after itself. No real truck is touched.
 */
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();
const API = 'http://127.0.0.1:3001/api';
const prisma = new PrismaClient();
const REG = `TEST-GATE-${Date.now().toString().slice(-6)}`;

const mint = (id, role, name) =>
  jwt.sign({ id, email: `${name.replace(/\s+/g, '.')}@test.local`, role, roles: [role], name },
    process.env.JWT_SECRET, { expiresIn: '1h' });

const ENG = mint('2cf5cdfa-3fad-43f3-ac57-0c40ad340e6f', 'Engineering', 'Test Engineer');
const TM = mint('639c59b8-1418-4d6a-b9f6-5148895b41f1', 'Transport Manager', 'Transport Manager');

const call = async (path, token, method = 'GET', body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data };
};

let wo = null;
try {
  const created = await call('/work-orders', ENG, 'POST', {
    truckReg: REG, defect: 'gate test', category: 'General', priority: 'Low',
    reportedBy: 'gate test', status: 'Reported',
  });
  console.log('create work order    ->', created.status, JSON.stringify(created.data).slice(0, 160));
  wo = created.data?.id;
  if (!wo) throw new Error('no work order created');

  const req = await call('/inventory-requisitions', ENG, 'POST', {
    workOrder: wo, truckReg: REG, mechanic: 'gate test', part: 'Test Part A',
    quantity: 1, reason: 'gate test', status: 'Awaiting Admin Approval',
  });
  console.log('raise requisition    ->', req.status, req.data?.status);
  // The create route ignores `status` (it is not a client field), so the line
  // is moved down the chain the way the HOE and TM do it.
  const moved = await call(`/inventory-requisitions/${req.data?.id}`, ENG, 'PATCH', {
    status: 'Awaiting Admin Approval',
  });
  console.log('move to tm queue     ->', moved.status, moved.data?.status);

  const a = await call(`/work-orders/${wo}`, ENG, 'PATCH', { status: 'Completed' });
  console.log('engineer completes   ->', a.status, JSON.stringify(a.data).slice(0, 200));

  const b = await call(`/work-orders/${wo}`, TM, 'PATCH', { status: 'Completed', force: true });
  console.log('tm force, no reason  ->', b.status, JSON.stringify(b.data).slice(0, 200));

  const c = await call(`/work-orders/${wo}`, TM, 'PATCH', {
    status: 'Completed', force: true, overrideReason: 'Gate test release',
  });
  console.log('tm force + reason    ->', c.status, JSON.stringify({
    status: c.data?.status, notes: c.data?.notes?.slice(0, 120),
  }));

  const lines = await prisma.inventoryRequisition.findMany({ where: { truckReg: REG } });
  console.log('requisition after    ->', lines.map((l) => `${l.status} / ${l.decisionNote}`));
} finally {
  await prisma.inventoryRequisition.deleteMany({ where: { truckReg: REG } });
  if (wo) await prisma.workOrder.delete({ where: { id: wo } }).catch(() => {});
  console.log('cleaned up', REG);
  await prisma.$disconnect();
}
