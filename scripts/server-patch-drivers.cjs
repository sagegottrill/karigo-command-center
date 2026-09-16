/**
 * Server patch for /var/www/fleetopsx-api: make HR driver onboarding bulletproof.
 * The 500 today: POST /api/drivers passed req.body straight to Prisma, and a stale
 * cached bundle sent the old license* payload with NO staffId — which the model
 * requires (unique). Prisma threw a raw validation error => bare "500 Server error".
 *
 * Now:
 *   - staffId is auto-assigned (next free P####) when the client doesn't send one,
 *     so onboarding works from ANY cached bundle version.
 *   - Only real Driver columns are written (stray license* fields are ignored).
 *   - Duplicate Driver ID returns a clear 409, missing name a clear 400.
 *   - Every failure is logged with its real reason instead of a silent 500.
 *   - PATCH gets the same whitelist + duplicate handling.
 * Idempotent: re-running detects the mark and skips. Backup made first.
 * Usage: node server-patch-drivers.cjs
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const INDEX = '/var/www/fleetopsx-api/index.ts';
const MARK = '// driver-onboarding-hardening';

const NEW_BLOCK = `// --- DRIVERS ---
${MARK}
const DRIVER_FIELDS = ['name', 'phone', 'staffId', 'truckReg', 'truckReg2', 'category', 'status'];

/** Next free P-number (P0001…) — used when the client sends no Driver ID. */
async function nextFreeDriverId(): Promise<string> {
  const existing = await prisma.driver.findMany({ select: { staffId: true } });
  const used = new Set(existing.map((d) => (d.staffId || '').toUpperCase()));
  let n = 1;
  while (used.has('P' + String(n).padStart(4, '0'))) n++;
  return 'P' + String(n).padStart(4, '0');
}

app.get('/api/drivers', authenticate, async (_req, res) => {
  res.json(await prisma.driver.findMany({ orderBy: { createdAt: 'desc' } }));
});
app.post('/api/drivers', authenticate, async (req, res) => {
  try {
    const b = req.body || {};
    const name = String(b.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'Driver name is required.' });
    let staffId = String(b.staffId ?? b.employeeId ?? b.driverId ?? '').trim().toUpperCase();
    if (!staffId) staffId = await nextFreeDriverId();
    const dupe = await prisma.driver.findFirst({ where: { staffId } });
    if (dupe) {
      return res.status(409).json({ error: 'Driver ID ' + staffId + ' is already assigned to ' + dupe.name + '.' });
    }
    const data: any = { name, staffId, status: b.status || 'Active' };
    for (const key of DRIVER_FIELDS) {
      if (key === 'name' || key === 'staffId' || key === 'status') continue;
      if (b[key] !== undefined && b[key] !== null && String(b[key]).trim() !== '') data[key] = String(b[key]).trim();
    }
    const driver = await prisma.driver.create({ data });
    void notify('HR', 'New Staff Onboarded', name + ' (' + staffId + ') was added to the driver roster.', 'success', 'Transport Manager,HR');
    res.json(driver);
  } catch (e: any) {
    console.error('POST /api/drivers failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not save the driver. Please try again.' });
  }
});
app.patch('/api/drivers/:id', authenticate, async (req, res) => {
  try {
    const b = req.body || {};
    const data: any = {};
    for (const key of DRIVER_FIELDS) {
      if (b[key] !== undefined) data[key] = b[key] === null ? null : String(b[key]).trim();
    }
    if (data.staffId) {
      data.staffId = data.staffId.toUpperCase();
      const dupe = await prisma.driver.findFirst({ where: { staffId: data.staffId, NOT: { id: req.params.id } } });
      if (dupe) {
        return res.status(409).json({ error: 'Driver ID ' + data.staffId + ' is already assigned to ' + dupe.name + '.' });
      }
    }
    res.json(await prisma.driver.update({ where: { id: req.params.id }, data }));
  } catch (e: any) {
    console.error('PATCH /api/drivers failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not update the driver.' });
  }
});
app.delete('/api/drivers/:id', authenticate, async (req, res) => {
  try {
    await prisma.driver.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (e: any) {
    console.error('DELETE /api/drivers failed:', e?.message || e);
    res.status(500).json({ error: e?.message || 'Could not remove the driver.' });
  }
});
`;

function main() {
  const backup = `${INDEX}.bak-drivers`;
  if (!fs.existsSync(backup)) fs.copyFileSync(INDEX, backup);
  let src = fs.readFileSync(INDEX, 'utf8');
  if (src.includes(MARK)) {
    console.log('drivers: already hardened — skip');
  } else {
    const start = src.indexOf('// --- DRIVERS ---');
    const end = src.indexOf('// --- INVENTORY ---');
    if (start === -1 || end === -1 || end <= start) throw new Error('could not locate the DRIVERS block');
    src = src.slice(0, start) + NEW_BLOCK + '\n' + src.slice(end);
    fs.writeFileSync(INDEX, src);
    console.log('drivers: hardened POST/PATCH/DELETE + auto Driver ID');
  }
  console.log('restart: pm2 reload…');
  execSync('pm2 reload fleetopsx-api --update-env', { stdio: 'inherit' });
  console.log('DONE');
}

main();
