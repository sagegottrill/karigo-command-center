/**
 * FULL API SWEEP — every read endpoint, called for real, on the live box.
 *
 * A 500 in this app is silent: the page just shows an empty list, and nobody
 * files it. This walks the whole read surface as the Platform Admin (the
 * widest seat), with real ids taken from the database, and prints everything
 * that is not a 2xx — so a broken select or a stale client shows up as a list
 * instead of a guess.
 *
 *   node scripts/api-sweep.mjs
 * Read-only: it creates and deletes nothing.
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const API = 'http://127.0.0.1:3001';
const prisma = new PrismaClient();

const admin = await prisma.user.findFirst({
  where: { role: 'Platform Admin', status: 'Active' },
  select: { id: true, name: true, email: true },
});
if (!admin) throw new Error('no active Platform Admin to test as');

const token = jwt.sign(
  { id: admin.id, email: admin.email, role: 'Platform Admin', roles: ['Platform Admin'], name: admin.name },
  process.env.JWT_SECRET,
  { expiresIn: '1h' },
);

// Real ids, so ":id" routes are exercised rather than skipped.
const [trip, truck, tail, driver, convo, doc, pickup] = await Promise.all([
  prisma.trip.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }),
  prisma.truck.findFirst({ select: { id: true } }),
  prisma.tail.findFirst({ select: { id: true } }),
  prisma.driver.findFirst({ select: { id: true } }),
  prisma.conversation.findFirst({ select: { id: true } }),
  prisma.procurementDocument.findFirst({ select: { id: true } }),
  prisma.loadingPickup.findFirst({ select: { id: true } }),
]);

const ROUTES = [
  '/api/health',
  '/api/auth/me',
  '/api/dashboard/overview',
  '/api/trucks',
  '/api/tails',
  '/api/drivers',
  driver ? `/api/drivers/${driver.id}/licence` : null,
  '/api/trips',
  trip ? `/api/trips/${trip.id}` : null,
  '/api/work-orders',
  '/api/worklist',
  '/api/inventory',
  '/api/inventory-movements',
  '/api/inventory-requisitions',
  '/api/inventory-handoffs',
  '/api/procurement',
  '/api/procurement/documents',
  doc ? `/api/procurement/documents/${doc.id}` : null,
  '/api/restock-requests',
  '/api/vendors',
  '/api/vendors/price-history',
  '/api/partners',
  '/api/partner-sites',
  '/api/audit',
  '/api/login-reports',
  '/api/users',
  '/api/users/username-conflicts',
  '/api/tenants',
  '/api/notifications',
  '/api/notifications/summary',
  '/api/notifications/unread',
  '/api/expenses',
  '/api/fuel',
  '/api/fuel-prices',
  '/api/fuel-requests',
  '/api/fuel-requests/desk',
  '/api/gate',
  '/api/lubricant/disbursals',
  '/api/lubricant/notifications',
  '/api/lubricant/overview',
  '/api/lubricant/requests',
  '/api/lubricant/restocks',
  '/api/loading-sites',
  '/api/loading-site',
  pickup ? `/api/loading-site/pickups/${pickup.id}` : null,
  '/api/tracking/recent',
  trip ? `/api/tracking/${trip.id}` : null,
  '/api/chat/directory',
  '/api/chat/targets',
  '/api/conversations',
  '/api/conversations/unread',
  convo ? `/api/conversations/${convo.id}/members` : null,
  convo ? `/api/conversations/${convo.id}/receipts` : null,
  '/api/engineering/technicians',
].filter(Boolean);

const failures = [];
for (const path of ROUTES) {
  const started = Date.now();
  let status = 0;
  let note = '';
  try {
    const res = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token } });
    status = res.status;
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    if (status >= 300) note = String(parsed?.error || text.slice(0, 140)).replace(/\s+/g, ' ');
    else if (Array.isArray(parsed)) note = parsed.length + ' rows';
    else if (parsed && typeof parsed === 'object') note = Object.keys(parsed).slice(0, 4).join(',');
  } catch (e) {
    status = 0;
    note = e.message;
  }
  const ms = Date.now() - started;
  const flag = status >= 200 && status < 300 ? 'ok  ' : 'FAIL';
  console.log(`${flag} ${String(status).padEnd(3)} ${String(ms).padStart(5)}ms ${path} ${note ? '· ' + note : ''}`);
  if (!(status >= 200 && status < 300)) failures.push({ path, status, note });
}

console.log('\n' + (failures.length ? `${failures.length} FAILING ENDPOINT(S)` : 'every endpoint answered'));
for (const f of failures) console.log(` - ${f.path} -> ${f.status} ${f.note}`);
await prisma.$disconnect();
process.exit(failures.length ? 1 : 0);
