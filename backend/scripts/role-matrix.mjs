/**
 * ROLE MATRIX — can each seat actually do what its screen offers?
 *
 * Every one of these controls exists in the UI, and a 403 here is a button that
 * lies: the page shows it, the seat presses it, nothing happens. This walks the
 * maintenance chain end-to-end as each role against the LIVE API, using
 * throwaway rows, and prints only the rows that disagree with the policy the
 * screens were built on.
 *
 *   node scripts/role-matrix.mjs
 *
 * Policy (from the department's own rules):
 *   inspect a returning truck .... workshop + yard crew + Platform Admin
 *   drive a job .................. workshop, Head of Engineering, Eng. Manager, Admin
 *   Ready to Go / free the truck .. Head of Engineering, Eng. Manager, Admin
 *                                   (maintenance reads the status, never releases)
 *   override ahead of parts ....... Transport Manager, Admin
 *   set reason + expected date .... Head of Engineering, Eng. Manager, Admin
 *   raise a part request .......... workshop (the Head approves, does not raise)
 *   return a truck to Available ... everyone who works the board
 *   open a truck's chat thread .... the whole department
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const API = 'http://127.0.0.1:3001';
const prisma = new PrismaClient();
const REG = `TEST-MATRIX-${Date.now().toString().slice(-6)}`;
const TAIL = `T-MATRIX-${Date.now().toString().slice(-6)}`;

const SEATS = {
  workshop: { id: '2cf5cdfa-3fad-43f3-ac57-0c40ad340e6f', role: 'Engineering', name: 'Test Engineer' },
  hoe: { id: '2fa1a1f2-d655-47ed-a946-367ef80333fd', role: 'Head of Engineering', name: 'Test Head of Engineer' },
  em: { id: '5c1f0000-0000-4000-8000-00000000e0e0', role: 'Engineering Manager', name: 'Test Engineering Manager' },
  tm: { id: '639c59b8-1418-4d6a-b9f6-5148895b41f1', role: 'Transport Manager', name: 'Transport Manager' },
  admin: { id: '00000000-0000-4000-8000-000000000001', role: 'Platform Admin', name: 'Test Platform Admin' },
};
const tokenOf = (seat) =>
  jwt.sign(
    { id: seat.id, email: `${seat.role.replace(/\s+/g, '.').toLowerCase()}@test.local`, role: seat.role, roles: [seat.role], name: seat.name },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

const call = async (seat, path, method = 'GET', body) => {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + tokenOf(seat), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text.slice(0, 120); }
  return { status: res.status, data };
};

const problems = [];
const check = async (label, seat, allowed, path, method, body) => {
  const res = await call(seat, path, method, body);
  const ok = res.status >= 200 && res.status < 300;
  const asExpected = allowed ? ok : res.status === 403;
  const detail = ok ? '' : String(res.data?.error || '').slice(0, 80);
  console.log(`${asExpected ? 'ok  ' : 'BUG '} ${seat.role.padEnd(20)} ${label.padEnd(34)} ${res.status}${detail ? ' · ' + detail : ''}`);
  if (!asExpected) {
    problems.push(`${seat.role} ${allowed ? 'SHOULD be able to' : 'should NOT be able to'} ${label} (got ${res.status} ${detail})`);
  }
  return res;
};

let truck = null;
let tail = null;
let wo = null;
try {
  const madeTruck = await call(SEATS.tm, '/api/trucks', 'POST', {
    registration: REG, cabId: '', category: 'LOCAL', status: 'Maintenance',
  });
  truck = madeTruck.data?.id;
  if (!truck) throw new Error('could not create the test truck: ' + JSON.stringify(madeTruck.data).slice(0, 120));

  const madeTail = await call(SEATS.tm, '/api/tails', 'POST', { number: TAIL, type: 'Flatbed', status: 'Maintenance' });
  tail = madeTail.data?.id;

  const madeWo = await call(SEATS.workshop, '/api/work-orders', 'POST', {
    truckReg: REG, defect: 'matrix test', category: 'General', priority: 'Low',
    reportedBy: 'matrix test', status: 'Reported',
  });
  wo = madeWo.data?.id;
  if (!wo) throw new Error('could not raise the test job');

  console.log(`\n— fixture: ${REG} / ${TAIL} / job ${wo.slice(0, 8)} —\n`);

  /* ---- returning a truck to the road (Ready to Go's own last step) ---- */
  // Maintenance is NOT on this list. The workshop finishes the repair and hands
  // the truck over; freeing it is the Head of Engineering's signature, and the
  // registry write is the same act, so it is refused on both routes.
  await check('return truck to Available', SEATS.workshop, false, `/api/trucks/${truck}`, 'PATCH', { status: 'Available' });
  for (const seat of ['hoe', 'em', 'tm', 'admin'])
    await check('return truck to Available', SEATS[seat], true, `/api/trucks/${truck}`, 'PATCH', { status: 'Available' });
  await check('return tail to Available', SEATS.workshop, false, `/api/tails/${tail}`, 'PATCH', { status: 'Available' });
  for (const seat of ['hoe', 'em', 'tm', 'admin'])
    await check('return tail to Available', SEATS[seat], true, `/api/tails/${tail}`, 'PATCH', { status: 'Available' });

  /* ---- driving / closing the job ---- */
  await check('advance the job', SEATS.workshop, true, `/api/work-orders/${wo}`, 'PATCH', { status: 'Diagnosing' });
  await check('advance the job', SEATS.hoe, true, `/api/work-orders/${wo}`, 'PATCH', { status: 'Repairing' });
  await check('advance the job', SEATS.em, true, `/api/work-orders/${wo}`, 'PATCH', { status: 'Testing' });
  await check('close the job (Ready to Go)', SEATS.workshop, false, `/api/work-orders/${wo}`, 'PATCH', {
    status: 'Completed', completedAt: new Date().toISOString(), notes: 'matrix test',
  });
  await check('close the job (Ready to Go)', SEATS.tm, false, `/api/work-orders/${wo}`, 'PATCH', {
    status: 'Completed', completedAt: new Date().toISOString(), notes: 'matrix test',
  });
  await check('close the job (Ready to Go)', SEATS.hoe, true, `/api/work-orders/${wo}`, 'PATCH', {
    status: 'Completed', completedAt: new Date().toISOString(), notes: 'matrix test',
  });

  /* ---- inspection: the workshop's work, not oversight's ---- */
  await check('inspect a returning truck', SEATS.workshop, true, '/api/engineering/inspections', 'POST', {
    headId: truck, truckReg: REG, result: 'no-issues', inspectedBy: 'Test Engineer',
  });
  await check('inspect a returning truck', SEATS.tm, false, '/api/engineering/inspections', 'POST', {
    headId: truck, truckReg: REG, result: 'no-issues', inspectedBy: 'Transport Manager',
  });
  await check('inspect a returning truck', SEATS.hoe, false, '/api/engineering/inspections', 'POST', {
    headId: truck, truckReg: REG, result: 'no-issues', inspectedBy: 'Head of Engineering',
  });

  /* ---- the promise: reason + expected date ---- */
  for (const seat of ['hoe', 'em', 'admin'])
    await check('set reason + expected date', SEATS[seat], true, '/api/engineering/grounding', 'PATCH', {
      kind: 'head', id: truck, reason: 'matrix test', expectedReadyAt: '2026-12-01',
    });
  for (const seat of ['workshop', 'tm'])
    await check('set reason + expected date', SEATS[seat], false, '/api/engineering/grounding', 'PATCH', {
      kind: 'head', id: truck, reason: 'matrix test', expectedReadyAt: '2026-12-01',
    });

  /* ---- the truck's thread ---- */
  for (const seat of ['workshop', 'hoe', 'tm'])
    await check("open the truck's chat", SEATS[seat], true, '/api/engineering/assets/thread', 'POST', { kind: 'head', id: truck });

  /* ---- raising parts: workshop yes, the approvers no ---- */
  await check('raise a part request', SEATS.workshop, true, '/api/inventory-requisitions', 'POST', {
    workOrder: wo, truckReg: REG, mechanic: 'Test Engineer', part: 'Matrix Part',
    quantity: 1, reason: 'matrix test', status: 'Awaiting HOE Review', targetType: 'Truck Head',
  });
  for (const seat of ['hoe', 'em'])
    await check('raise a part request', SEATS[seat], false, '/api/inventory-requisitions', 'POST', {
      workOrder: wo, truckReg: REG, mechanic: seat, part: 'Matrix Part',
      quantity: 1, reason: 'matrix test', status: 'Awaiting HOE Review', targetType: 'Truck Head',
    });
} catch (e) {
  problems.push('fixture: ' + e.message);
  console.log('FAILED:', e.message);
} finally {
  if (wo) {
    await prisma.inventoryRequisition.deleteMany({ where: { workOrder: wo } }).catch(() => {});
    await prisma.workOrder.delete({ where: { id: wo } }).catch(() => {});
  }
  if (tail) await prisma.tail.delete({ where: { id: tail } }).catch(() => {});
  if (truck) {
    await prisma.workOrder.deleteMany({ where: { truckReg: REG } }).catch(() => {});
    await prisma.conversation.deleteMany({ where: { assetKey: `head:${truck}` } }).catch(() => {});
    await prisma.truck.delete({ where: { id: truck } }).catch(() => {});
  }
  console.log('\ncleaned up the fixture rows');
  console.log(problems.length ? `${problems.length} PROBLEM(S):` : 'every seat can do what its screen offers');
  for (const p of problems) console.log(' - ' + p);
  await prisma.$disconnect();
  process.exit(problems.length ? 1 : 0);
}
