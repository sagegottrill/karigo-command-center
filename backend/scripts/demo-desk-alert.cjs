#!/usr/bin/env node
/*
 * "Where do I SEE the fuel request?" — answered against the live API.
 *
 *   node scripts/demo-desk-alert.cjs            # raise a labelled demo request + show the desk's bell
 *   node scripts/demo-desk-alert.cjs --cleanup  # remove the demo row and its alerts
 *
 * It signs in (by token) as a real Lubricant-desk account and prints exactly
 * what THAT account's notification bell returns — the same response the web
 * app's bell and /workspace/app/notifications page render.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3001';
const MARKER = 'DEMO for Daniel — how the diesel desk sees a request';
const prisma = new PrismaClient();

const sign = (u, roles) => jwt.sign(
  { id: u.id, email: u.email, name: u.name, role: u.role, roles },
  process.env.JWT_SECRET, { expiresIn: '1h' },
);

async function call(method, url, token, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, json, text };
}

(async () => {
  if (process.argv[2] === '--cleanup') {
    const rows = await prisma.fuelRequest.findMany({ where: { purpose: { contains: 'DEMO for Daniel' } } });
    for (const r of rows) {
      await prisma.fuelRequest.delete({ where: { id: r.id } });
      await prisma.notification.deleteMany({ where: { refId: r.id } });
      console.log('removed ' + r.reference + ' and its alerts');
    }
    if (!rows.length) console.log('nothing to clean');
    return prisma.$disconnect();
  }

  // The desk account: a real Lubricant user, and the manager who raises for the yard.
  const deskUser = await prisma.user.findFirst({
    where: { role: 'Lubricant', status: 'Active' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, email: true, role: true },
  });
  const tm = await prisma.user.findFirst({
    where: { role: 'Transport Manager' },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!deskUser || !tm) throw new Error('no Lubricant desk account or Transport Manager found');

  const deskToken = sign(deskUser, [deskUser.role]);
  const tmToken = sign(tm, [tm.role, 'Platform Admin']);

  const before = await call('GET', '/api/notifications/unread', deskToken);
  console.log('desk account            : ' + deskUser.name + ' <' + deskUser.email + '> (role ' + deskUser.role + ')');
  console.log('unread before           : ' + before.json.count);

  // A walk-in buyer at the yard, exactly as the gate would raise it.
  const raised = await call('POST', '/api/fuel-requests', tmToken, {
    fuelType: 'Diesel',
    quantity: 50,
    source: 'Walk-In Sale',
    requestedBy: 'Yard buyer (walk-in)',
    requestedFor: 'Walk-in — paper slip',
    purpose: MARKER,
    note: 'raised by the demo script so Daniel can see where it lands',
  });
  if (!raised.json?.id) throw new Error('raise failed: ' + raised.status + ' ' + raised.text.slice(0, 300));
  const req = raised.json;
  console.log('\nraised                  : ' + req.reference + ' — ' + req.quantity + ' L ' + req.fuelType +
    ' (' + req.source + '), status ' + req.status);

  // What the DIESEL DESK's own bell now returns.
  const after = await call('GET', '/api/notifications?limit=10', deskToken);
  const mine = (after.json || []).filter((n) => String(n.refId) === String(req.id));
  console.log('unread after            : ' + (await call('GET', '/api/notifications/unread', deskToken)).json.count);
  console.log('on the desk\'s bell      : ' + (mine.length > 0 ? 'YES' : 'NO'));
  for (const n of mine) {
    console.log('   ├─ "' + n.title + '"');
    console.log('   │  ' + n.body);
    console.log('   │  needs me: ' + n.actionRequired + ' | module: ' + n.module + ' | actionRoles: [' + (n.actionRoles || []).join(', ') + ']');
  }

  const desk = await call('GET', '/api/fuel-requests/desk', deskToken);
  const queued = (desk.json?.waiting || []).some((r) => r.id === req.id);
  console.log('in the desk queue       : ' + (queued ? 'YES' : 'NO') +
    ' (counts: ' + JSON.stringify(desk.json?.counts) + ')');

  console.log('\nIn the web app, as ' + deskUser.email + ':');
  console.log('   • the BELL (top bar) shows "' + (mine[0]?.title || 'New Diesel request') + '" with a "needs me" mark');
  console.log('   • the NOTIFICATION CENTER is /workspace/app/notifications');
  console.log('   • the diesel desk QUEUE screen is not built yet — this bell row is the visible surface today');
  console.log('\nclean up with: node scripts/demo-desk-alert.cjs --cleanup');
  await prisma.$disconnect();
})().catch(async (e) => { console.error('FAILED:', e.message); await prisma.$disconnect(); process.exit(1); });
