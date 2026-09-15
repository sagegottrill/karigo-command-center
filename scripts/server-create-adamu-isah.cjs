/**
 * One-shot: create the missing "Adamu Isah" (sheet row 31: P01001 duplicate,
 * own number P038, phone 07060804674) and print a final sheet-vs-server
 * reconciliation of every driver (phones / staffIds).
 * Run ON the Hetzner box from /var/www/fleetopsx-api.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const isah = await prisma.driver.findFirst({ where: { phone: { contains: "07060804674" } } });
  if (isah) {
    console.log("Adamu Isah exists:", isah.id, isah.staffId);
  } else {
    let staffId = "P038";
    const taken = await prisma.driver.findFirst({ where: { staffId: "P038" } });
    if (taken) {
      const takenB = await prisma.driver.findFirst({ where: { staffId: "P01001B" } });
      staffId = takenB ? "P01001B" + Date.now().toString().slice(-2) : "P01001B";
    }
    const created = await prisma.driver.create({
      data: { name: "Adamu Isah", phone: "07060804674", staffId },
    });
    console.log("created Adamu Isah:", created.id, "staffId:", staffId);
  }

  const drivers = await prisma.driver.findMany({ orderBy: { name: "asc" } });
  const short = drivers.filter(d => d.phone && d.phone.replace(/\D/g, "").length !== 11);
  const dupStaff = {};
  for (const d of drivers) {
    if (!d.staffId) continue;
    dupStaff[d.staffId] = (dupStaff[d.staffId] || 0) + 1;
  }
  const dupList = Object.entries(dupStaff).filter(([, n]) => n > 1);
  console.log("total drivers:", drivers.length);
  console.log("drivers with phone length != 11:", short.length, short.map(d => `${d.name}:${d.phone}`).join(", "));
  console.log("duplicate staffIds:", dupList.length ? JSON.stringify(dupList) : "none");
  await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
