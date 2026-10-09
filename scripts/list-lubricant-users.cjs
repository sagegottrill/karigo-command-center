const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { role: { contains: 'Lubricant' } },
        { roles: { contains: 'Lubricant' } },
        { role: { contains: 'Fuel' } },
        { roles: { contains: 'Fuel' } },
        { role: { contains: 'Inventory' } },
      ],
    },
    select: { email: true, name: true, role: true, roles: true },
    take: 8,
  });
  console.log(JSON.stringify(users, null, 1));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
