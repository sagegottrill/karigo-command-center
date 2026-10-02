#!/usr/bin/env node
/*
 * Smoke test for the fuel-desk feature (walk-in diesel buyers + internal draws).
 *
 *   node scripts/smoke-fueldesk.cjs            # read-only: partners, queue, desk, worklist
 *   node scripts/smoke-fueldesk.cjs --write    # raise → clear → dispense one 2 L internal draw
 *   node scripts/smoke-fueldesk.cjs --cleanup  # undo what --write created (row, stock, alerts)
 *
 * It runs ON the API host (uses the app's own .env + jsonwebtoken) and talks to
 * 127.0.0.1:3001, so it never needs a real password.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3001';
const TM = { id: '639c59b8-1418-4d6a-b9f6-5148895b41f1', email: 'manager@petroline.ng', name: 'Petroline Transport Manager', role: 'Transport Manager', roles: ['Transport Manager'] };
const MARKER = 'SMOKE-TEST fuel desk';

const token = jwt.sign(TM, process.env.JWT_SECRET, { expiresIn: '1h' });

async function call(method, url, body) {
  const res = await fetch(BASE + url, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { /* keep raw */ }
  return { status: res.status, json, text };
}

const show = (label, value) => console.log('\n== ' + label + ' ==\n' + value);

