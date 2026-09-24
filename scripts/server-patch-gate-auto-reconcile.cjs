/**
 * Server patch: the gate log reconciles ITSELF.
 *
 * The trucks that left before the app went live are in the system — Fleet Ops
 * created their dispatches and the tracking desk has been moving them since.
 * What is missing is only the DEPARTURE STAMP, because the gate could not write
 * one before the client was regenerated. So nobody should be typing anything:
 *
 *   any dispatch that is MOVING (En Route / Loaded / Offloading / Returning /
 *   Delayed) and carries no gate departure is, by definition, already out of the
 *   yard. The stamp is written for it, dated from the dispatch's own record, the
 *   moment its absence is seen — at boot and every few minutes after.
 *
 * Written for the record, not silently: the stamp names itself as reconciled and
 * the trip carries `autoReconciledDeparture`, so the history stays honest.
 * Idempotent — a dispatch that has a stamp is never touched again.
 */
const fs = require('fs');

const FILE = '/var/www/fleetopsx-api/index.ts';
let src = fs.readFileSync(FILE, 'utf8');

if (src.includes('autoReconcileGateDepartures')) {
  console.log('Auto-reconcile already present — nothing to do.');
  process.exit(0);
}

const BLOCK = `
// ---- The gate log heals itself (auto-reconcile) ----------------------------
//
// A truck is out if a dispatch says it is moving. If the gate never stamped its
// departure — the pre-go-live fleet, or any movement the gate house was unable
// to write — the stamp is filled in from the dispatch's own dates, and the
// record says so. No one has to notice, remember or type anything.
const AUTO_OPEN_MOVING = ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'];

function autoStamp(value: any): string {
  const date = value ? new Date(value) : new Date();
  const when = isNaN(date.getTime()) ? new Date() : date;
  return when.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function autoReconcileGateDepartures(): Promise<number> {
  try {
    const moving = await prisma.trip.findMany({ where: { status: { in: AUTO_OPEN_MOVING } } });
    let stamped = 0;
    for (const trip of moving) {
      if (String(trip.startTime ?? '').trim()) continue; // already logged by the gate
      const costs = trip.directCosts && typeof trip.directCosts === 'object' ? { ...(trip.directCosts as any) } : {};
      if (costs.autoReconciledDeparture) continue;
      costs.autoReconciledDeparture = true;
      costs.autoReconciledAt = new Date().toISOString();
      await prisma.trip.update({
        where: { id: trip.id },
        data: {
          // The best evidence of when it really left, in that order of trust.
          startTime: autoStamp(trip.dispatchedAt || trip.assignedAt || trip.approvedAt || trip.createdAt),
          gateOutBy: 'Auto-reconciled (departure predates the gate log)',
          directCosts: costs,
        },
      });
      stamped += 1;
    }
    if (stamped) {
      console.log('[gate-reconcile] departure stamped on ' + stamped + ' moving dispatch' + (stamped === 1 ? '' : 'es') + ' that had none.');
    }
    return stamped;
  } catch (e: any) {
    console.error('[gate-reconcile] failed:', e?.message || e);
    return 0;
  }
}

void autoReconcileGateDepartures();
setInterval(() => void autoReconcileGateDepartures(), 3 * 60 * 1000);
`;

// Anchor: right before the GET /api/gate route (its own block keeps the file tidy).
const ANCHOR = "app.get('/api/gate', authenticate, async (_req, res) => {";
if (!src.includes(ANCHOR)) {
  console.error('Anchor not found — index.ts changed shape; aborting without writing.');
  process.exit(1);
}
src = src.replace(ANCHOR, BLOCK.trimStart() + '\n' + ANCHOR);
fs.writeFileSync(FILE, src);
console.log('Auto-reconcile installed: departures stamp themselves, at boot and every 3 minutes.');
