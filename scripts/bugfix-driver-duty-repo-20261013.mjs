/**
 * BUGFIX-DRIVER-DUTY-REPO — repo-variant anchors for the same driver-duty fixes
 * (bugfix-driver-duty-20261013.mjs targets the drifted live file that carries
 * freeDriverOnReturn; the repo backend frees inline instead):
 *   D1  GateEntry Return closes ALL matching sibling dispatches (was: first only)
 *   D2  the inline free respects exact roster names, truck identities for
 *       fragment dispatch names, and HR-protected statuses
 *
 * Usage: node scripts/bugfix-driver-duty-repo-20261013.mjs <path-to-index.ts>
 * Exits non-zero without writing if any anchor is missing or ambiguous.
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/bugfix-driver-duty-repo-20261013.mjs <path-to-index.ts>');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const hadCRLF = raw.includes('\r\n');
let s = hadCRLF ? raw.replace(/\r\n/g, '\n') : raw;

const patches = [
  {
    id: 'D1-repo-gate-return-closes-siblings-and-frees-safely',
    from: `      const openTrips = await prisma.trip.findMany({ where: { status: { in: OPEN_TRIP_STATUSES } } });
      const trip = openTrips.find((t: any) => {
        const tr = String(t.truckReg || '').toUpperCase();
        const trKey = tr.split(/[\\s/]+/)[0] || '';
        const tail = String(t.tailNumber || '').toUpperCase();
        if (plate && (tr === plate || tail === plate || (plateKey && trKey === plateKey) || (plateKey && trKey && tr.includes(plateKey)))) {
          return true;
        }
        return Boolean(driverName) && String(t.driverName || '').trim().toUpperCase() === driverName;
      });
      if (trip) {
        const actor = (req as any).user?.name || (req as any).user?.email || 'Security';
        const closed = await prisma.trip.update({
          where: { id: trip.id },
          // return-stamp-on-gate-return: the return stamp the gate log shows is
          // \`eta\` — leaving it empty made the board print the bare word
          // "Returned" where every other row shows a real date+time.
          data: { status: 'Completed', eta: trip.eta || autoStamp(entry.timestamp), gateInBy: trip.gateInBy || actor },
        });
        // The driver's cycle ends with the truck's. Only 'On Trip' is moved, so
        // a Suspended or Off Duty record is never quietly overwritten.
        if (closed.driverName) {
          await prisma.driver.updateMany({
            where: { name: closed.driverName, status: { in: ['On Trip', 'Active'] } },
            data: { status: 'Active' },
          });
        }`,
    to: `      const openTrips = await prisma.trip.findMany({ where: { status: { in: OPEN_TRIP_STATUSES } } });
      // RETURN-CLOSES-SIBLINGS (driver-duty fix): every open dispatch naming this
      // truck or the guard-read driver ends together. Leaving the other siblings
      // open is exactly how a returned truck kept its driver "On Trip" and Fleet
      // Operations could never hand him another load.
      const matches = openTrips.filter((t: any) => {
        const tr = String(t.truckReg || '').toUpperCase();
        const trKey = tr.split(/[\\s/]+/)[0] || '';
        const tail = String(t.tailNumber || '').toUpperCase();
        if (plate && (tr === plate || tail === plate || (plateKey && trKey === plateKey) || (plateKey && trKey && tr.includes(plateKey)))) {
          return true;
        }
        return Boolean(driverName) && String(t.driverName || '').trim().toUpperCase() === driverName;
      });
      const trip = matches[0] || null;
      if (trip) {
        const actor = (req as any).user?.name || (req as any).user?.email || 'Security';
        let lastClosed: any = null;
        for (const mt of matches) {
          lastClosed = await prisma.trip.update({
            where: { id: mt.id },
            // return-stamp-on-gate-return: the return stamp the gate log shows is
            // \`eta\` — leaving it empty made the board print the bare word
            // "Returned" where every other row shows a real date+time.
            data: { status: 'Completed', eta: mt.eta || autoStamp(entry.timestamp), gateInBy: mt.gateInBy || actor },
          });
        }
        const closed = lastClosed || trip;
        /* THE DRIVERS' CYCLE ENDS WITH THE TRUCK'S. Whoever the closed dispatches
         * named — by exact roster name or by the truck he is registered on (the
         * "UMAR"/"ali"-style fragment names cannot be resolved to one man, his
         * truck can) — goes Active again, unless a sibling dispatch still holds
         * him or HR already decided otherwise: Suspended / Off Duty / Deleted
         * are never quietly overwritten.
         */
        const plateKeyOf = (v: any) => {
          const k = String(v || '').replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
          return k.length >= 3 ? k : null;
        };
        const closedNames = new Set(
          matches.map((mt: any) => String(mt.driverName || '').trim().toUpperCase()).filter(Boolean),
        );
        const closedPlates = new Set(
          matches.flatMap((mt: any) => [plateKeyOf(String(mt.truckReg || '').split(/[\\s/]+/)[0]), plateKeyOf(mt.tailNumber)]).filter(Boolean),
        );
        const remaining = openTrips.filter((t: any) => !matches.some((m: any) => m.id === t.id));
        const remainingNames = new Set(remaining.map((t: any) => String(t.driverName || '').trim().toUpperCase()).filter(Boolean));
        const remainingPlates = new Set(
          remaining.flatMap((t: any) => [plateKeyOf(String(t.truckReg || '').split(/[\\s/]+/)[0]), plateKeyOf(t.tailNumber)]).filter(Boolean),
        );
        const roster = await prisma.driver.findMany({
          select: { id: true, name: true, status: true, truckReg: true, truckReg2: true },
        });
        for (const d of roster) {
          const status = String(d.status || '');
          if (status !== 'On Trip') continue;
          if (['Suspended', 'Off Duty', 'Deleted'].includes(status)) continue;
          const nameKey = String(d.name || '').trim().toUpperCase();
          const dPlates = [plateKeyOf(d.truckReg), plateKeyOf(d.truckReg2)].filter(Boolean);
          const onThisReturn = closedNames.has(nameKey) || dPlates.some((k) => closedPlates.has(k));
          if (!onThisReturn) continue;
          const stillOut = remainingNames.has(nameKey) || dPlates.some((k) => remainingPlates.has(k));
          if (!stillOut) {
            await prisma.driver.update({ where: { id: d.id }, data: { status: 'Active' } });
          }
        }`,
  },
];

let failed = [];
const applied = [];
for (const p of patches) {
  if (!s.includes(p.from)) {
    failed.push(p.id);
    continue;
  }
  const count = s.split(p.from).length - 1;
  if (count !== 1) {
    failed.push(`${p.id} (anchor found ${count}x, need exactly 1)`);
    continue;
  }
  s = s.replace(p.from, p.to);
  applied.push(p.id);
}

if (failed.length) {
  console.error('PATCH FAILED — no file written. Missing anchors:');
  for (const f of failed) console.error('  -', f);
  process.exit(1);
}
if (!applied.length) {
  console.error('Nothing to apply.');
  process.exit(1);
}

fs.writeFileSync(file, hadCRLF ? s.replace(/\n/g, '\r\n') : s);
console.log('Patched', file, '—', applied.length, 'fixes applied:', applied.join(', '));
