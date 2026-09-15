/**
 * One-shot data heal (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * Reconciles the Driver seed against the staff spreadsheet (values inlined from
 * Petroline_Driver_Staff_List_Complete (1).xlsx so the script is self-contained):
 *  1) the duplicated staff number P01001 (Adamu Muhammed vs Adamu Isah) — Adamu
 *     Isah keeps the sheet's P01001? No: the sheet itself reuses P01001 for both
 *     rows, so the SECOND one cannot keep it. Adamu Isah (P038 cab) is given a
 *     distinct, clearly-marked provisional number instead of silently colliding.
 *  2) the 3 phones shorter than 11 digits are restored to the sheet values.
 *  3) same-name pairs that the old seed shuffled (Hassan Abdullahi, Hassan
 *     Mohammed, Abdullahi Adamu) are re-matched by PHONE, which is unique.
 * Run: node /tmp/heal-drivers.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// name+phone → staffId, straight from the sheet (both staff-number columns).
const SHEET = [
  { staffId: "P00959", name: "Hassan Abdullahi", phone: "07042236908" },
  { staffId: "P01019", name: "Hassan Abdullahi", phone: "08145511587" },
  { staffId: "P00982", name: "Hassan Mohammed", phone: "08167736574" },
  { staffId: "P00966", name: "Hassan Mohammed", phone: "08089364110" },
  { staffId: "P00903", name: "Abdullahi Adamu", phone: "09064472332" },
  { staffId: "P01005", name: "Abdullahi Adamu", phone: "09055912576" },
  { staffId: "P01001", name: "Adamu Muhammed", phone: "07016779738" },
  { staffId: "P01001", name: "Adamu Isah", phone: "07060804674" },
  { staffId: "P00891", name: "Mohammed Ibrahim", phone: "09124302891" },
  { staffId: "P00970", name: "Mohammed Auwalu", phone: "09129518834" },
];

const PROVISIONAL_FOR_DUPLICATE = "P01001B"; // Adamu Isah — sheet reuses P01001

(async () => {
  const drivers = await prisma.driver.findMany();
  const byPhone = new Map(
    drivers.filter((d) => d.phone).map((d) => [d.phone.replace(/\D/g, "").slice(-10), d]),
  );

  let fixed = 0;
  for (const row of SHEET) {
    const key = row.phone.replace(/\D/g, "").slice(-10);
    const d = byPhone.get(key);
    if (!d) continue;
    const updates = {};
    if (d.name.trim() !== row.name) updates.name = row.name;
    if (d.phone.replace(/\D/g, "") !== row.phone.replace(/\D/g, "")) updates.phone = row.phone;
    const wantedId = row.name === "Adamu Isah" ? PROVISIONAL_FOR_DUPLICATE : row.staffId;
    if ((d.staffId || "").trim() !== wantedId) updates.staffId = wantedId;
    if (Object.keys(updates).length > 0) {
      await prisma.driver.update({ where: { id: d.id }, data: updates });
      console.log(`healed ${row.name} (${wantedId}):`, Object.keys(updates).join(", "));
      fixed++;
    }
  }
  console.log(`done — ${fixed} driver rows updated`);
  process.exit(0);
})();
