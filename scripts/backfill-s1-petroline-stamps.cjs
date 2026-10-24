/**
 * S.1-PETROLINE-BACKFILL (24 Oct 2026, owner instruction):
 * every system/bookkeeping gate stamp on dispatches ("System (no guard
 * signed)"-style wording the sweep, the old auto-reconcile and role-word
 * closures wrote) is rewritten to the station signature "S.1 Petroline".
 *
 * The regex mirrors the frontend classifiers in:
 *   src/routes/workspace.app.gate.tsx  (formatGateLogger)
 *   src/lib/fleetopsx/dashboard-departments.ts (GUARD_SYSTEM_STAMP)
 * ...so DB text and every screen agree from now on. Real account names
 * (e.g. "S.1 Petroline" itself, any human guard name) are untouched, and the
 * truthful audit object (directCosts.returnedBy) is not modified.
 *
 * Read-only backup of every affected row is written to backups/gate-stamps
 * before anything changes. Never touches rows where the stamp is null.
 */
const { PrismaClient } = require('@prisma/client');
const { writeFileSync } = require('fs');
const p = new PrismaClient();

const SYSTEM_STAMP_PREDICATE = (col) =>
  '("' + col + '" ~* ' + "'(reconcil|supersed|self-heal|return sweep|departure predates|stale|transport manager|platform admin)'" +
  ' OR "' + col + '" ~* ' + "'\\\\yadmin\\\\y'" +
  ' OR "' + col + '" ~* ' + "'^petroline security$'" +
  ' OR "' + col + '" ~* ' + "'^security$'" + ')';

(async () => {
  const dry = process.argv.includes('--dry');
  try {
    const outSel = SYSTEM_STAMP_PREDICATE('gateOutBy');
    const inSel = SYSTEM_STAMP_PREDICATE('gateInBy');

    const outRows = await p.$queryRawUnsafe(
      `SELECT id, "gateOutBy", "updatedAt" FROM "Trip" WHERE "gateOutBy" IS NOT NULL AND ${outSel}`
    );
    const inRows = await p.$queryRawUnsafe(
      `SELECT id, "gateInBy", "updatedAt" FROM "Trip" WHERE "gateInBy" IS NOT NULL AND ${inSel}`
    );

    console.log('departure stamps to rewrite:', outRows.length);
    for (const r of outRows.slice(0, 5)) console.log('  ', JSON.stringify(r).slice(0, 160));
    console.log('return stamps to rewrite:', inRows.length);
    for (const r of inRows.slice(0, 5)) console.log('  ', JSON.stringify(r).slice(0, 160));

    if (dry) {
      console.log('--dry run complete — no backup written, no rows changed.');
      await p.$disconnect();
      return;
    }
    writeFileSync(
      'backups/gate-stamps-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json',
      JSON.stringify({ departures: outRows, returns: inRows }, null, 2),
    );
    console.log('backup written to backups/gate-stamps-<ts>.json');

    await p.$transaction([
      p.$executeRawUnsafe(
        `UPDATE "Trip" SET "gateOutBy" = 'S.1 Petroline' WHERE "gateOutBy" IS NOT NULL AND ${outSel}`
      ),
      p.$executeRawUnsafe(
        `UPDATE "Trip" SET "gateInBy" = 'S.1 Petroline' WHERE "gateInBy" IS NOT NULL AND ${inSel}`
      ),
    ]);

    const afterOut = await p.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "Trip" WHERE "gateOutBy" IS NOT NULL AND ${outSel}`
    );
    const afterIn = await p.$queryRawUnsafe(
      `SELECT count(*)::int AS n FROM "Trip" WHERE "gateInBy" IS NOT NULL AND ${inSel}`
    );
    console.log('AFTER rewrite — remaining system-stamps:', JSON.stringify(afterOut), JSON.stringify(afterIn));
    await p.$disconnect();
  } catch (e) {
    console.error('BACKFILL FAILED:', e.message);
    process.exit(1);
  }
})();
