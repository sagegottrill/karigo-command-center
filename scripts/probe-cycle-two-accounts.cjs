/**
 * Full-cycle proof with the accounts we can actually log into:
 *   pour leg   — the TM account itself is in LUBRICANT_WRITE_ROLES, so the
 *                pour endpoint is exercised exactly as the department's
 *                screen calls it (same POST, same payload shape);
 *   review leg — the same account's Transport Manager authority approves.
 * Everything (row + litre) is restored afterwards.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const BASE = 'http://localhost:3001';

const login = async () => {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'manager@petroline.ng', password: 'Petroline@2026' }),
  });
  const j = await r.json();
  if (!r.ok || !j.token) throw new Error('login failed: ' + r.status);
  return j.token;
};

(async () => {
  const token = await login();

  const candidates = await prisma.trip.findMany({
    where: { status: { in: ['Scheduled', 'Loaded', 'En Route', 'Offloading', 'Returning', 'Delayed', 'Completed'] } },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { id: true, status: true },
  });
  const used = new Set((await prisma.lubricantDisbursal.findMany({ select: { tripId: true } })).map((e) => e.tripId));
  const trip = candidates.find((t) => !used.has(t.id));
  if (!trip) {
    console.log('NO-CANDIDATE: every released trip already has a disbursal.');
    return;
  }

  const before = await prisma.lubricantStock.findUnique({ where: { fuelType: 'Diesel' } });
  console.log(`trip ${String(trip.id).slice(-6)} (${trip.status}) | tank before: ${before.quantity.toLocaleString()} L`);

  const pour = await fetch(`${BASE}/api/lubricant/disbursals`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tripId: trip.id, fuelType: 'Diesel', quantity: 1, dispensedBy: 'Cycle Probe' }),
  });
  const pourBody = await pour.json();
  if (!pour.ok) {
    console.log('POUR FAILED:', pour.status, JSON.stringify(pourBody));
    return;
  }
  const mid = await prisma.lubricantStock.findUnique({ where: { fuelType: 'Diesel' } });
  console.log(`pour ok | tank after pour: ${mid.quantity.toLocaleString()} L (${mid.quantity === before.quantity - 1 ? 'deducted ✓' : 'UNEXPECTED'}) | row status: ${pourBody.status}`);

  const review = await fetch(`${BASE}/api/lubricant/disbursals/${pourBody.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'Approved', note: 'cycle probe' }),
  });
  const reviewBody = await review.json();
  console.log(`TM approve → ${review.status} | status: ${reviewBody.status} | reviewedBy: ${reviewBody.reviewedBy || '-'}`);

  await prisma.lubricantDisbursal.delete({ where: { id: pourBody.id } });
  const after = await prisma.lubricantStock.update({ where: { fuelType: 'Diesel' }, data: { quantity: { increment: 1 } } });
  console.log(`restored: row deleted, tank back to ${after.quantity.toLocaleString()} L`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
