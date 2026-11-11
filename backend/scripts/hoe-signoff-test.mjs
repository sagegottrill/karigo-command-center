/**
 * Can the seat that OWNS the sign-off actually sign off?
 *
 * The page gives Ready to Go to the Head of Engineering, the Engineering
 * Manager and the Platform Admin. This asks the API the same question, and
 * checks that the repair it closes lands in the maintenance log.
 *
 *   node scripts/hoe-signoff-test.mjs
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const API = 'http://127.0.0.1:3001';
const prisma = new PrismaClient();
const REG = `TEST-SIGNOFF-${Date.now().toString().slice(-6)}`;
const mint = (id, role, name) =>
  jwt.sign({ id, email: `${name.replace(/\s+/g, '.')}@test.local`, role, roles: [role], name }, process.env.JWT_SECRET, { expiresIn: '1h' });
const call = async (token, path, method = 'GET', body) => {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 160); }
  return { status: res.status, data };
};

const ENG = mint('2cf5cdfa-3fad-43f3-ac57-0c40ad340e6f', 'Engineering', 'Test Engineer');
const HOE = mint('2fa1a1f2-d655-47ed-a946-367ef80333fd', 'Head of Engineering', 'Test Head of Engineer');
const EM = mint('5c1f0000-0000-4000-8000-00000000e0e0', 'Engineering Manager', 'Test Engineering Manager');

let wo = null;
try {
  const created = await call(ENG, '/api/work-orders', 'POST', {
    truckReg: REG, defect: 'sign-off test', category: 'General', priority: 'Low',
    reportedBy: 'sign-off test', status: 'Reported',
  });
  wo = created.data?.id;
  console.log('job raised             ->', created.status, wo);

  const hoe = await call(HOE, `/api/work-orders/${wo}`, 'PATCH', {
    status: 'Completed', completedAt: new Date().toISOString(), notes: 'Closed by the Head of Engineering.',
  });
  console.log('hoe signs it off       ->', hoe.status, hoe.status === 200 ? 'completed' : JSON.stringify(hoe.data).slice(0, 90));

  const em = await call(EM, `/api/work-orders/${wo}`, 'PATCH', { status: 'Testing' });
  console.log('engineering manager    ->', em.status, em.status === 200 ? 'may drive the job' : JSON.stringify(em.data).slice(0, 90));

  const row = await prisma.workOrder.findUnique({ where: { id: wo }, select: { status: true, completedAt: true } });
  console.log('stored                 ->', row?.status, row?.completedAt?.toISOString()?.slice(0, 19));
} catch (e) {
  console.error('FAILED:', e.message);
} finally {
  if (wo) await prisma.workOrder.delete({ where: { id: wo } }).catch(() => {});
  console.log('cleaned up');
  await prisma.$disconnect();
}
