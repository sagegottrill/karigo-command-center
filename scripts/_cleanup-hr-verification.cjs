/**
 * The alerts the HR verification left behind.
 *
 * Onboarding a test staff member and attaching a test licence document each
 * fired a real alert into the department's notification centre. The RECORDS have
 * been reverted, so the two alerts now point at a person who does not exist and
 * a document that is no longer on file — exactly the kind of stale row that
 * makes a staff register untrustworthy.
 *
 *   node hr-cleanup.cjs           list what would go
 *   node hr-cleanup.cjs --apply   remove them
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const apply = process.argv.includes('--apply');
  const doomed = await prisma.notification.findMany({
    where: {
      OR: [
        { title: 'Licence Document Attached', refLabel: 'P0857' },
        { title: 'New Staff Onboarded', body: { contains: 'HR Verification Staff' } },
      ],
    },
    select: { id: true, title: true, body: true, time: true, createdAt: true },
  });

  console.log(`${doomed.length} verification alert(s) found`);
  for (const n of doomed) console.log(' ·', n.title, '|', n.body.slice(0, 90));

  if (apply && doomed.length) {
    const removed = await prisma.notification.deleteMany({ where: { id: { in: doomed.map((n) => n.id) } } });
    console.log('removed:', removed.count);
  } else if (!apply) {
    console.log('(dry run — pass --apply to remove)');
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('cleanup failed:', e.message);
  process.exit(1);
});
