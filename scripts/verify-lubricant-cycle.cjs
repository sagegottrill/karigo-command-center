/**
 * Full-cycle proof, read-mostly:
 *   1. login as the Lubricant department account,
 *   2. pick a released trip without an existing disbursal (or report none),
 *   3. POST /api/lubricant/disbursals (this REALLY deducts the tank),
 *   4. login as the TM, PATCH approve it,
 *   5. confirm status/reviewedBy + tank before/after,
 *   6. leave a RESTORE file so the probe can be undone exactly.
 *
 * Run on the host: node scripts/verify-lubricant-cycle.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const BASE = 'http://localhost:3001';

const login = async (email, password) => {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: email, password }),
  });
  const j = await r.json();
  if (!r.ok || !j.token) throw new Error(`login ${email} failed: ${r.status}`);
  return j.token;
};

(async () => {
  const deptToken = await login(process.argv[2] || "t.lubricant@petrolline.fleetopsx.com", process.argv[3] || "Petroline@2026");
  const tmToken = await login('manager@petroline.ng', 'Petroline@2026');

  // Find a released trip the pump can answer, with no disbursal yet.
  const candidates = await prisma.trip.findMany({
    where: { status: { in: ['Scheduled', 'Loaded', 'En Route', 'Offloading', 'Returning', 'Delayed', 'Completed'] } },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { id: true, status: true, dropoff: true },
  });
  const existing = await prisma.lubricantDisbursal.findMany({ select: { tripId: true } });
  const used = new Set(existing.map((e) => e.tripId));
  const trip = candidates.find((t) => !used.has(t.id));
  if (!trip) {
    console.log('NO-CANDIDATE: every released trip already has a disbursal; nothing to probe without inventing a trip.');
    return;
  }

  const before = await prisma.lubricantStock.findUnique({ where: { fuelType: 'Diesel' } });
  console.log(`probe trip ${String(trip.id).slice(-6)} (${trip.status}) | tank before: ${before.quantity.toLocaleString()} L`);

  // The pour (same endpoint the department's screen uses).
  const pour = await fetch(`${BASE}/api/lubricant/disbursals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deptToken}` },
    body: JSON.stringify({ tripId: trip.id, fuelType: 'Diesel', quantity: 1, dispensedBy: 'Cycle Probe' }),
  });
  const pourBody = await pour.json();
  if (!pour.ok) {
    console.log('POUR FAILED:', pour.status, JSON.stringify(pourBody));
    return;
  }
  const mid = await prisma.lubricantStock.findUnique({ where: { fuelType: 'Diesel' } });
  console.log(`pour ok ${pourBody.reference || ''} | tank after pour: ${mid.quantity.toLocaleString()} L | status: ${pourBody.status}`);

  // The TM's word — the exact PATCH the Pending Approval section fires.
  const review = await fetch(`${BASE}/api/lubricant/disbursals/${pourBody.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tmToken}` },
    body: JSON.stringify({ status: 'Approved', note: 'cycle probe' }),
  });
  const reviewBody = await review.json();
  console.log('TM approve →', review.status, `| status: ${reviewBody.status} | reviewedBy: ${reviewBody.reviewedBy}`);

  // Restore exactly: delete the probe row, give the litre back.
  await prisma.lubricantDisbursal.delete({ where: { id: pourBody.id } });
  const after = await prisma.lubricantStock.update({ where: { fuelType: 'Diesel' }, data: { quantity: { increment: 1 } } });
  console.log(`restored: probe row deleted, tank back to ${after.quantity.toLocaleString()} L`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
