/**
 * BUGFIX-TAIL-COUPLING — end-to-end flow completion (head + tail + driver):
 * two dispatch-moving paths still updated the HEAD only and left the TAIL
 * behind, so "the flow" differed depending on which screen did the moving:
 *   1. A tracking checkpoint that advances the dispatch (home or out) coupled
 *      coupleTruckRegistry but never coupleTailRegistry.
 *   2. The signed loading pickup coupled the truck OUT but not the tail.
 * Both now couple BOTH registries; the driver rides the same couple
 * (coupleTruckRegistry 'home' frees him through the protected routine).
 *
 * Usage: node scripts/bugfix-tail-coupling.mjs <index.ts> [--skip <id>]
 * The checkpoint anchor exists in both drifted variants; the loading-pickup
 * anchor currently exists only in the hot-patched live file.
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
  console.error('Usage: node scripts/bugfix-tail-coupling.mjs <path-to-index.ts> [--skip <id>]');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const hadCRLF = raw.includes('\r\n');
let s = hadCRLF ? raw.replace(/\r\n/g, '\n') : raw;

const patches = [
  {
    id: 'tail-coupling-checkpoint',
    from: `        const movedTrip = { ...trip, ...data };
        if (String(movedTrip.status) === 'Completed') void coupleTruckRegistry(movedTrip, 'home');
        else void coupleTruckRegistry(movedTrip, 'out');`,
    to: `        // END-TO-END FLOW (head + tail + driver): the checkpoint's transition
        // moves the head AND the tail it hauled, home or out — the tail can
        // never be left behind because the move came from a checkpoint instead
        // of the gate. The driver rides the same couple (coupleTruckRegistry
        // 'home' frees him through the HR-protected routine).
        const movedTrip = { ...trip, ...data };
        if (String(movedTrip.status) === 'Completed') {
          void coupleTruckRegistry(movedTrip, 'home');
          void coupleTailRegistry(movedTrip, 'home');
        } else {
          void coupleTruckRegistry(movedTrip, 'out');
          void coupleTailRegistry(movedTrip, 'out');
        }`,
  },
  {
    id: 'tail-coupling-loading-pickup',
    from: `      await prisma.trip.update({ where: { id: tripId }, data });
      void coupleTruckRegistry({ ...trip, ...data }, 'out');`,
    to: `      await prisma.trip.update({ where: { id: tripId }, data });
      void coupleTruckRegistry({ ...trip, ...data }, 'out');
      void coupleTailRegistry({ ...trip, ...data }, 'out');`,
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
