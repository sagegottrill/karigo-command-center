/**
 * BUGFIX-RELEASE-CYCLE — the "self return" (Fortune's complaint): releasing a
 * driver force-completes his open dispatches, but until now that write ran
 * WITHOUT the follow-through cycle Security's gate runs. Result: dispatch
 * shows returned while the head stays Out of Yard, the tail stays Assigned and
 * the roster can hold him — the yard scatters.
 *
 * Fix: the release's closures now run the SAME home cycle as the gate flow:
 *   coupleTruckRegistry(trip, 'home')  -> head to Check Up (+ frees driver)
 *   coupleTailRegistry(trip, 'home')   -> tail to Check Up
 * Nothing auto-closes that shouldn't; only trips ALREADY closed by the release
 * now behave exactly like a gate-returned dispatch.
 *
 * Two anchor variants exist (drifted live file vs repo). Skip whichever a
 * given file lacks:
 *   node scripts/bugfix-release-cycle.mjs <index.ts> [--skip release-cycle-live|release-cycle-repo]
 */
import fs from 'node:fs';

const argv = process.argv.slice(2);
const file = argv[0];
const skipArg = argv.find((a) => a.startsWith('--skip'));
const skipIndex = skipArg ? argv.indexOf(skipArg) : -1;
const skipList = skipArg
  ? skipArg.includes('=') ? skipArg.split('=')[1] : argv[skipIndex + 1] || ''
  : '';
const skipped = new Set(skipList.split(',').map((v) => v.trim()).filter(Boolean));

if (!file) {
  console.error('Usage: node scripts/bugfix-release-cycle.mjs <path-to-index.ts> [--skip <id>]');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const hadCRLF = raw.includes('\r\n');
let s = hadCRLF ? raw.replace(/\r\n/g, '\n') : raw;

const COUPLING = `          // THE RELEASE FOLLOWS THE FLOW (self-return fix): a release-closed
          // dispatch runs the same home cycle Security's gate runs — head to
          // Check Up, tail to Check Up — instead of completing the trip bare
          // and scattering the yard. coupleTruckRegistry 'home' also frees the
          // driver; HR's own word for him is applied after this block.
          await coupleTruckRegistry(closedTrip, 'home');
          await coupleTailRegistry(closedTrip, 'home');`;

const patches = [
  {
    id: 'release-cycle-live',
    from: `        for (const trip of stuck) {
          await prisma.trip.update({
            where: { id: trip.id },
            data: {
              status: 'Completed',
              eta: trip.eta || autoStamp(new Date()),
              gateInBy: trip.gateInBy || actingUser(req),
            },
          });
        }`,
    to: `        for (const trip of stuck) {
          const closedTrip = await prisma.trip.update({
            where: { id: trip.id },
            data: {
              status: 'Completed',
              eta: trip.eta || autoStamp(new Date()),
              gateInBy: trip.gateInBy || actingUser(req),
            },
          });
${COUPLING}
        }`,
  },
  {
    id: 'release-cycle-repo',
    from: `        for (const trip of stuck) {
          await prisma.trip.update({
            where: { id: trip.id },
            data: { status: 'Completed', gateInBy: trip.gateInBy || actor },
          });
        }`,
    to: `        for (const trip of stuck) {
          const closedTrip = await prisma.trip.update({
            where: { id: trip.id },
            data: { status: 'Completed', gateInBy: trip.gateInBy || actor },
          });
${COUPLING}
        }`,
  },
];

let failed = [];
const applied = [];
for (const p of patches) {
  if (skipped.has(p.id)) continue;
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
