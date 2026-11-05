/**
 * One-shot server patch (run ON the API server, like the other
 * backend-patches/server-patch-*.cjs) — 4 Nov 2026.
 *
 * NO-AUTO-CLOSE: no dispatch is ever dispatched, returned or closed by the
 * server on its own again. Only a person's action — Security's gate, the
 * Transport Manager, an HR release they confirm — changes a trip's ending.
 *
 * WHAT IT CHANGES (each is skipped if already applied; the file is untouched
 * if any anchor is missing):
 *
 *   N1. Return sweep (sweepReturnedTrucks, every 5 min) — REPORT ONLY.
 *       It still finds the dormant dispatches it used to close, but now sends
 *       the Transport Manager ONE warning per dispatch ("looks finished —
 *       close it if so") and writes nothing. The old behaviour only returns
 *       with ALLOW_AUTO_RETURN=1 in the API's .env.
 *
 *   N2. Supersede-on-departure — WARN ONLY.
 *       Logging a truck out no longer closes an OLDER dispatch naming the same
 *       head/tail. The TM is told which dispatch to close instead. The old
 *       behaviour only returns with ALLOW_AUTO_SUPERSEDE=1.
 *
 *   N3. Driver release (PATCH /drivers/:id with closeDispatches) — closes the
 *       dispatches bound to THAT man's staff ID (P-number), not every open
 *       dispatch carrying the same NAME. A namesake's live run is never closed.
 *       Unbound legacy dispatches (no staff ID) still match by name.
 *
 *   N4. autoReconcileGateDepartures (the "Petroline Security" auto-departure)
 *       — its timer is already commented out; the function itself now refuses
 *       to run unless ALLOW_AUTO_DEPARTURE=1, so re-enabling the timer by
 *       accident cannot bring the phantom departures back.
 *
 * Not changed (already safe): tracking checkpoints only move a MOVING trip
 * forward up to Offloading — never Returning/Completed, never a Scheduled
 * trip; the gate's own Log Out / Log Return; the TM's own status edits.
 *
 * Run (on the server):
 *   cp /var/www/fleetopsx-api/index.ts /var/www/fleetopsx-api/index.ts.bak-no-auto-close
 *   node /tmp/server-patch-no-auto-close-20261104.cjs
 *   cd /var/www/fleetopsx-api && node_modules/.bin/esbuild index.ts --target=node20 --outfile=/tmp/idx.check.js >/dev/null && echo SYNTAX_OK
 *   pm2 restart fleetopsx-api --update-env
 *   curl -s https://api.fleetopsx.com/api/health
 * Or apply it to backend/index.ts in the repo and use ./backend/sync-api.sh push
 * (which backs up, syntax-checks, restarts and health-checks).
 */
const fs = require("fs");
const FILE = process.argv[2] || "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");
const CRLF = src.includes("\r\n");
if (CRLF) src = src.split("\r\n").join("\n");
let changed = 0;
let skipped = 0;
const failures = [];

function replaceOnce(id, from, to, marker) {
  if (src.includes(marker)) {
    console.log("skip: " + id + " already in place");
    skipped++;
    return;
  }
  const at = src.indexOf(from);
  if (at < 0 || src.indexOf(from, at + from.length) >= 0) {
    failures.push(id);
    return;
  }
  src = src.slice(0, at) + to + src.slice(at + from.length);
  changed++;
  console.log("ok: " + id + " applied");
}

// --- N1: the return sweep reports, never closes -------------------------------
replaceOnce(
  "N1 return sweep report-only",
  "    let closed = 0;\n    for (const trip of doomed) {",
  `    // NO-AUTO-CLOSE:N1 (4 Nov 2026) — the sweep REPORTS, it never closes.
    // Trucks kept "returning by themselves"; every version of this guard still
    // closed something a person had not. The dispatches it would have closed
    // are sent to the Transport Manager once each, to close by hand if they
    // really are finished. ALLOW_AUTO_RETURN=1 restores the old self-close.
    if (process.env.ALLOW_AUTO_RETURN !== '1') {
      const seen: Set<string> = ((globalThis as any).__noAutoCloseWarned ||= new Set<string>());
      for (const trip of doomed) {
        if (seen.has(trip.id)) continue;
        seen.add(trip.id);
        void notify('Dispatch', 'Dispatch looks finished — close it if so',
          dispatchRef(trip.id) + ' (' + String(trip.truckReg || '—') + (trip.driverName ? ' · ' + trip.driverName : '') +
          ') has had no activity for 12 hours and the gate logged its truck home. It was NOT closed automatically — ' +
          'close it from the dispatch if the run is over.',
          'warning', 'Transport Manager,Platform Admin,Fleet Operations',
          { module: 'Dispatch', eventKey: 'dispatch.dormant_review', refId: trip.id, refLabel: dispatchRef(trip.id), actionRoles: ['Transport Manager'] });
      }
      if (doomed.length) console.log('[return-sweep] report-only: ' + doomed.length + ' dormant dispatch(es) flagged, none closed.');
      return 0;
    }
    let closed = 0;
    for (const trip of doomed) {`,
  "NO-AUTO-CLOSE:N1",
);

