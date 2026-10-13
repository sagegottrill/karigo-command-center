/**
 * RECONCILE-STUCK-TAILS (end-to-end flow, one-time)
 *
 * Evidence rule (read-only unless --apply): a tail still sitting in
 * 'Assigned' / 'Out of Yard' whose naming dispatches are ALL Completed and
 * which NO open dispatch names — a leftover of the historical bare
 * completions (old driver releases and manual closures) — goes to Check Up,
 * exactly where the proper gate flow would have put it.
 *
 *   node reconcile-stuck-tails.cjs          # dry run
 *   node reconcile-stale-returning.cjs --apply
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const OPEN = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];
const STRAY = ['Assigned', 'Out of Yard'];
const key = (v) => String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();

(async () => {
  const openTailKeys = new Set();
  const open = await prisma.trip.findMany({ where: { status: { in: OPEN } }, select: { tailNumber: true } });
  for (const t of open) for (const tok of String(t.tailNumber || '').split(/[\s/]+/)) {
    if (key(tok).length > 2) openTailKeys.add(key(tok));
  }
  const done = await prisma.trip.findMany({
    where: { status: 'Completed' },
    select: { tailNumber: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 600,
  });
  const doneTailKeys = new Set();
  for (const t of done) for (const tok of String(t.tailNumber || '').split(/[\s/]+/)) {
    if (key(tok).length > 2) doneTailKeys.add(key(tok));
  }

  const tails = await prisma.tail.findMany({ select: { id: true, number: true, status: true } });
  const stuck = tails.filter((t) => STRAY.includes(String(t.status)) && doneTailKeys.has(key(t.number)) && !openTailKeys.has(key(t.number)));
  console.log(`tails: ${tails.length} | evidence-backed Check Up moves: ${stuck.length} ${APPLY ? '(APPLYING)' : '(dry run)'}`);
  for (const t of stuck) console.log(`  would move tail ${t.number}: ${t.status} -> Check Up`);
  if (APPLY && stuck.length) {
    for (const t of stuck) {
      await prisma.tail.update({ where: { id: t.id }, data: { status: 'Check Up' } });
    }
    console.log(`moved ${stuck.length} tails to Check Up.`);
  } else if (!APPLY) {
    console.log('dry run only — rerun with --apply to write.');
  }
  await prisma.$disconnect();
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
