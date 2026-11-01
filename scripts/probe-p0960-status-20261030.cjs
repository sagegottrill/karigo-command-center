const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const truck = await p.truck.findFirst({ where: { registration: { contains: 'JHN506XA' } }, select: { registration: true, status: true } });
  const tail = await p.tail.findFirst({ where: { number: { contains: 'B1002' } }, select: { number: true, status: true } });
  console.log('truck:', truck ? truck.registration + ' -> ' + truck.status : 'not found');
  console.log('tail :', tail ? tail.number + ' -> ' + tail.status : 'not found');
})().then(() => p.$disconnect());
