/**
 * BUGFIX-FLEET-RETURN — applies the confirmed fixes from BUG-REPORT.md (2026-10-13):
 *   B2  truthful return stamps (no invented 'Petroline Security' author)
 *   B5  gate self-heal timer disabled (no invented departures)
 *   B4  /api/gate/return matcher hardened (min key length, token split, fleet-guard cap)
 *   B6  partner requests locked to 'Requested', /api/gate restricted to gate roles
 *   B7  driver-release closures stamped with the acting account
 *
 * Usage: node scripts/bugfix-fleet-return-20261013.mjs <path-to-index.ts>
 * Exits non-zero if any anchor is missing (so a drifted file is never half-patched).
 */
import fs from 'node:fs';

const argv = process.argv.slice(2);
const file = argv[0];
const skipArg = argv.find((a) => a.startsWith('--skip'));
const skipIndex = skipArg ? argv.indexOf(skipArg) : -1;
const skipList = skipArg
  ? skipArg.includes('=') ? skipArg.split('=')[1] : argv[skipIndex + 1] || ''
  : '';
const skipped = new Set(
  skipList.split(',').map((v) => v.trim()).filter(Boolean),
);
if (!file) {
  console.error('Usage: node scripts/bugfix-fleet-return-20261013.mjs <path-to-index.ts> [--skip <id,id,..>]');
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
// Normalize CRLF so anchors match regardless of which checkout wrote the file.
const hadCRLF = raw.includes('\r\n');
let s = hadCRLF ? raw.replace(/\r\n/g, '\n') : raw;

const patches = [
  {
    id: 'B2-truthful-return-stamp',
    from: `  if (data.status === 'Completed') {
    const rawIn = data.gateInBy || before?.gateInBy || gateActor;
    if (!rawIn || /auto-reconcil|superseded|departure predates|transport manager|platform admin|admin/i.test(rawIn)) {
      data.gateInBy = 'Petroline Security';
    } else {
      data.gateInBy = rawIn;
    }`,
    to: `  if (data.status === 'Completed') {
    // TRUTHFUL-RETURN-STAMP (B2): the return stamp names the account that
    // actually ended the movement. A real stamp by Tracking or the gate is
    // never rewritten into a fixed department name — the old code silently
    // re-labelled these closures as "Petroline Security", which is exactly how
    // the ledger lost its truth. Only genuine auto-stamp placeholders from the
    // old reconcile sweep collapse back to the acting account.
    const rawIn = data.gateInBy || before?.gateInBy || gateActor;
    const cleanIn = rawIn && !/auto-reconcil|superseded|departure predates/i.test(rawIn) ? rawIn : gateActor;
    data.gateInBy = cleanIn || null;`,
  },
  {
    id: 'B5-no-invented-departure-author',
    from: `          startTime: autoStamp(trip.dispatchedAt || trip.assignedAt || trip.approvedAt || trip.createdAt),
          gateOutBy: 'Petroline Security',
          directCosts: costs,`,
    to: `          startTime: autoStamp(trip.dispatchedAt || trip.assignedAt || trip.approvedAt || trip.createdAt),
          directCosts: costs,`,
  },
  {
    id: 'B5-disable-self-heal-timer',
    from: `void autoReconcileGateDepartures();
setInterval(() => void autoReconcileGateDepartures(), 3 * 60 * 1000);`,
    to: `// DISABLED (B5): the self-heal invented departures — and their author — for
// the gate without the gate logging anything. A departure now exists only when
// the gate window, "Return a truck" or the department screens write it with
// their own account stamped on it. POST /api/gate/backfill still covers
// pre-go-live history by hand.
// void autoReconcileGateDepartures();
// setInterval(() => void autoReconcileGateDepartures(), 3 * 60 * 1000);`,
  },
  {
    id: 'B7-driver-release-honest-stamp',
    from: `              gateInBy: trip.gateInBy || 'Petroline Security',`,
    to: `              gateInBy: trip.gateInBy || actingUser(req),`,
  },
  {
    id: 'B6-partner-status-lock',
    from: `    status: req.body.status || (raisedForPartner ? 'Requested' : 'Draft'),`,
    to: `    // PARTNER-LOCK (B6): a partner can never start its own dispatch lifecycle
    // however the client sends the payload — its request always enters as
    // 'Requested' and waits for the Transport Manager.
    status: isPartner ? 'Requested' : (req.body.status || (raisedForPartner ? 'Requested' : 'Draft')),`,
  },
  {
    id: 'B6-gate-window-authorize',
    from: `app.post('/api/gate', authenticate, async (req, res) => {`,
    to: `app.post('/api/gate', authenticate, authorize('Security', 'Gate Security', 'Gate', 'Platform Admin', 'Transport Manager'), async (req, res) => {`,
  },
  {
    id: 'B4-gate-return-safe-matching',
    from: `  try {
    const key = TRUCK_KEY(raw);
    const trucks = await prisma.truck.findMany();
    const truck = trucks.find((t) => truckMatches(t, [key])) || null;

    // Any dispatch still naming this truck is over — the truck is at the gate.
    const open = await prisma.trip.findMany({
      where: {
        status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] },
      },
    });
    const stillOpen = open.filter((t) => truckMatches(truck || { registration: raw, cabId: raw }, truckKeysOf(t)) || truckKeysOf(t).includes(key));`,
    to: `  try {
    const key = TRUCK_KEY(raw);
    const SAFE_MIN_KEY = 4;
    // GATERETURN:V3 (B4): a combined stamp "GGE95YK / B055" is split into its
    // whole tokens, and a fragment shorter than four characters is REFUSED — a
    // 2-3 char text is a substring of half the fleet's plates and tails, and
    // matching on it closed whole families of dispatches in one request. One
    // return closes one truck's trips, exactly.
    const tokens = raw.split(/[\\s/]+/).map((v) => TRUCK_KEY(v)).filter((k) => k.length >= 3);
    if (key.length < 3) {
      return res.status(400).json({ error: 'That input is too short to match a truck safely — type the full cap number or plate.' });
    }
    const trucks = await prisma.truck.findMany();
    const ownKeys = (t: any) => [TRUCK_KEY(t.registration), TRUCK_KEY(t.cabId)].filter((k: string) => k.length >= 3);
    const truck = trucks.find((t) => [...tokens, key].some((m) => ownKeys(t).includes(m))) || null;

    // Any dispatch still naming this truck is over — the truck is at the gate.
    // Matching is on whole tokens; substring containment is kept ONLY for
    // tokens of SAFE_MIN_KEY characters or more, so one bad key can never
    // sweep every tail in a family (B0xx/B1xxx all share prefixes again).
    const open = await prisma.trip.findMany({
      where: {
        status: { in: ['Scheduled', 'En Route', 'Loaded', 'Offloading', 'Returning', 'Delayed'] },
      },
    });
    const matchKeys = [...tokens, key];
    const stillOpen = open.filter((t) => {
      const keys = truckKeysOf(t);
      return keys.some((k) =>
        matchKeys.some((m) =>
          m === k ||
          (m.length >= SAFE_MIN_KEY && k.includes(m)) ||
          (k.length >= SAFE_MIN_KEY && m.includes(k))));
    });
    if (stillOpen.length > 3) {
      // FLEET-GUARD (B4): several open dispatches on the SAME truck are
      // expected (re-baked siblings), but matching most of the fleet is a bug.
      return res.status(409).json({ error: stillOpen.length + ' dispatches matched "' + raw + '" — too many to close on one return. Type the exact cap number or plate.' });
    }`,
  },
  {
    id: 'B4-departure-min-key',
    from: `      return (plateKey && (tr.includes(plateKey) || tail.includes(plateKey))) ||`,
    to: `      return (plateKey && plateKey.length >= 4 && (tr.includes(plateKey) || tail.includes(plateKey))) ||`,
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
  console.error('Nothing to apply (skipped everything).');
  process.exit(1);
}

fs.writeFileSync(file, hadCRLF ? s.replace(/\n/g, '\r\n') : s);
console.log('Patched', file, '—', applied.length, 'fixes applied:', applied.join(', '));
