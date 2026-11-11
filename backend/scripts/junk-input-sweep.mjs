/**
 * JUNK-INPUT SWEEP — does a bad request come back as a 4xx, or as a 500?
 *
 * A 500 here means the desk's screen shows "Internal Server Error" with no way
 * to know whether the write happened. Every one of these calls is deliberately
 * wrong: a missing body, an unknown id, a nonsense asset kind. Each MUST be
 * refused cleanly (400/403/404), never blow up.
 *
 *   node scripts/junk-input-sweep.mjs
 * It writes nothing: every call is either invalid or aimed at an id that does
 * not exist.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';

const API = 'http://127.0.0.1:3001';
const seat = (role, id) =>
  jwt.sign({ id, email: `${role.replace(/\s+/g, '.').toLowerCase()}@test.local`, role, roles: [role], name: 'Sweep ' + role }, process.env.JWT_SECRET, { expiresIn: '1h' });

const ADMIN = seat('Platform Admin', '00000000-0000-4000-8000-000000000001');
const WORKSHOP = seat('Engineering', '2cf5cdfa-3fad-43f3-ac57-0c40ad340e6f');
const HOE = seat('Head of Engineering', '2fa1a1f2-d655-47ed-a946-367ef80333fd');
const TM = seat('Transport Manager', '639c59b8-1418-4d6a-b9f6-5148895b41f1');
const GHOST = '00000000-0000-4000-8000-00000000dead';

const CASES = [
  ['raise a job with no body', WORKSHOP, 'POST', '/api/work-orders', {}],
  ['raise a job with no plate', WORKSHOP, 'POST', '/api/work-orders', { defect: 'x' }],
  ['close a job that does not exist', HOE, 'PATCH', `/api/work-orders/${GHOST}`, { status: 'Completed' }],
  ['unknown status on a job', HOE, 'PATCH', `/api/work-orders/${GHOST}`, { status: 'Teleported' }],
  ['negative cost on a job', HOE, 'PATCH', `/api/work-orders/${GHOST}`, { cost: -5 }],
  ['inspect with no body', WORKSHOP, 'POST', '/api/engineering/inspections', {}],
  ['inspect an unknown truck', WORKSHOP, 'POST', '/api/engineering/inspections', { headId: GHOST, truckReg: 'X', result: 'no-issues' }],
  ['inspect with a nonsense result', WORKSHOP, 'POST', '/api/engineering/inspections', { headId: GHOST, truckReg: 'X', result: 'maybe' }],
  ['grounding with no body', HOE, 'PATCH', '/api/engineering/grounding', {}],
  ['grounding an unknown truck', HOE, 'PATCH', '/api/engineering/grounding', { kind: 'head', id: GHOST, reason: 'x' }],
  ['grounding a nonsense kind', HOE, 'PATCH', '/api/engineering/grounding', { kind: 'wheel', id: GHOST, reason: 'x' }],
  ['grounding a junk date', HOE, 'PATCH', '/api/engineering/grounding', { kind: 'head', id: GHOST, expectedReadyAt: 'next friday' }],
  ['thread with no body', TM, 'POST', '/api/engineering/assets/thread', {}],
  ['thread for an unknown truck', TM, 'POST', '/api/engineering/assets/thread', { kind: 'head', id: GHOST }],
  ['raise a requisition with no body', WORKSHOP, 'POST', '/api/inventory-requisitions', {}],
  ['edit a requisition that does not exist', TM, 'PATCH', `/api/inventory-requisitions/${GHOST}`, { reason: 'x' }],
  ['new truck with no body', TM, 'POST', '/api/trucks', {}],
  ['edit an unknown truck', TM, 'PATCH', `/api/trucks/${GHOST}`, { status: 'Available' }],
  ['edit an unknown tail', TM, 'PATCH', `/api/tails/${GHOST}`, { status: 'Available' }],
  ['new tail with no number', TM, 'POST', '/api/tails', {}],
  ['read an unknown trip', ADMIN, 'GET', `/api/trips/${GHOST}`, undefined],
  ['read an unknown driver licence', ADMIN, 'GET', `/api/drivers/${GHOST}/licence`, undefined],
  ['read an unknown tracking trail', ADMIN, 'GET', `/api/tracking/${GHOST}`, undefined],
  ['read an unknown conversation', ADMIN, 'GET', `/api/conversations/${GHOST}/members`, undefined],
];

const problems = [];
for (const [label, token, method, path, body] of CASES) {
  let status = 0;
  let note = '';
  try {
    const res = await fetch(API + path, {
      method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = res.status;
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      note = String(parsed?.error || '').slice(0, 90);
    } catch {
      note = text.replace(/\s+/g, ' ').slice(0, 90);
    }
  } catch (e) {
    note = e.message;
  }
  const crashed = status >= 500 || status === 0;
  console.log(`${crashed ? 'BUG ' : 'ok  '} ${String(status).padEnd(3)} ${label.padEnd(38)} ${note}`);
  if (crashed) problems.push(`${label} -> ${status} ${note}`);
}

console.log('\n' + (problems.length ? `${problems.length} JUNK INPUT(S) CRASHED THE API` : 'every bad request was refused cleanly'));
for (const p of problems) console.log(' - ' + p);
process.exit(problems.length ? 1 : 0);
