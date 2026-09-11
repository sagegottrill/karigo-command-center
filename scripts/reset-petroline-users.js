const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();
const PASSWORD = "Petroline@2026";
const ADMIN_PASSWORD = "Admin@2026";

const users = [
  { email: "admin@fleetopsx.com", name: "System Admin", role: "Platform Admin", password: ADMIN_PASSWORD },
  { email: "manager@petroline.ng", name: "Petroline Transport Manager", role: "Transport Manager", password: PASSWORD },
  { email: "fleet@petroline.ng", name: "Petroline Fleet Ops", role: "Fleet Operations", password: PASSWORD },
  { email: "hr@petroline.ng", name: "Petroline HR", role: "HR", password: PASSWORD },
  { email: "accounts@petroline.ng", name: "Petroline Accounts", role: "Accounts", password: PASSWORD },
  { email: "engineering@petroline.ng", name: "Petroline Engineering", role: "Engineering", password: PASSWORD },
  { email: "gate@petroline.ng", name: "Petroline Security", role: "Security", password: PASSWORD },
  // Partner Company Portal — username local-part `mdanjuma` also works after API login patch
  {
    email: "mdanjuma@sabasteel.com",
    name: "Musa Danjuma",
    role: "Customer Portals (External)",
    password: PASSWORD,
  },
];

(async () => {
  for (const u of users) {
    const hashed = await bcrypt.hash(u.password, 10);
    const existing = await prisma.user.findFirst({
      where: { email: { equals: u.email, mode: "insensitive" } },
    });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          email: u.email,
          name: u.name,
          role: u.role,
          password: hashed,
          status: "Active",
        },
      });
      console.log("updated", u.email, u.role);
    } else {
      await prisma.user.create({
        data: {
          email: u.email,
          name: u.name,
          role: u.role,
          password: hashed,
          status: "Active",
        },
      });
      console.log("created", u.email, u.role);
    }
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
