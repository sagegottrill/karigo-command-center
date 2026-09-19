/** Reads back the seeded loading locations, then removes the probe partner users. */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const users = await prisma.user.findMany({
    where: { email: { contains: "zz-site-probe" } },
    select: { id: true, email: true, partnerCompanyName: true, loadingSites: true },
  });
  for (const u of users) {
    console.log("probe:", u.email, "|", u.partnerCompanyName, "| loadingSites:", JSON.stringify(u.loadingSites));
  }
  const del = await prisma.$executeRawUnsafe('DELETE FROM "User" WHERE "email" ILIKE $1', "%zz-site-probe%");
  console.log("probe users removed:", del);
  const left = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int AS n FROM "User" WHERE "email" ILIKE $1', "%zz-site-probe%");
  console.log("probe users left:", left?.[0]?.n ?? left);
  await prisma.$disconnect();
})();
