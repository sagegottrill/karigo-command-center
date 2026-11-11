/**
 * DESK HAPPY PATH + PARTNER WALL — the other half of privilege-sweep.
 *
 * privilege-sweep proves an outsider is refused. That alone is not enough: a
 * guard set too tight breaks the desk that owns the button, and a partner wall
 * applied to the partner's own portal breaks the customer. This walks both
 * edges against the LIVE API with real accounts from the database.
 *
 *   node scripts/desk-happy-path.mjs
 *
 * "allowed" means the seat must get PAST authorization — a 400 or a 404 is a
 * pass, because that is validation or a missing row, not a refusal. Only a 403
 * fails it. "denied" means only a 403 passes.
 *
 * It writes nothing: every body is junk or an id that does not exist.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const API = 'http://127.0.0.1:3001';
const prisma = new PrismaClient();
const GHOST = '00000000-0000-4000-8000-00000000dead';

const seat = async (role, email) => {
  const u = await prisma.user.findFirst({
    where: email ? { email } : { role, status: 'Active' },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!u) throw new Error(`no account for ${role || email}`);
  return {
    ...u,
    token: jwt.sign({ id: u.id, email: u.email, role: u.role, roles: [u.role], name: u.name }, process.env.JWT_SECRET, { expiresIn: '1h' }),
  };
};

const store = await seat('Parts & Store');
const tm = await seat('Transport Manager');
const lubricant = await seat('Lubricant');
const accounts = await seat('Accounts');
const workshop = await seat('Engineering');
const partner = await seat(null, 'q.tester@test.com');

const call = async (who, method, path, body) => {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + who.token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let note = '';
  try { note = String(JSON.parse(text)?.error || '').slice(0, 70); } catch { note = text.replace(/\s+/g, ' ').slice(0, 70); }
  return { status: res.status, note };
};

const problems = [];
const run = async (label, who, expect, method, path, body) => {
  const { status, note } = await call(who, method, path, body);
  const refused = status === 403;
  const pass = expect === 'allowed' ? !refused : refused;
  console.log(`${pass ? 'ok  ' : 'BUG '} ${String(status).padEnd(3)} ${who.role.padEnd(26)} ${label.padEnd(34)} ${note ? '· ' + note : ''}`);
  if (!pass) {
    problems.push(
      expect === 'allowed'
        ? `${who.role} is REFUSED ${label} — the desk that owns it cannot use it (403)`
        : `${who.role} is NOT refused ${label} (got ${status})`,
    );
  }
  return { status, note };
};

/* ---- the desks that own the endpoints privilege-sweep just locked down ---- */
console.log(`store: ${store.name} · lubricant: ${lubricant.name} · tm: ${tm.name}\n`);
await run('raise a part request', store, 'allowed', 'POST', '/api/inventory-requisitions', {});
await run('edit a part request', store, 'allowed', 'PATCH', `/api/inventory-requisitions/${GHOST}`, { reason: 'x' });
await run('pick parts for a job', store, 'allowed', 'POST', `/api/inventory-handoffs/${GHOST}/pick`, { picked: true });
await run('sign a part handoff', store, 'allowed', 'POST', `/api/inventory-handoffs/${GHOST}/complete`, { signature: 'x' });
await run('decide a restock', tm, 'allowed', 'PATCH', `/api/restock-requests/${GHOST}`, { decision: 'Approved' });
await run('raise a restock', store, 'allowed', 'POST', '/api/restock-requests', {});
// Same rule as the part requests: the desk that raises does not approve it.
await run('approve the restock it raised', store, 'denied', 'PATCH', `/api/restock-requests/${GHOST}`, { decision: 'Approved' });
await run('record a purchase', store, 'allowed', 'POST', `/api/inventory/${GHOST}/purchase`, {});
await run('raise a tank draw', tm, 'allowed', 'POST', '/api/fuel-requests', {});
await run('raise a tank draw', lubricant, 'allowed', 'POST', '/api/fuel-requests', {});
await run('record fuel taken', tm, 'allowed', 'POST', '/api/fuel', {});
await run('record fuel taken', accounts, 'allowed', 'POST', '/api/fuel', {});
await run('set the fuel price', tm, 'allowed', 'PUT', '/api/fuel-prices', {});
await run('record a lubricant draw', lubricant, 'allowed', 'POST', '/api/lubricant/disbursals', {});
await run('restock lubricant', lubricant, 'allowed', 'POST', '/api/lubricant/restocks', {});
await run('raise a work order', workshop, 'allowed', 'POST', '/api/work-orders', {});

/* ---- the partner wall: nothing of the yard, but their own portal intact ---- */
console.log(`\npartner: ${partner.name} <${partner.email}>\n`);
await run('read the work-order board', partner, 'denied', 'GET', '/api/work-orders', undefined);
await run('read procurement', partner, 'denied', 'GET', '/api/procurement', undefined);
await run('read the stock ledger', partner, 'denied', 'GET', '/api/inventory-movements', undefined);
await run('read the staff list', partner, 'denied', 'GET', '/api/users', undefined);
await run('read the audit trail', partner, 'denied', 'GET', '/api/audit', undefined);
await run('read the login ledger', partner, 'denied', 'GET', '/api/login-reports', undefined);
await run('read the engineer roster', partner, 'denied', 'GET', '/api/engineering/technicians', undefined);
await run('raise a tank draw', partner, 'denied', 'POST', '/api/fuel-requests', {});
await run('raise a part request', partner, 'denied', 'POST', '/api/inventory-requisitions', {});
await run('add a truck', partner, 'denied', 'POST', '/api/trucks', { registration: 'P-SWEEP' });
await run('add a staff account', partner, 'denied', 'POST', '/api/users', { name: 'x', email: 'x@test.local' });

// Their own portal must still open.
await run('open their own threads', partner, 'allowed', 'GET', '/api/conversations', undefined);
await run('read their dispatches', partner, 'allowed', 'GET', '/api/trips', undefined);
await run('read their sites', partner, 'allowed', 'GET', '/api/partner-sites', undefined);

console.log('\n' + (problems.length ? `${problems.length} PROBLEM(S)` : 'both edges hold: every desk can work, every partner door is shut'));
for (const p of problems) console.log(' - ' + p);
await prisma.$disconnect();
process.exit(problems.length ? 1 : 0);
