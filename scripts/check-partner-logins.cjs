/** Run on Hetzner: prove whether each Active partner can actually log in with the shared test password. */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

(async () => {
  const partners = await prisma.user.findMany({
    where: { role: "Customer Portals (External)", status: "Active" },
    select: { email: true, name: true, password: true, passwordResetRequired: true, partnerCompanyName: true },
    orderBy: { createdAt: "desc" },
  });
  const candidates = ["123456", "Petroline@2026", "ChangeMe123!"];
  for (const u of partners) {
    const matches = [];
    for (const c of candidates) {
      if (await bcrypt.compare(c, u.password)) matches.push(c);
    }
    console.log(`${u.email} | reset=${u.passwordResetRequired} | pwMatch=${matches.join("+") || "NONE"}`);
  }
  await prisma.$disconnect();
})();
