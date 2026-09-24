/**
 * What the staff editor actually wrote to the live register.
 *
 *   node hr-verify.cjs show            read the row back
 *   node hr-verify.cjs write-test      attach a small licence document
 *   node hr-verify.cjs revert          put the row back as it was
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STAFF_ID = 'P0857';

(async () => {
  const mode = process.argv[2] || 'show';
  const row = await prisma.driver.findFirst({ where: { staffId: STAFF_ID } });
  if (!row) {
    console.error('record not found:', STAFF_ID);
    process.exit(1);
  }

  if (mode === 'write-test') {
    const dataUrl = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 verification').toString('base64');
    const updated = await prisma.driver.update({
      where: { id: row.id },
      data: { licenseDocument: dataUrl, licenseDocName: 'verification.pdf', licenseDocAt: new Date() },
    });
    console.log('attached:', updated.licenseDocName, 'at', updated.licenseDocAt);
  }

  if (mode === 'revert') {
    await prisma.driver.update({
      where: { id: row.id },
      data: {
        department: null,
        guarantorName: null,
        guarantorPhone: null,
        category: null,
        licenseNumber: null,
        licenseExpiry: null,
        licenseDocument: null,
        licenseDocName: null,
        licenseDocAt: null,
        // The register's own spelling for a man ready to work — the editor had
        // written the screen's word (Available) into the column during the test.
        status: 'Active',
      },
    });
    console.log('reverted', STAFF_ID, 'to the state it was in before the verification');
  }

  const now = await prisma.driver.findFirst({ where: { id: row.id } });
  console.log({
    staffId: now.staffId,
    name: now.name,
    department: now.department,
    status: now.status,
    category: now.category,
    licenseNumber: now.licenseNumber,
    licenseExpiry: now.licenseExpiry,
    guarantorName: now.guarantorName,
    guarantorPhone: now.guarantorPhone,
    licenseDocName: now.licenseDocName,
    hasDoc: Boolean(now.licenseDocument),
  });
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('probe failed:', e.message);
  process.exit(1);
});
