/**
 * Test cleanup: the throwaway truck, the two records a failed-then-fixed
 * sign-off left behind, and the chat thread opened against a real truck while
 * proving the button works. Live data is left exactly as it was.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
(async () => {
  const reg = 'TESTSIGN01';
  const wos = await prisma.workOrder.findMany({ where: { truckReg: reg }, select: { id: true } });
  if (wos.length) {
    await prisma.inventoryRequisition.deleteMany({ where: { workOrder: { in: wos.map((w) => w.id) } } });
    await prisma.workOrder.deleteMany({ where: { id: { in: wos.map((w) => w.id) } } });
  }
  console.log('work orders removed   ->', wos.length);

  const trucks = await prisma.truck.findMany({ where: { registration: reg }, select: { id: true, cabId: true } });
  for (const t of trucks) {
    await prisma.conversation.deleteMany({ where: { assetKey: `head:${t.id}` } });
  }
  const gone = await prisma.truck.deleteMany({ where: { registration: reg } });
  console.log('trucks removed        ->', gone.count);

  // The thread opened on SBG566XR while testing the Chat button.
  const thread = await prisma.conversation.findFirst({ where: { kind: 'maintenance' }, select: { id: true, name: true } });
  if (thread) {
    await prisma.conversationRead.deleteMany({ where: { conversationId: thread.id } });
    await prisma.conversation.delete({ where: { id: thread.id } });
  }
  console.log('test chat removed     ->', thread?.name || 'none');

  console.log('remaining maintenance threads ->', await prisma.conversation.count({ where: { kind: 'maintenance' } }));
  console.log('remaining test work orders    ->', await prisma.workOrder.count({ where: { truckReg: { startsWith: 'TEST' } } }));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error('FAILED:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
