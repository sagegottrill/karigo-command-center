/**
 * One-shot data heal v2 (run ON the Hetzner box, from /var/www/fleetopsx-api).
 *
 * staffId is UNIQUE in Prisma, so renames must go through a temp value.
 * Remaining fixes after the first pass crashed mid-way:
 *   - Mohammed Ibrahim  0912430289 -> 09124302891 (sheet value)
 *   - Mohammed Auwalu   0912951883 -> 09129518834 (sheet value)
 *   - Adamu Isah (07060804674) has no distinct staffId: the sheet reuses P01001
 *     for him and Adamu Muhammed. He gets the marked provisional P01001B so the
 *     unique constraint holds and he is visible in dropdowns.
 * Run: node /tmp/heal-drivers2.cjs
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const fixes = [
    { name: "Mohammed Ibrahim", from: "0912430289", to: "09124302891" },
    { name: "Mohammed Auwalu", from: "0912951883", to: "09129518834" },
  ];
  for (const f of fixes) {
    const d = await prisma.driver.findFirst({ where: { name: f.name } });
    if (!d) {
      console.log("skip (not found):", f.name);
      continue;
    }
    if (d.phone.replace(/\D/g, "") === f.to) {
      console.log("already ok:", f.name);
      continue;
    }
    await prisma.driver.update({ where: { id: d.id }, data: { phone: f.to } });
    console.log(`phone healed: ${f.name} ${d.phone} -> ${f.to}`);
  }

  // Adamu Isah — give him his own marked staffId via a temp swap.
  const isah = await prisma.driver.findFirst({ where: { phone: { contains: "07060804674" } } });
  if (!isah) {
    console.log("skip: Adamu Isah not found");
  } else if (isah.staffId === "P01001B") {
    console.log("already ok: Adamu Isah = P01001B");
  } else {
    await prisma.driver.update({ where: { id: isah.id }, data: { staffId: "TMP-HEAL-" + Date.now() } });
    await prisma.driver.update({ where: { id: isah.id }, data: { staffId: "P01001B" } });
    console.log(`staffId healed: Adamu Isah ${isah.staffId} -> P01001B`);
  }
  process.exit(0);
})();