(async () => {
  const mode = process.argv[2] || '--read';

  if (mode === '--read' || mode === '--write') {
    const partners = await call('GET', '/api/partners');
    show('GET /api/partners → ' + partners.status, JSON.stringify(partners.json, null, 1).slice(0, 700));

    const queue = await call('GET', '/api/fuel-requests');
    show('GET /api/fuel-requests → ' + queue.status,
      JSON.stringify({ counts: queue.json?.counts, rows: queue.json?.requests?.length, prices: queue.json?.prices, tanks: queue.json?.tanks }, null, 1));

    const desk = await call('GET', '/api/fuel-requests/desk');
    show('GET /api/fuel-requests/desk → ' + desk.status,
      JSON.stringify({ counts: desk.json?.counts, waiting: desk.json?.waiting?.length, cleared: desk.json?.cleared?.length }, null, 1));

    const notes = await call('GET', '/api/notifications?limit=5');
    show('GET /api/notifications → ' + notes.status,
      JSON.stringify({ rows: notes.json?.length, first: notes.json?.[0]?.title, actionRequired: notes.json?.[0]?.actionRequired }, null, 1));

    const worklist = await call('GET', '/api/worklist');
    show('GET /api/worklist → ' + worklist.status,
      JSON.stringify({
        user: worklist.json?.user?.role,
        sections: {
          fuelRequests: worklist.json?.fuelRequests?.length,
          dispatchRequests: worklist.json?.dispatchRequests?.length,
          pumpQueue: worklist.json?.pumpQueue?.length,
          mine: worklist.json?.mine?.length,
        },
        counts: worklist.json?.counts,
      }, null, 1));
  }

  if (mode === '--write') {
    // A mechanic raising an internal draw, exactly as the yard would.
    const raised = await call('POST', '/api/fuel-requests', {
      fuelType: 'Diesel', quantity: 2, source: 'Internal Use',
      requestedBy: MARKER, requestedFor: 'Petroline',
      purpose: MARKER + ' — engine wash, do not treat as real stock',
    });
    if (!raised.json?.id) return show('POST /api/fuel-requests FAILED → ' + raised.status, raised.text.slice(0, 400));
    const id = raised.json.id;
    console.log('\ncreated ' + raised.json.reference + ' (' + id + ') status=' + raised.json.status + ' qty=' + raised.json.quantity);

    const listed = await call('GET', '/api/fuel-requests?status=Requested');
    console.log('desk queue now lists it: ' + listed.json.requests.some((r) => r.id === id));

    const cleared = await call('PATCH', '/api/fuel-requests/' + id, { status: 'Authorized' });
    console.log('cleared by ' + cleared.json?.authorizedBy + ' → status=' + cleared.json?.status);

    const dispensed = await call('POST', '/api/fuel-requests/' + id + '/dispense', { dispensedBy: MARKER, paymentStatus: 'Unpaid' });
    console.log('dispensed → status=' + dispensed.json?.status + ' litres=' + dispensed.json?.quantity +
      ' unitPrice=' + dispensed.json?.unitPrice + ' amount=' + dispensed.json?.amount +
      ' tank=' + dispensed.json?.stock?.quantity);

    const double = await call('POST', '/api/fuel-requests/' + id + '/dispense', {});
    console.log('double-dispense refused: ' + (double.status === 409) + ' (' + double.json?.error + ')');

    console.log('\nTEST_IDS=' + id + ':' + dispensed.json?.quantity);
    console.log('run: node scripts/smoke-fueldesk.cjs --cleanup');
  }

  if (mode === '--partner') {
    /*
     * The Transport Manager raises a request FOR a partner (Silver Steel,
     * Saba Steel…). It must look exactly like the partner raised it: the row
     * carries their company, it enters the lifecycle pending, and their own
     * dashboard bell (scoped to Partner:<Company>) gets the alert.
     */
    const company = process.argv[3] || 'Saba Steel';
    const raised = await call('POST', '/api/trips', {
      onBehalfOfPartner: company,
      tailType: 'Flatbed',
      requestedTruckType: 'Flatbed',
      pickup: 'Petroline Yard',
      dropoff: 'Kano Dry Port',
      customerConsignee: MARKER + ' consignee',
      cargo: 'Steel coils',
    });
    const trip = raised.json;
    if (!trip?.id) return show('POST /api/trips (on behalf) FAILED → ' + raised.status, raised.text.slice(0, 400));
    console.log('created ' + trip.id + ' status=' + trip.status + ' customer=' + trip.customer);
    console.log('raisedOnBehalf=' + JSON.stringify(trip.directCosts?.raisedOnBehalf));

    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const partnerRows = await prisma.trip.findMany({
      where: { customer: { equals: company, mode: 'insensitive' } }, select: { id: true }, take: 200,
    });
    console.log('the partner sees it on their own list: ' + partnerRows.some((t) => t.id === trip.id));
    const alerts = await prisma.notification.findMany({ where: { refId: trip.id }, select: { title: true, audience: true } });
    console.log('alerts: ' + JSON.stringify(alerts));
    await prisma.$disconnect();

    // Clean up with a Platform Admin token (a TM may not delete a dispatch).
    const adminRow = await new PrismaClient().user.findFirst({ where: { role: 'Platform Admin' }, select: { id: true, email: true, name: true } });
    const adminToken = jwt.sign(
      { id: adminRow.id, email: adminRow.email, name: adminRow.name, role: 'Platform Admin', roles: ['Platform Admin', 'Transport Manager'] },
      process.env.JWT_SECRET, { expiresIn: '1h' },
    );
    const del = await fetch(BASE + '/api/trips/' + trip.id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + adminToken } });
    console.log('test dispatch removed: ' + (del.status === 204) + ' (' + del.status + ')');
  }

  if (mode === '--cleanup') {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    const rows = await prisma.fuelRequest.findMany({ where: { requestedBy: MARKER } });
    for (const row of rows) {
      if (row.status === 'Dispensed') {
        await prisma.lubricantStock.update({ where: { fuelType: row.fuelType }, data: { quantity: { increment: row.quantity } } });
      }
      await prisma.fuelRequest.delete({ where: { id: row.id } });
      await prisma.notification.deleteMany({ where: { refId: row.id } });
      console.log('removed ' + row.reference + ' (' + row.status + ', ' + row.quantity + ' L) and its alerts');
    }
    const stock = await prisma.lubricantStock.findMany();
    console.log('tanks now: ' + stock.map((s) => s.fuelType + '=' + s.quantity).join(', '));
    await prisma.$disconnect();
  }
})().catch((e) => { console.error('SMOKE FAILED:', e.message); process.exit(1); });
