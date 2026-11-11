/**
 * PRIVILEGE SWEEP — can a seat that should not touch the store touch it?
 *
 * The engineering matrix caught an approver raising his own request because the
 * route had no role guard at all. This hunts the same class of hole across the
 * desks engineering does not own: fuel, lubricant, parts & store, procurement
 * and the chat. It calls each state-changing endpoint as a seat that has no
 * business there and prints every answer that is NOT a 403.
 *
 * Why 404 counts as a hole: a 404 means the request reached the database lookup,
 * so the seat was never refused — it merely aimed at a row that does not exist.
 * Aimed at a real one, the same call would have written.
 *
 *   node scripts/privilege-sweep.mjs
 * Every call uses a ghost id and a junk body, so nothing is created.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const API = 'http://127.0.0.1:3001';
const prisma = new PrismaClient();
const GHOST = '00000000-0000-4000-8000-00000000dead';

const tokenOf = (u) =>
  jwt.sign({ id: u.id, email: u.email, role: u.role, roles: [u.role], name: u.name }, process.env.JWT_SECRET, { expiresIn: '1h' });

// The seats with no business on these desks.
const outsider = async (roles) => {
  for (const role of roles) {
    const u = await prisma.user.findFirst({ where: { role, status: 'Active' }, select: { id: true, email: true, name: true, role: true } });
    if (u) return u;
  }
  return null;
};

const security = await outsider(['Security', 'Gate Security', 'Gate']);
const driver = await outsider(['Driver', 'Fleet Field Ops', 'Fleet Field Operations']);
if (!security) throw new Error('no Security seat found to test with');

/**
 * [label, method, path, junk body]
 * None of these belongs to Security. Each must come back 403.
 */
const CASES = [
  ['raise a work order', 'POST', '/api/work-orders', { truckReg: 'X', defect: 'sweep' }],
  ['close a work order', 'PATCH', `/api/work-orders/${GHOST}`, { status: 'Completed' }],
  ['delete a work order', 'DELETE', `/api/work-orders/${GHOST}`, undefined],
  ['raise a part request', 'POST', '/api/inventory-requisitions', { workOrder: GHOST, truckReg: 'X', mechanic: 'x', part: 'x', quantity: 1, reason: 'x' }],
  ['approve/reject a part request', 'PATCH', `/api/inventory-requisitions/${GHOST}`, { status: 'Released' }],
  ['raise a restock request', 'POST', '/api/restock-requests', { sku: 'X', quantity: 1 }],
  ['decide a restock request', 'PATCH', `/api/restock-requests/${GHOST}`, { status: 'Approved' }],
  ['edit the shelf', 'PATCH', `/api/inventory/${GHOST}`, { stock: 999 }],
  ['delete a stock line', 'DELETE', `/api/inventory/${GHOST}`, undefined],
  ['record a purchase', 'POST', `/api/inventory/${GHOST}/purchase`, { quantity: 1, unitCost: 1 }],
  ['reconcile the shelf', 'POST', `/api/inventory/${GHOST}/reconcile`, { stock: 5 }],
  ['pick parts for a job', 'POST', `/api/inventory-handoffs/${GHOST}/pick`, { pickedBy: 'x' }],
  ['complete a part handoff', 'POST', `/api/inventory-handoffs/${GHOST}/complete`, { signature: 'x' }],
  ['raise a procurement request', 'POST', '/api/procurement', { item: 'x', quantity: 1 }],
  ['advance a procurement request', 'PATCH', `/api/procurement/${GHOST}`, { status: 'Approved' }],
  ['receive a procurement request', 'POST', `/api/procurement/${GHOST}/receive`, { receivedBy: 'x' }],
  ['add a vendor', 'POST', '/api/vendors', { name: 'Sweep Vendor' }],
  ['edit a vendor', 'PATCH', `/api/vendors/${GHOST}`, { name: 'x' }],
  ['set a fuel price', 'PUT', '/api/fuel-prices', { price: 1 }],
  ['raise a fuel request', 'POST', '/api/fuel-requests', { truckReg: 'X', litres: 1 }],
  ['review a fuel request', 'POST', `/api/fuel-requests/${GHOST}/hoe-review`, { decision: 'Approved' }],
  ['dispense fuel', 'POST', `/api/fuel-requests/${GHOST}/dispense`, { litres: 1 }],
  ['record fuel taken', 'POST', '/api/fuel', { truckReg: 'X', litres: 1, cost: 1 }],
  ['record a lubricant draw', 'POST', '/api/lubricant/disbursals', { sku: 'X', quantity: 1 }],
  ['restock lubricant', 'POST', '/api/lubricant/restocks', { sku: 'X', quantity: 1 }],
  ['inspect a truck', 'POST', '/api/engineering/inspections', { headId: GHOST, truckReg: 'X', result: 'no-issues' }],
  ['set a grounding promise', 'PATCH', '/api/engineering/grounding', { kind: 'head', id: GHOST, reason: 'x' }],
  ['open an asset thread', 'POST', '/api/engineering/assets/thread', { kind: 'head', id: GHOST }],
  ['add a truck', 'POST', '/api/trucks', { registration: 'SWEEP-1' }],
  ['edit a truck', 'PATCH', `/api/trucks/${GHOST}`, { status: 'Available' }],
  ['add a staff account', 'POST', '/api/users', { name: 'Sweep', email: 'sweep@test.local' }],
];

