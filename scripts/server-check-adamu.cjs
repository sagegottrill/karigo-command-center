/** Inspect Adamu drivers + P01001 owners on the server. */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.driver.findMany({ where: { name: { contains: "Adamu" } } });
  console.log("--- drivers named *Adamu*:");
  for (const d of rows) console.log(d.id, "|", d.name, "|", d.phone, "|", d.staffId);

  const dup = await prisma.driver.findMany({ where: { staffId: "P01001" } });
  console.log("--- P01001 owners:");
  for (const d of dup) console.log(d.id, "|", d.name, "|", d.phone, "|", d.staffId);

  const missing = await prisma.driver.findMany({ where: { OR: [{ staffId: "" }, { staffId: null }] } });
  console.log("--- drivers with empty staffId:", missing.length);
  for (const d of missing.slice(0, 20)) console.log(d.id, "|", d.name, "|", d.phone, '|', d.staffId);
  await prisma.$disconnect();
})().catch(e => { console.error(e.message); process.exit(1); });
