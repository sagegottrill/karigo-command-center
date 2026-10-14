/** Read-only: locate Daniel Saba on the live DB and see what he can reach. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ name: { contains: 'Daniel' } }, { email: { contains: 'daniel' } }, { email: { contains: 'saba' } }],
    },
  });
  console.log('users matching Daniel/saba:', users.length);
  for (const u of users) {
    console.log(
      `${u.id?.slice(-6)} | ${u.name} | ${u.email} | roles: ${JSON.stringify(u.roles)} | company: ${u.partnerCompanyName || '-'}`,
    );
  }
  const companies = await prisma.user.findMany({ where: { partnerCompanyName: { not: null } }, select: { partnerCompanyName: true } });
  console.log('partner companies:', JSON.stringify([...new Set(companies.map((c) => c.partnerCompanyName))]));
  await prisma.$disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
