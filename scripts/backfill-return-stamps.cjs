/**
 * One-shot data repair (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * The gate log's Return column showed the bare word "Returned" on rows whose
 * dispatch was completed without ever writing a return timestamp (`eta`):
 * auto-reconciliations, driver releases and legacy closures all flipped the
 * status to Completed and left `eta` empty. 87 live rows, no date, no time.
 *
 * This fills each empty `eta` on a Completed trip from the most honest moment
 * the record still holds:
 *
 *   1. the LAST tracking checkpoint on the trip (the road's final log);
 *   2. else the trip's own `updatedAt` (when the completion was written).
 *
 * A trip that already has `eta` is never touched. Additive and idempotent:
 * safe to re-run. Restart the API afterwards (pm2 restart fleetopsx-api).
 *
 * Usage:  node backfill-return-stamps.cjs   # inside /var/www/fleetopsx-api
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const stamp = (d) =>
  d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

(async () => {
  const targets = await prisma.trip.findMany({
    where: {
      status: 'Completed',
      OR: [{ eta: null }, { eta: '' }, { eta: '—' }, { eta: '-' }],
    },
    select: { id: true, updatedAt: true },
  });
  console.log(`Completed trips with no return stamp: ${targets.length}`);
  let filled = 0;
  for (const t of targets) {
    const lastCp = await prisma.trackingCheckpoint.findFirst({
      where: { tripId: t.id },
      orderBy: { at: 'desc' },
    });
    const when = lastCp?.at || t.updatedAt;
    await prisma.trip.update({ where: { id: t.id }, data: { eta: stamp(when) } });
    filled += 1;
  }
  console.log(`filled: ${filled}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