// --- N2: departure warns about an older run on the same rig, never closes it -
replaceOnce(
  "N2 supersede warn-only",
  "  if (String(trip.status) === 'En Route' && before && before.status !== 'En Route') {\n    try {\n      const depKeys = truckKeysOf(trip);",
  `  // NO-AUTO-CLOSE:N2 (4 Nov 2026) — a departure never closes ANOTHER dispatch.
  // The older run naming the same head/tail is reported to the Transport
  // Manager to close by hand. ALLOW_AUTO_SUPERSEDE=1 restores the self-close.
  if (process.env.ALLOW_AUTO_SUPERSEDE !== '1' && String(trip.status) === 'En Route' && before && before.status !== 'En Route') {
    try {
      const depKeys = truckKeysOf(trip);
      if (depKeys.length) {
        const older = await prisma.trip.findMany({
          where: { id: { not: trip.id }, status: { in: ['En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] } },
        });
        for (const o of older) {
          if (!(new Date(o.createdAt).getTime() < new Date(trip.createdAt).getTime() && truckKeysOf(o).some((k) => depKeys.includes(k)))) continue;
          void notify('Transport Manager', 'Same rig on two open dispatches',
            dispatchRef(trip.id) + ' just left the gate with ' + String(trip.truckReg || '—') + ', which ' + dispatchRef(o.id) +
            ' still names as on the road. Nothing was closed automatically — close ' + dispatchRef(o.id) + ' if that run is over.',
            'warning', 'Transport Manager,Platform Admin,Fleet Operations',
            { module: 'Dispatch', eventKey: 'dispatch.rig_conflict', refId: o.id, refLabel: dispatchRef(o.id), actionRoles: ['Transport Manager'] });
        }
      }
    } catch (e: any) {
      console.error('[supersede] warn failed:', e?.message || e);
    }
  }
  if (process.env.ALLOW_AUTO_SUPERSEDE === '1' && String(trip.status) === 'En Route' && before && before.status !== 'En Route') {
    try {
      const depKeys = truckKeysOf(trip);`,
  "NO-AUTO-CLOSE:N2",
);

// --- N3: a driver release closes only HIS dispatches (staff ID), not a namesake's
replaceOnce(
  "N3 release by staff ID",
  "          where: { driverName: driver.name, status: { in: OPEN_TRIP_STATUSES } },",
  `          // NO-AUTO-CLOSE:N3 (4 Nov 2026): bound by the man's P-number, never a
          // name two drivers share. Unbound legacy dispatches still match by name.
          where: driver.staffId
            ? { status: { in: OPEN_TRIP_STATUSES }, OR: [{ driverStaffId: driver.staffId }, { driverStaffId: null, driverName: driver.name }] }
            : { driverName: driver.name, status: { in: OPEN_TRIP_STATUSES } },`,
  "NO-AUTO-CLOSE:N3",
);

// --- N4: the phantom auto-departure cannot run, even if its timer is restored
replaceOnce(
  "N4 auto-departure locked off",
  "async function autoReconcileGateDepartures(): Promise<number> {",
  `async function autoReconcileGateDepartures(): Promise<number> {
  // NO-AUTO-CLOSE:N4 (4 Nov 2026): the first movement of a load belongs to
  // Security's Log Out. This never runs unless ALLOW_AUTO_DEPARTURE=1.
  if (process.env.ALLOW_AUTO_DEPARTURE !== '1') return 0;`,
  "NO-AUTO-CLOSE:N4",
);

if (failures.length) {
  console.error("FAILED: the expected code was not found exactly once for: " + failures.join(", ") + " — nothing written.");
  process.exit(1);
}
if (changed) fs.writeFileSync(FILE, CRLF ? src.split("\n").join("\r\n") : src);
console.log("done: " + changed + " applied, " + skipped + " already in place. Now syntax-check and: pm2 restart fleetopsx-api --update-env");
