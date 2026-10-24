/**
 * One-shot server patch (run ON the API server, like the other
 * backend-patches/server-patch-*.cjs) for the TRUCK-CAP-AUTO fix (2026-10-24).
 *
 * Problem from the client: trucks added after the roster sheet (and by any
 * other department) showed the bare plate everywhere ("AAA395YP") where
 * siblings read "P0xx (PLATE)" — the cap number was blank, or the plate had
 * been pasted into the cap field, and no code path ever repaired that.
 *
 * GUARANTEE: POST /api/trucks and PATCH /api/trucks/:id now own the cap:
 *   - the plate is required;
 *   - a blank cap, or a cap that merely repeats the plate, is replaced with
 *     the next free P-code (continuing the live max);
 *   - the cap can never be blanked on edit.
 *
 * Verified against the live data first: all 115 trucks already carry proper
 * P-codes, so no backfill is needed — from here on the rule is server-side.
 *
 * Run with: node server-patch-truck-cap-auto-20261024.cjs && pm2 restart fleetopsx-api
 */
const fs = require("fs");
const FILE = process.argv[2] || "/var/www/fleetopsx-api/index.ts";
let src = fs.readFileSync(FILE, "utf8");

const POST_FROM = `app.post('/api/trucks', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {
  try {
    res.json(await prisma.truck.create({ data: req.body }));
  } catch (e: any) {
    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'A truck with this number already exists' });
    throw e;
  }
});`;

const POST_TO = `// TRUCK-CAP-AUTO (24 Oct 2026): the cap number (cabId, "P0xx") is the identity
// every board, gate log and assignment picker reads. Fleet adds new trucks with
// nothing but a plate — or with the plate pasted into the cap field — and every
// screen then showed the bare plate ("AAA395YP") where its neighbours read
// "P0xx (PLATE)". The server now owns the cap: it trims what arrives, refuses a
// truck with no plate, and AUTO-ISSUES the next free P-code whenever the cap
// field is blank or merely repeats the plate, so a truck added by anyone in any
// department carries a usable cap number from the moment it exists.
const truckCapKey = (v: string) => String(v ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
async function nextFreeTruckCap(): Promise<string> {
  const rows = await prisma.truck.findMany({ select: { cabId: true } });
  let max = 0;
  for (const r of rows) {
    const m = /^P(\\d+)$/i.exec(String(r.cabId || '').trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return \`P\${max + 1}\`;
}

app.post('/api/trucks', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Field Ops', 'Fleet Field Operations'), async (req, res) => {
  try {
    const data = { ...req.body };
    delete data.id;
    data.registration = String(data.registration ?? data.plate ?? '').trim();
    if (!data.registration) return res.status(400).json({ error: 'The plate number is required — the cap alone does not identify the truck.' });
    const cap = String(data.cabId ?? data.capNumber ?? '').trim();
    data.cabId = !cap || truckCapKey(cap) === truckCapKey(data.registration) ? await nextFreeTruckCap() : cap;
    delete data.capNumber;
    delete data.plate;
    res.json(await prisma.truck.create({ data }));
  } catch (e: any) {
    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'A truck with this number already exists' });
    throw e;
  }
});`;

const PATCH_FROM = `app.patch('/api/trucks/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {
  try {
    res.json(await prisma.truck.update({ where: { id: req.params.id }, data: req.body }));
  } catch (e: any) {
    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'A truck with this number already exists' });
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Truck not found' });
    throw e;
  }
});`;

const PATCH_TO = `app.patch('/api/trucks/:id', authenticate, authorize('Platform Admin', 'Transport Manager', 'Fleet Operations', 'Fleet Field Ops', 'Fleet Field Operations', 'Engineering'), async (req, res) => {
  try {
    const data = { ...req.body };
    delete data.id;
    // Same cap rule on edit: the cap can be trimmed, but never blanked out and
    // never turned into the plate — the registry row keeps a real cap number.
    if (data.registration !== undefined) data.registration = String(data.registration ?? '').trim();
    if (data.cabId !== undefined || data.capNumber !== undefined) {
      const cap = String(data.cabId ?? data.capNumber ?? '').trim();
      if (!cap || truckCapKey(cap) === truckCapKey(data.registration ?? '')) {
        const row = await prisma.truck.findUnique({ where: { id: req.params.id }, select: { registration: true } });
        const refPlate = String(row?.registration ?? '').trim();
        if (!refPlate && !data.registration) return res.status(400).json({ error: 'A truck with no plate cannot be saved — add the plate number.' });
        data.cabId = await nextFreeTruckCap();
      } else data.cabId = cap;
      delete data.capNumber;
    }
    res.json(await prisma.truck.update({ where: { id: req.params.id }, data }));
  } catch (e: any) {
    if (String(e?.code) === 'P2002') return res.status(409).json({ error: 'A truck with this number already exists' });
    if (String(e?.code) === 'P2025') return res.status(404).json({ error: 'Truck not found' });
    throw e;
  }
});`;

if (src.includes("TRUCK-CAP-AUTO")) {
  console.log("skip: TRUCK-CAP-AUTO already applied");
  process.exit(0);
}

for (const [name, from, to] of [
  ["POST /api/trucks", POST_FROM, POST_TO],
  ["PATCH /api/trucks/:id", PATCH_FROM, PATCH_TO],
]) {
  const at = src.indexOf(from);
  if (at < 0 || src.indexOf(from, at + from.length) >= 0) {
    console.error(`FAILED (${name}): the expected code was not found exactly once — nothing written.`);
    process.exit(1);
  }
  src = src.slice(0, at) + to + src.slice(at + from.length);
}

fs.writeFileSync(FILE + ".bak-truck-cap-auto", fs.readFileSync(FILE));
fs.writeFileSync(FILE, src);
console.log("ok: TRUCK-CAP-AUTO applied (backup at " + FILE + ".bak-truck-cap-auto)");
