/**
 * Which live logins hold an HR role — the department portal is guarded on the
 * role, so this says whether the HR shell can be opened at all, and whose
 * record the register is showing.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const users = await prisma.user.findMany({
    select: { email: true, name: true, role: true, roles: true },
  });
  const hr = users.filter((u) => {
    const held = [u.role, ...(Array.isArray(u.roles) ? u.roles : [])].filter(Boolean);
    return held.some((r) => /^(hr|hr & personnel|hr and personnel|personnel)$/i.test(String(r).trim()));
  });
  console.log('users total      :', users.length);
  console.log('holding HR roles :', hr.length);
  for (const u of hr) console.log(' -', u.email, '|', u.name, '|', u.role, '|', JSON.stringify(u.roles));

  const total = await prisma.driver.count();
  const withDept = await prisma.driver.count({ where: { NOT: [{ department: null }, { department: '' }] } });
  // staffId is NOT NULL on the row, so only the empty case is a gap.
  const withSalary = await prisma.driver.count({ where: { staffId: { not: '' } } });
  const withGuarantor = await prisma.driver.count({ where: { NOT: [{ guarantorName: null }, { guarantorName: '' }] } });
  const withDoc = await prisma.driver.count({ where: { NOT: [{ licenseDocument: null }, { licenseDocument: '' }] } });
  console.log(`drivers ${total} · ${withSalary} with a payroll number · ${withDept} with a department · ${withGuarantor} with a guarantor · ${withDoc} with a licence document`);
  const sample = await prisma.driver.findMany({
    select: { staffId: true, name: true, department: true, status: true, licenseNumber: true },
    take: 5,
    orderBy: { createdAt: 'desc' },
  });
  for (const d of sample) console.log(' ·', d.staffId, '|', d.name, '|', d.department || '(no dept)', '|', d.status, '|', d.licenseNumber || '(no licence)');
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('probe failed:', e.message);
  process.exit(1);
});