/* The chat is guarded by MEMBERSHIP, not by role, so a ghost thread answers 404
 * for the right reason (it does not exist). These two aim at a REAL thread the
 * Security seat is not part of, which is the case that matters. */
const otherThread = await prisma.conversation.findFirst({
  where: { tripId: null },
  orderBy: { createdAt: 'desc' },
  select: { id: true, memberIds: true, name: true, kind: true },
});
if (otherThread && !(otherThread.memberIds || []).map(String).includes(security.id)) {
  CASES.push(['post into someone else\u2019s thread', 'POST', `/api/conversations/${otherThread.id}/messages`, { body: 'sweep' }]);
  CASES.push(['add someone to a thread', 'POST', `/api/conversations/${otherThread.id}/members`, { memberId: security.id }]);
}

const call = async (who, method, path, body) => {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + tokenOf(who), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let note = '';
  try { note = String(JSON.parse(text)?.error || '').slice(0, 70); } catch { note = text.replace(/\s+/g, ' ').slice(0, 70); }
  return { status: res.status, note };
};

const holes = [];
console.log(`testing as: ${security.name} <${security.email}> · ${security.role}\n`);
for (const [label, method, path, body] of CASES) {
  const { status, note } = await call(security, method, path, body);
  const refused = status === 403;
  console.log(`${refused ? 'ok   ' : 'HOLE '} ${String(status).padEnd(3)} ${label.padEnd(32)} ${refused ? '' : '· ' + note}`);
  if (!refused) holes.push(`${label}: ${method} ${path} -> ${status} ${note}`);
}

// A partner is the other outsider: they belong in their own threads, nowhere else.
const partner = await prisma.user.findFirst({
  where: { OR: [{ role: 'Partner' }, { role: { contains: 'Partner' } }] },
  select: { id: true, email: true, name: true, role: true },
});
const partnerHoles = [];
if (partner) {
  console.log(`\npartner seat: ${partner.name} <${partner.email}> · ${partner.role}\n`);
  const FORBIDDEN = [
    ['read the work-order board', 'GET', '/api/work-orders', undefined],
    ['read procurement', 'GET', '/api/procurement', undefined],
    ['read the stock ledger', 'GET', '/api/inventory-movements', undefined],
    ['raise a fuel request', 'POST', '/api/fuel-requests', { truckReg: 'X', litres: 1 }],
    ['add a staff account', 'POST', '/api/users', { name: 'P', email: 'p@test.local' }],
  ];
  for (const [label, method, path, body] of FORBIDDEN) {
    const { status, note } = await call(partner, method, path, body);
    const refused = status === 403;
    console.log(`${refused ? 'ok   ' : 'HOLE '} ${String(status).padEnd(3)} ${label.padEnd(32)} ${refused ? '' : '· ' + note}`);
    if (!refused) partnerHoles.push(`${label}: ${method} ${path} -> ${status} ${note}`);
  }
} else {
  console.log('\nno partner seat to test with — skipped');
}

const all = [...holes, ...partnerHoles];
console.log('\n' + (all.length ? `${all.length} SEAT(S) REACHED A DESK THEY DO NOT OWN` : 'every outsider was refused on every desk'));
for (const h of all) console.log(' - ' + h);
await prisma.$disconnect();
process.exit(all.length ? 1 : 0);
