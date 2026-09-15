/**
 * Corrective pass: set every driver's staffId to the sheet's VERBATIM
 * staffNo (P0017…P1020, zero-padded 4-digit) — the previous pass stripped
 * leading zeros (P17). Run ON the Hetzner box from /var/www/fleetopsx-api.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
const SHEET = require("./sheet-drivers.json");

const norm = (v) => String(v || "").trim();
const digits = (v) => norm(v).replace(/\D/g, "");
const nameKey = (v) => norm(v).toLowerCase();

(async () => {
  const drivers = await prisma.driver.findMany();
  const byNamePhone = new Map();
  const byName = new Map();
  const nameCounts = {};
  for (const d of drivers) {
    const k = nameKey(d.name);
    nameCounts[k] = (nameCounts[k] || 0) + 1;
    byNamePhone.set(k + "|" + digits(d.phone).slice(-10), d);
    if (!byName.has(k)) byName.set(k, d);
  }
  const usedIds = new Set(drivers.map((d) => norm(d.staffId).toUpperCase()));

  let fixed = 0, skipped = 0;
  for (const row of SHEET) {
    const name = norm(row.name);
    const sheetPhone = digits(row.phone);
    const sheetId = norm(row.staffNo).toUpperCase();
    if (!name || !/^P\d+/.test(sheetId)) continue;

    const existing =
      byNamePhone.get(nameKey(name) + "|" + sheetPhone.slice(-10)) ||
      (nameCounts[nameKey(name)] === 1 ? byName.get(nameKey(name)) : undefined);
    if (!existing) continue;

    const liveId = norm(existing.staffId).toUpperCase();
    if (liveId === sheetId) continue;

    // The previous pass already rewrote IDs to unpadded forms; for duplicate
    // sheet numbers the earlier seed kept unique values (P01001B, P01009B) —
    // those drivers are NOT in this sheet list (deduped), so no clash here.
    if (usedIds.has(sheetId)) {
      skipped++;
      console.log(`skip (taken): ${name} ${liveId} -> ${sheetId}`);
      continue;
    }
    await prisma.driver.update({ where: { id: existing.id }, data: { staffId: "TMP-" + Date.now() + "-" + fixed } });
    await prisma.driver.update({ where: { id: existing.id }, data: { staffId: sheetId } });
    usedIds.delete(liveId);
    usedIds.add(sheetId);
    fixed++;
  }
  console.log(`done: fixed=${fixed} skipped=${skipped}`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
