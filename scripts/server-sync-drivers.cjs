/**
 * One-shot server sync (run ON the Hetzner box, from /var/www/fleetopsx-api).
 * Reconciles the Driver table against Fortune's NEW authoritative sheet
 * (Fortune File - Driver (1).xlsx, 102 rows, P#### 4-digit staff numbers):
 *
 *  1. Every sheet driver exists (Adamu Isah already added, skip).
 *  2. Phones: the sheet wins on conflicts EXCEPT its two known 10-digit
 *     typos (Mohammed Ibrahim, Mohammed Auwalu) — keep live 11-digit values.
 *  3. staffId: reformat P00860 → P0860 to match the sheet, except where the
 *     sheet itself reuses a number (P1001 → second owner gets P1001B).
 *
 * Names matched case-insensitively, trimmed. Run: node sync-drivers.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// Sheet rows pasted from "Fortune File - Driver (1).xlsx" (Driver Staff List).
const SHEET = require("./sheet-drivers.json");

// Sheet typos confirmed earlier: these sheet phones are 10 digits while live
// has the full 11-digit numbers. Do not downgrade live phones to these.
const SHEET_PHONE_TYPOS = new Set(["0912430289", "0912951883"]);

const norm = (v) => String(v || "").trim();
const digits = (v) => norm(v).replace(/\D/g, "");
const nameKey = (v) => norm(v).toLowerCase();

(async () => {
  const drivers = await prisma.driver.findMany();
  const byName = new Map();
  const byNamePhone = new Map();
  for (const d of drivers) {
    const k = nameKey(d.name);
    if (!byName.has(k)) byName.set(k, d);
    byNamePhone.set(k + "|" + digits(d.phone).slice(-10), d);
  }

  let created = 0, phonesFixed = 0, idsFixed = 0, skippedDup = 0;
  const usedIds = new Set(drivers.map((d) => norm(d.staffId).toUpperCase()));

  for (const row of SHEET) {
    const name = norm(row.name);
    const sheetPhone = digits(row.phone);
    let sheetId = norm(row.staffNo).toUpperCase();
    if (!name || !/^P\d+/.test(sheetId)) continue;

    // Duplicate sheet names (Abdullahi Adamu ×2, Ali Mohammed ×2 …) must be
    // matched by phone; name-only only for unique names.
    const existing =
      byNamePhone.get(nameKey(name) + "|" + sheetPhone.slice(-10)) ||
      (drivers.filter((d) => nameKey(d.name) === nameKey(name)).length === 1
        ? byName.get(nameKey(name))
        : undefined);
    if (!existing) {
      // Create — but only with a staffId that isn't taken.
      let id = sheetId;
      if (usedIds.has(id)) id = sheetId + "B";
      usedIds.add(id);
      await prisma.driver.create({ data: { name, phone: sheetPhone, staffId: id } });
      created++;
      console.log("created:", name, id, sheetPhone);
      continue;
    }

    // Phone: sheet wins unless it's a known 10-digit typo.
    const livePhone = digits(existing.phone);
    if (sheetPhone && sheetPhone !== livePhone && !SHEET_PHONE_TYPOS.has(sheetPhone)) {
      await prisma.driver.update({ where: { id: existing.id }, data: { phone: sheetPhone } });
      phonesFixed++;
      console.log(`phone: ${name} ${existing.phone} -> ${sheetPhone}`);
      existing.phone = sheetPhone;
    }

    // staffId: reformat to the sheet's canonical P#### (P00860 → P0860).
    const liveId = norm(existing.staffId).toUpperCase();
    const liveDigits = liveId.replace(/\D/g, "").replace(/^0+/, "");
    const sheetDigits = sheetId.replace(/\D/g, "").replace(/^0+/, "");
    const targetId = "P" + sheetDigits;
    // Same number, different FORMAT → reformat so the UI shows the sheet's
    // exact staff numbers. Different number entirely → leave alone.
    if (liveDigits && liveDigits === sheetDigits && liveId !== targetId) {
      if (targetId !== liveId && !usedIds.has(targetId)) {
        // staffId is UNIQUE: swap through a temp value.
        await prisma.driver.update({ where: { id: existing.id }, data: { staffId: "TMP-" + Date.now() + "-" + idsFixed } });
        await prisma.driver.update({ where: { id: existing.id }, data: { staffId: targetId } });
        usedIds.delete(liveId);
        usedIds.add(targetId);
        idsFixed++;
        console.log(`staffId: ${name} ${liveId} -> ${targetId}`);
      } else {
        skippedDup++;
        console.log(`skip (id taken): ${name} ${liveId} -> ${targetId}`);
      }
    }
  }

  console.log(`\ndone: created=${created} phonesFixed=${phonesFixed} idsFixed=${idsFixed} skippedDup=${skippedDup}`);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
