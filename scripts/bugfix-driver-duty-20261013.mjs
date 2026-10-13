/**
 * BUGFIX-DRIVER-DUTY — applies the "returned truck keeps driver On Trip" fixes:
 *   D1  GateEntry Return closes ALL matching sibling dispatches (was: first only)
 *   D2  freeDriverOnReturn matches by truck identity too (fragment names like
 *       "UMAR"/"ali" can't resolve to one man, but his truck can), and its
 *       safeguard counts open dispatches by exact name OR registered truck
 *   D3  Suspended/Off Duty/Deleted drivers are never auto-flipped
 *
 * Usage: node scripts/bugfix-driver-duty-20261013.mjs <path-to-index.ts>
 * Exits non-zero without writing if any anchor is missing or ambiguous.
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/bugfix-driver-duty-20261013.mjs <path-to-index.ts>');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const hadCRLF = raw.includes('\r\n');
let s = hadCRLF ? raw.replace(/\r\n/g, '\n') : raw;

const patches = [
  {
    id: 'D1-gate-return-finds-all-matches',
    from: `      const openTrips = await prisma.trip.findMany({ where: { status: { in: OPEN_TRIP_STATUSES } } });
      const trip = openTrips.find((t: any) => {`,
    to: `      const openTrips = await prisma.trip.findMany({ where: { status: { in: OPEN_TRIP_STATUSES } } });
      // D1: every sibling naming this truck ends together, not just the first.
      const matches = openTrips.filter((t: any) => {`,
  },
  {
    id: 'D1-gate-return-closes-siblings',
    from: `      });
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
        if (closed.driverName || closed.truckReg) {
          void freeDriverOnReturn(closed.driverName, closed.truckReg);
        }`,
    to: `      });
      // RETURN-CLOSES-SIBLINGS (driver-duty fix): every open dispatch naming this
      // truck (or the guard-read driver) ends together. Leaving the other
      // siblings open is exactly how a returned truck kept its driver "On Trip"
      // and Fleet Operations could never hand him another load.
      const trip: any = matches[0] || null;
      if (trip) {
        const actor = (req as any).user?.name || (req as any).user?.email || 'Security';
        for (const mt of matches) {
          await prisma.trip.update({
            where: { id: mt.id },
            // return-stamp-on-gate-return: the return stamp the gate log shows is
            // \`eta\` — leaving it empty made the board print the bare word
            // "Returned" where every other row shows a real date+time.
            data: { status: 'Completed', eta: mt.eta || autoStamp(entry.timestamp), gateInBy: mt.gateInBy || actor },
          });
          if (mt.driverName || mt.truckReg) {
            void freeDriverOnReturn(mt.driverName, mt.truckReg);
          }
        }
        // The asset cycles below read the first closed dispatch's tail/head.
        const closed = trip;`,
  },
  {
    id: 'D2-free-by-truck-identity',
    from: `    const rawTruck = String(truckIdent || '').trim();
    if (candidateIds.size === 0 && rawTruck && rawTruck.length >= 3 && !/^unassigned$/i.test(rawTruck)) {
      const headCode = rawTruck.split(/[\\/\\s]+/)[0]?.trim() || '';
      if (headCode.length >= 3) {
        const matched = await prisma.driver.findMany({
          where: {
            OR: [
              { truckReg: { equals: headCode, mode: 'insensitive' } },
              { truckReg2: { equals: headCode, mode: 'insensitive' } },
            ],
          },
        });
        for (const d of matched) {
          candidateIds.add(d.id);
        }
      }
    }`,
    to: `    const rawTruck = String(truckIdent || '').trim();
    // RETURN-FREES-BY-TRUCK: the truck the dispatch named is as good an identity
    // as the driver's name — fragment dispatches ("UMAR", "ali") cannot resolve
    // to one man, but his registered truck can. Matched on whole stripped keys
    // only, never on bare fragments.
    if (rawTruck && rawTruck.length >= 3 && !/^unassigned$/i.test(rawTruck)) {
      const tokens = rawTruck.split(/[\\/\\s]+/).map((v) => TRUCK_KEY(v)).filter((k: string) => k.length >= 3);
      if (tokens.length) {
        const drivers = await prisma.driver.findMany();
        for (const d of drivers) {
          for (const own of [d.truckReg, d.truckReg2]) {
            if (own && tokens.includes(TRUCK_KEY(own))) {
              candidateIds.add(d.id);
              break;
            }
          }
        }
      }
    }`,
  },
  {
    id: 'D2-safeguard-by-name-or-truck',
    from: `    for (const d of candidates) {
      const openTripCount = await prisma.trip.count({
        where: {
          driverName: { equals: d.name, mode: 'insensitive' },
          status: { in: OPEN_TRIP_STATUSES },
        },
      });

      if (openTripCount === 0) {
        if (d.status !== 'Active' && !['Suspended', 'Off Duty'].includes(d.status)) {
          await prisma.driver.update({ where: { id: d.id }, data: { status: 'Active' } });
          freed++;
        }
      } else {
        // Still on a live dispatch — maintain On Trip status
        if (d.status !== 'On Trip' && !['Suspended', 'Off Duty'].includes(d.status)) {
          await prisma.driver.update({ where: { id: d.id }, data: { status: 'On Trip' } });
        }
      }
    }`,
    to: `    // SAFEGUARD with the same identities the free used: the man may be made
    // Active only when NO open dispatch names him — by exact name OR by his
    // registered truck. The old name-only count missed truck-identity trips, so
    // it could free a man whose dispatch was still open under his truck (and
    // never free the fragment-named ones). HR verdicts are protected from the
    // machine either way (D3): Suspended / Off Duty / Deleted are never flipped.
    const openTrips = await prisma.trip.findMany({
      where: { status: { in: OPEN_TRIP_STATUSES } },
      select: { driverName: true, truckReg: true, tailNumber: true },
    });
    const PROTECTED_STATUS = ['Suspended', 'Off Duty', 'Deleted'];
    const headKeyOf = (v: any) => {
      const k = TRUCK_KEY(String(v || '').split(/[\\/\\s]+/)[0]);
      return k && k.length >= 3 ? k : null;
    };
    for (const d of candidates) {
      const nameKey = String(d.name || '').trim().toLowerCase();
      const ownTrucks = [d.truckReg, d.truckReg2].map((v) => headKeyOf(v)).filter(Boolean);
      const stillOn = openTrips.some((t: any) => {
        if (String(t.driverName || '').trim().toLowerCase() === nameKey) return true;
        const headKey = headKeyOf(String(t.truckReg || '').trim());
        const tailKey = headKeyOf(String(t.tailNumber || '').trim());
        return ownTrucks.includes(headKey) || ownTrucks.includes(tailKey);
      });
      const blocked = PROTECTED_STATUS.includes(String(d.status));
      if (!stillOn) {
        if (!blocked && d.status !== 'Active') {
          await prisma.driver.update({ where: { id: d.id }, data: { status: 'Active' } });
          freed++;
        }
      } else if (!blocked && d.status !== 'On Trip') {
        await prisma.driver.update({ where: { id: d.id }, data: { status: 'On Trip' } });
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
