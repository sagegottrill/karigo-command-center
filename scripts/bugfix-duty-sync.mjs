/**
 * BUGFIX-DUTY-SYNC — value in one vision: the roster follows the dispatch list
 * automatically; nobody (TM, HR, or an admin inside the DB) is ever the glue.
 *
 * Conservative on purpose — the anti-sweep:
 *   • NEVER closes a dispatch, NEVER moves a truck or tail.
 *   • Only flips a DRIVER row from 'On Trip' to 'Active' when NO open dispatch
 *     names him — by exact roster name OR his registered truck keys.
 *   • Runs on boot and every 10 minutes; logs its flips.
 *
 * Usage: node scripts/bugfix-duty-sync.mjs <path-to-index.ts>
 * Exits non-zero without writing if the anchor is missing or ambiguous.
 */
import fs from 'node:fs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/bugfix-duty-sync.mjs <path-to-index.ts>');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const hadCRLF = raw.includes('\r\n');
let s = hadCRLF ? raw.replace(/\r\n/g, '\n') : raw;

const anchor = '// --- GATECYCLE:V1:HELPERS ---';
const insert = `/*
 * DRIVER-DUTY SYNC (safety net) — the roster follows the live dispatch list
 * unconditionally, so no missed code path can ever strand a man "On Trip"
 * after his truck is home. This is deliberately NOT the old auto-sweep: it
 * never closes a dispatch and never moves a truck or tail — it only corrects
 * a driver's status word when the dispatch list proves he is out of work.
 */
async function syncDriverDuty(): Promise<number> {
  try {
    const OPEN_TRIP_STATUSES = ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed', 'Stopped'];
    const openTrips = await prisma.trip.findMany({
      where: { status: { in: OPEN_TRIP_STATUSES } },
      select: { driverName: true, truckReg: true, tailNumber: true },
    });
    const headKeyOf = (v: any) => {
      const k = TRUCK_KEY(String(v || '').split(/[/\\s]+/)[0]);
      return k && k.length >= 3 ? k : null;
    };
    const onTrip = await prisma.driver.findMany({
      where: { status: 'On Trip' },
      select: { id: true, name: true, truckReg: true, truckReg2: true },
    });
    let flipped = 0;
    for (const d of onTrip) {
      if (['Suspended', 'Off Duty', 'Deleted'].includes(String(d.status))) continue;
      const nameKey = String(d.name || '').trim().toLowerCase();
      const own = [d.truckReg, d.truckReg2].map((v) => headKeyOf(v)).filter(Boolean);
      const stillOn = openTrips.some((t: any) => {
        if (String(t.driverName || '').trim().toLowerCase() === nameKey) return true;
        const headKey = headKeyOf(String(t.truckReg || '').trim());
        const tailKey = headKeyOf(String(t.tailNumber || '').trim());
        return own.includes(headKey) || own.includes(tailKey);
      });
      if (!stillOn) {
        await prisma.driver.update({ where: { id: d.id }, data: { status: 'Active' } });
        flipped++;
      }
    }
    if (flipped) {
      console.log('[driver-duty] freed ' + flipped + ' driver(s) the dispatch list no longer holds.');
    }
    return flipped;
  } catch (e: any) {
    console.error('[driver-duty] sync failed:', e?.message || e);
    return 0;
  }
}
void syncDriverDuty();
setInterval(() => void syncDriverDuty(), 10 * 60 * 1000);

${anchor}`;

if (!s.includes(anchor)) {
  console.error('PATCH FAILED — anchor not found:', anchor);
  process.exit(1);
}
if (s.split(anchor).length - 1 !== 1) {
  console.error('PATCH FAILED — anchor not unique:', anchor);
  process.exit(1);
}

s = s.replace(anchor, insert);
fs.writeFileSync(file, hadCRLF ? s.replace(/\n/g, '\r\n') : s);
console.log('Patched', file, '— driver-duty sync installed (boot + 10 min interval).');
