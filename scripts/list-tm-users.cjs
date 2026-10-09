const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const users = await prisma.user.findMany({
    where: { roles: { contains: 'Transport Manager' } },
    select: { email: true, name: true, roles: true },
    take: 10,
  });
  console.log(JSON.stringify(users, null, 1));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
