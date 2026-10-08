/**
 * One-shot data repair (run ON the Hetzner box, inside /var/www/fleetopsx-api).
 *
 * The gate log's Return column showed the bare word "Returned" on rows whose
 * dispatch was completed without ever writing a return timestamp (`eta`),
 * and "Departed" on rows with no `startTime`. Auto-reconciliations, driver
 * releases and legacy closures flipped the status without writing stamps.
 *
 * This fills, per Completed trip:
 *   eta       (return)    — last tracking checkpoint, else updatedAt;
 *   startTime (departure) — first tracking checkpoint, else createdAt.
 *
 * Existing stamps are never touched. Additive and idempotent: safe to re-run.
 * Restart the API afterwards (pm2 restart fleetopsx-api).
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
    where: { status: 'Completed' },
    select: { id: true, eta: true, startTime: true, updatedAt: true, createdAt: true },
  });
  const needReturn = targets.filter((t) => !String(t.eta || '').trim());
  const needDepart = targets.filter((t) => !String(t.startTime || '').trim());
  console.log(`Completed trips: ${targets.length} | missing return: ${needReturn.length} | missing departure: ${needDepart.length}`);

  let filled = 0;
  for (const t of needReturn) {
    const lastCp = await prisma.trackingCheckpoint.findFirst({
      where: { tripId: t.id }, orderBy: { at: 'desc' },
    });
    await prisma.trip.update({
      where: { id: t.id },
      data: { eta: stamp(lastCp?.at || t.updatedAt) },
    });
    filled += 1;
  }
  console.log(`return stamps filled: ${filled}`);

  filled = 0;
  for (const t of needDepart) {
    const firstCp = await prisma.trackingCheckpoint.findFirst({
      where: { tripId: t.id }, orderBy: { at: 'asc' },
    });
    // No checkpoint means the run predates digital tracking: the closest
    // recorded moment is when the record itself was written. Not the true
    // departure, but a real moment instead of a bare word.
    await prisma.trip.update({
      where: { id: t.id },
      data: { startTime: stamp(firstCp?.at || t.createdAt) },
    });
    filled += 1;
  }
  console.log(`departure stamps filled: ${filled}`);
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
