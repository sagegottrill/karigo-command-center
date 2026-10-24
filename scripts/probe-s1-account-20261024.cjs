const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  try {
    const users = await p.user.findMany({
      where: { OR: [{ name: { contains: 'S.1' } }, { name: { contains: 'S1' } }, { email: { contains: 's1' } }, { role: { equals: 'Security' } }] },
      select: { email: true, name: true, role: true, status: true, createdAt: true },
    });
    console.log('--- S.1 / Security-role accounts:');
    for (const u of users) console.log(u.email, '|', u.name, '|', u.role, '|', u.status, '|', u.createdAt);
    await p.$disconnect();
  } catch (e) { console.error('ERR', e.message); process.exit(1); }
})();
