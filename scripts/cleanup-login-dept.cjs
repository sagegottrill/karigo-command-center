/**
 * Hard-delete every trace of the one temp account used to verify the restored
 * "Select Department" sign-in (the API's DELETE /users is a SOFT delete, which
 * would leave a Deleted row visible in Account Management).
 *
 * Run ON the VPS: node cleanup-login-dept.cjs
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const users = await prisma.user.findMany({
    where: { OR: [{ name: { contains: 'ZZ LoginDept' } }, { email: { startsWith: 'zz.logindept' } }] },
    select: { id: true, email: true, name: true, status: true },
  });
  for (const u of users) {
    await prisma.loginReport.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: u.id } });
    console.log('hard-deleted', u.email, '(' + u.status + ')');
  }
  const remaining = await prisma.user.findMany({ select: { email: true, name: true, role: true, status: true } });
  console.log('users remaining:', remaining.length);
  for (const u of remaining) console.log(' -', u.email, '|', u.name, '|', u.role, '|', u.status);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('CLEANUP FAILED:', e.message);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
