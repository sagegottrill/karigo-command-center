/** Run on the Hetzner box: dump recent partner users + login-blocking flags. */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

(async () => {
  const partners = await prisma.user.findMany({
    where: { role: "Customer Portals (External)" },
    select: {
      email: true,
      name: true,
      status: true,
      partnerCompanyName: true,
      passwordResetRequired: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  console.log(JSON.stringify(partners, null, 1));
  await prisma.$disconnect();
})();
