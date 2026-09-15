/**
 * One-shot server patch for /var/www/fleetopsx-api (run ON the Hetzner box).
 * Fuel pricing: TM is the single source of truth for price per litre.
 *   1) Adds the FuelPrice model to prisma/schema.prisma + `prisma db push`.
 *   2) GET /api/fuel-prices — any authenticated role can read current prices.
 *   3) PUT /api/fuel-prices — Transport Manager / Platform Admin only; upserts
 *      Diesel or Gas price and notifies TM + FO so every module re-prices.
 *   4) Seeds Diesel = 1800 and Gas = 1200 (₦/litre) if absent.
 * Idempotent: re-running detects existing marks and skips. Backup made first.
 * Usage: node server-patch-fuel-prices.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = '/var/www/fleetopsx-api';
const INDEX = path.join(ROOT, 'index.ts');
const SCHEMA = path.join(ROOT, 'prisma/schema.prisma');

function backup(file) {
  const dst = `${file}.bak-fuel-prices`;
  if (!fs.existsSync(dst)) fs.copyFileSync(file, dst);
}

function patchSchema() {
  let src = fs.readFileSync(SCHEMA, 'utf8');
  if (src.includes('model FuelPrice')) {
    console.log('schema: FuelPrice already present — skip');
    return;
  }
  const model = `
// fuel-prices-patch
model FuelPrice {
  id            String   @id @default(uuid())
  fuelType      String   @unique // "Diesel" | "Gas"
  pricePerLitre Float
  updatedBy     String
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
`;
  src = src.trimEnd() + '\n' + model;
  fs.writeFileSync(SCHEMA, src);
  console.log('schema: FuelPrice model appended');
}

function patchIndex() {
  let src = fs.readFileSync(INDEX, 'utf8');
  if (src.includes('/api/fuel-prices')) {
    console.log('index: fuel-prices endpoints already present — skip');
    return;
  }

  // Insert before an existing, definitely-present anchor route.
  const anchor = `app.get('/api/notifications', authenticate`;
  if (!src.includes(anchor)) throw new Error('anchor route not found in index.ts — aborting, file unchanged');
  const insertAt = src.indexOf(anchor);

  const block = `// ---- Fuel prices: TM-managed price per litre — source of truth for all modules ----
app.get('/api/fuel-prices', authenticate, async (req: any, res) => {
  try {
    res.json(await prisma.fuelPrice.findMany({ orderBy: { fuelType: 'asc' } }));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/fuel-prices', authenticate, authorize('Transport Manager', 'Platform Admin'), async (req: any, res) => {
  const t = String(req.body?.fuelType || '').trim();
  const p = Number(req.body?.pricePerLitre);
  if (!['Diesel', 'Gas'].includes(t)) return res.status(400).json({ error: 'fuelType must be Diesel or Gas' });
  if (!Number.isFinite(p) || p <= 0) return res.status(400).json({ error: 'pricePerLitre must be a positive number' });
  try {
    const row = await prisma.fuelPrice.upsert({
      where: { fuelType: t },
      update: { pricePerLitre: p, updatedBy: req.user.name || req.user.email },
      create: { fuelType: t, pricePerLitre: p, updatedBy: req.user.name || req.user.email },
    });
    try {
      await notify('Operations', 'Fuel Price Updated',
        \`\${t} price is now ₦\${p.toLocaleString()} per litre (set by \${req.user.name || 'Transport Manager'}).\`,
        'info', 'Transport Manager,Fleet Operations');
    } catch (_) {}
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

`;
  src = src.slice(0, insertAt) + block + src.slice(insertAt);
  fs.writeFileSync(INDEX, src);
  console.log('index: fuel-prices endpoints inserted');
}

function seed() {
  const seedScript = `const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  await p.fuelPrice.upsert({ where: { fuelType: 'Diesel' }, update: {}, create: { fuelType: 'Diesel', pricePerLitre: 1800, updatedBy: 'System Seed' } });
  await p.fuelPrice.upsert({ where: { fuelType: 'Gas' }, update: {}, create: { fuelType: 'Gas', pricePerLitre: 1200, updatedBy: 'System Seed' } });
  const rows = await p.fuelPrice.findMany();
  console.log('FUEL PRICES:', JSON.stringify(rows.map((r) => ({ t: r.fuelType, p: r.pricePerLitre }))));
  await p.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
`;
  fs.writeFileSync(path.join(ROOT, 'seed-fuel-prices.cjs'), seedScript);
  execSync('npx prisma db push --skip-generate --accept-data-loss', { cwd: ROOT, stdio: 'inherit', timeout: 120000 });
  execSync('node seed-fuel-prices.cjs', { cwd: ROOT, stdio: 'inherit', timeout: 60000 });
  console.log('seed: Diesel 1800 / Gas 1200 ensured');
}

backup(INDEX);
backup(SCHEMA);
patchSchema();
patchIndex();
seed();
console.log('FUEL PRICE PATCH COMPLETE');
